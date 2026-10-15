/**
 * End-to-end UI smoke test driven through Chrome DevTools Protocol.
 *
 * Starts against a running Vite dev server (default http://127.0.0.1:5174)
 * and a running Django backend (proxied via /api). Logs in through the real
 * login form and asserts the rendered DOM of each page.
 *
 * Usage:
 *   1. Start backend:  cd backend  && python manage.py runserver 8000
 *   2. Start frontend: cd frontend && npm run dev
 *   3. npm run e2e                            (auto-launches headless Chrome)
 *
 * BASE is auto-detected by probing dev-server ports (5173, 5174, …) unless set.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function detectBase() {
  if (process.env.BASE) return process.env.BASE;
  for (const port of [5173, 5174, 5175, 5176]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' });
      // Vite dev server for this app injects /@vite/client and mounts #root
      if (res.ok) {
        const html = await res.text();
        if (html.includes('/@vite/client') && html.includes('id="root"')) {
          return `http://127.0.0.1:${port}`;
        }
      }
    } catch { /* port not ours — keep probing */ }
  }
  throw new Error('No Vite dev server found on ports 5173–5176. Start it with `npm run dev`.');
}

let BASE;
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const CDP_PORT = CDP_HTTP.split(':').pop();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ── Minimal CDP client (Node 24 has global WebSocket + fetch) ──────── */
class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(
          msg.params.exceptionDetails?.exception?.description ||
            msg.params.exceptionDetails?.text ||
            'unknown exception'
        );
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  }
  async navigate(url) {
    await this.send('Page.navigate', { url });
    // Wait for load + React mount (root populated)
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      const ready = await this.evaluate(
        `document.readyState === 'complete' && document.getElementById('root')?.hasChildNodes()`
      ).catch(() => false);
      if (ready) return;
    }
  }
  /** Poll until an expression returns true (or timeout). */
  async waitFor(expression, timeoutMs = 10000, intervalMs = 300) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.evaluate(expression).catch(() => false);
      if (ok) return true;
      await sleep(intervalMs);
    }
    return false;
  }
  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function newTab(url = 'about:blank') {
  const res = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Failed to create tab: ${res.status}`);
  const target = await res.json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  cdp.targetId = target.id;
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

async function closeTab(id) {
  await fetch(`${CDP_HTTP}/json/close/${id}`, { method: 'PUT' }).catch(() => {});
}

async function getTabs() {
  const res = await fetch(`${CDP_HTTP}/json`);
  return res.json();
}

/* ── UI helpers ─────────────────────────────────────────────────────── */
async function uiLogin(cdp, email, password) {
  // Tabs share one profile — force a clean guest session first
  await cdp.navigate(`${BASE}/login`);
  await cdp.evaluate(`localStorage.removeItem('sd_access'); localStorage.removeItem('sd_refresh'); true`);
  await cdp.navigate(`${BASE}/login`);
  // Wait for the form to actually mount before typing
  const mounted = await cdp.waitFor(`!!document.getElementById('login-email') && !!document.getElementById('login-password')`, 15000);
  if (!mounted) throw new Error('Login form did not mount within 15s');
  await cdp.evaluate(`
    (() => {
      function setNative(el, value) {
        const setter = Object.getOwnPropertyDescriptor(
          el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
          'value'
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setNative(document.getElementById('login-email'), ${JSON.stringify(email)});
      setNative(document.getElementById('login-password'), ${JSON.stringify(password)});
      return true;
    })()
  `);
  await cdp.evaluate(`document.querySelector('button[type=submit]').click(); true`);
  // Wait for redirect to dashboard
  await cdp.waitFor(`location.pathname === '/'`, 15000, 400);
  return cdp.evaluate('location.pathname');
}

async function pageText(cdp) {
  return cdp.evaluate('document.body.innerText');
}

/* ── Chrome lifecycle (self-contained) ──────────────────────────────── */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

async function ensureCdp() {
  try {
    const res = await fetch(`${CDP_HTTP}/json/version`);
    if (res.ok) return null; // an external Chrome CDP is already running
  } catch { /* not running — fall through */ }

  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      'Chrome not found. Start it manually with --remote-debugging-port=' +
        `${CDP_PORT}, or set CHROME_PATH.`
    );
  }
  const profile = mkdtempSync(join(tmpdir(), 'sd-e2e-'));
  const child = spawn(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore', detached: false });
  // Wait for the CDP endpoint
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const res = await fetch(`${CDP_HTTP}/json/version`);
      if (res.ok) return { child, profile };
    } catch { /* not up yet */ }
  }
  throw new Error(`Chrome did not expose CDP on ${CDP_HTTP} within 12s.`);
}

/* ── Main ───────────────────────────────────────────────────────────── */
async function main() {
  BASE = await detectBase();
  console.log(`E2E smoke against ${BASE}\n`);
  const chromeProc = await ensureCdp();

  // 1. Guest page renders (force clean session — profile may hold a token)
  let tab = await newTab();
  await tab.navigate(`${BASE}/login`);
  await tab.evaluate(`localStorage.removeItem('sd_access'); localStorage.removeItem('sd_refresh'); true`);
  await tab.navigate(`${BASE}/login`);
  await tab.waitFor(`document.body.innerText.includes('Sign in to ServiceDesk')`);
  let text = await pageText(tab);
  record('Login page renders', text.includes('Sign in to ServiceDesk'));

  await tab.navigate(`${BASE}/register`);
  await tab.waitFor(`document.body.innerText.includes('Create your account')`);
  text = await pageText(tab);
  record('Register page renders', text.includes('Create your account'));

  await tab.navigate(`${BASE}/forgot-password`);
  await tab.waitFor(`document.body.innerText.includes('Reset your password')`);
  text = await pageText(tab);
  record('Forgot-password page renders', text.includes('Reset your password'));

  // Protected route redirects guests to /login
  await tab.navigate(`${BASE}/tickets`);
  await tab.waitFor(`location.pathname === '/login'`, 8000, 300);
  let path = await tab.evaluate('location.pathname');
  record('Guest redirected from /tickets to /login', path === '/login', path);

  // 2. Employee flow — real form login
  path = await uiLogin(tab, 'employee@servicedesk.com', 'Employee@1234');
  record('Employee login via form lands on /', path === '/', path);

  await tab.waitFor(`document.body.innerText.includes('Hello, Jane')`, 10000);
  await tab.waitFor(`document.body.innerText.includes('Total tickets')`, 10000);
  text = await pageText(tab);
  record('Employee dashboard shows greeting', text.includes('Hello, Jane'), text.slice(0, 60).replace(/\n/g, ' '));
  record('Employee dashboard shows ticket stats', /Total tickets/i.test(text));

  await tab.navigate(`${BASE}/tickets`);
  await tab.waitFor(`document.body.innerText.includes('SR-')`, 10000);
  text = await pageText(tab);
  record('Employee ticket list shows seeded tickets', text.includes('SR-1'), 'expected SR-xxxx rows');
  record('Employee ticket list header', text.includes('My tickets'));

  await tab.navigate(`${BASE}/tickets/new`);
  await sleep(500);
  text = await pageText(tab);
  record('New ticket form renders', text.includes('Submit a new request'));

  await tab.navigate(`${BASE}/tickets/2`);
  await tab.waitFor(`document.body.innerText.includes('Conversation')`, 10000);
  text = await pageText(tab);
  record('Ticket detail renders conversation', text.includes('Conversation'));
  record('Ticket detail renders history', text.includes('History'));
  record('Ticket detail shows ticket id', text.includes('SR-'));

  await tab.navigate(`${BASE}/notifications`);
  await sleep(600);
  text = await pageText(tab);
  record('Notifications page renders', text.includes('Notifications'));

  await tab.navigate(`${BASE}/profile`);
  await sleep(600);
  text = await pageText(tab);
  record('Profile page renders', text.includes('My profile'));

  // Employee must not see admin pages
  await tab.navigate(`${BASE}/users`);
  await sleep(700);
  text = await pageText(tab);
  record('Employee blocked from /users', text.includes('Access restricted'));

  const employeeExceptions = [...tab.exceptions];
  await closeTab(tab.targetId);

  // 3. Admin flow
  tab = await newTab();
  path = await uiLogin(tab, 'admin@servicedesk.com', 'Admin@1234');
  record('Admin login via form lands on /', path === '/', path);
  await tab.waitFor(`document.body.innerText.includes('System overview')`, 12000);
  const hasChart = await tab.waitFor(`!!document.querySelector('.recharts-wrapper')`, 12000);
  text = await pageText(tab);
  record('Admin dashboard renders metrics', text.includes('System overview'));
  record('Admin dashboard renders charts (recharts SVG)', hasChart);

  await tab.navigate(`${BASE}/users`);
  await tab.waitFor(`document.body.innerText.includes('admin@servicedesk.com')`, 10000);
  text = await pageText(tab);
  record('Users page lists seeded users', text.includes('User management') && text.includes('admin@servicedesk.com'));

  await tab.navigate(`${BASE}/categories`);
  await sleep(800);
  text = await pageText(tab);
  record('Categories page lists seeded categories', text.includes('Hardware') && text.includes('Software'));

  await tab.navigate(`${BASE}/departments`);
  await sleep(800);
  text = await pageText(tab);
  record('Departments page lists seeded departments', text.includes('IT Department'));

  await tab.navigate(`${BASE}/priorities`);
  await sleep(800);
  text = await pageText(tab);
  record('Priorities page lists SLA targets', text.includes('Priorities & SLA') && text.includes('hours to resolve'));

  await tab.navigate(`${BASE}/reports`);
  await tab.waitFor(`document.body.innerText.includes('SLA compliance')`, 15000);
  await sleep(1500); // let recharts finish drawing
  text = await pageText(tab);
  record('Reports page renders', text.includes('Reports') && text.includes('SLA compliance'));
  const reportCharts = await tab.evaluate(`document.querySelectorAll('.recharts-wrapper').length`);
  record('Reports page renders charts', reportCharts >= 2, `${reportCharts} chart(s)`);

  const adminExceptions = tab.exceptions;
  await closeTab(tab.targetId);

  // 4. Console exception summary
  const allExceptions = [...employeeExceptions, ...adminExceptions];
  record(
    'No uncaught page exceptions during flows',
    allExceptions.length === 0,
    allExceptions.slice(0, 2).join(' | ').slice(0, 200)
  );

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  const failed = results.filter((r) => !r.ok);
  cleanup(chromeProc);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(` - ${f.name} ${f.detail}`));
    process.exit(1);
  }
  process.exit(0);
}

function cleanup(chromeProc) {
  if (!chromeProc) return;
  try { chromeProc.child.kill(); } catch { /* already gone */ }
  try { rmSync(chromeProc.profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((e) => {
  console.error('E2E harness error:', e.message);
  process.exit(1);
});
