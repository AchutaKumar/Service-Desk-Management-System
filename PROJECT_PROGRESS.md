# PROJECT_PROGRESS — ServiceDesk (IT Service Request & Ticket Management System)

> Last updated: 2026-10-11 (session 3 — "React frontend: complete UI + verified workflows")
> Read this file first. Do not redo work already marked complete.

---

## 1. Purpose & Technology Stack

Internal IT Service Desk: employees submit tickets, support agents resolve them within
SLA deadlines, admins manage users/categories/departments and view reports.

**Stack:**

| Layer | Technology |
|---|---|
| Framework | Django 5.1.4 + Django REST Framework 3.15.2 |
| Auth | JWT (djangorestframework-simplejwt 5.3.1, refresh-token rotation + blacklist) |
| API docs | drf-spectacular (Swagger UI at `/api/docs/`) |
| Filtering | django-filter 24.3 |
| DB (dev) | SQLite `backend/db.sqlite3` (settings: `config/settings/development.py`) |
| DB (prod) | MySQL via PyMySQL (settings: `config/settings/base.py` — **untested here**) |
| Env config | python-decouple (`backend/.env`, template in `.env.example`) |
| Python | 3.14.3, venv at `backend/venv` (works on this machine) |
| CORS | django-cors-headers, allows `http://localhost:5173` (planned Vite/React frontend) |
| **Frontend** | React 19 + Vite 7 (`frontend/`), JS/JSX, React Router 7, Axios, Tailwind CSS v4, lucide-react, recharts, react-hot-toast |

All API responses use the standard envelope:
`{"success": bool, "message": str, "data": {...}}` or
`{"success": false, "message": str, "errors": {...}}` (see `backend/common/responses.py`;
paginated lists add `count/next/previous/total_pages/current_page/results`).

## 2. Completed Features (verified working)

- **Auth** (`/api/auth/`): register, login (JWT w/ role claims), logout (refresh blacklist),
  token refresh, get/update own profile, password change, password reset (email token flow).
- **User management** (`/api/users/`, admin-only): list/create/update users, activate/deactivate,
  list support agents. Role-based filtering on every list endpoint.
- **Departments & Categories** (`/api/departments/`, `/api/categories/`): CRUD (admin write),
  categories include nested subcategories (`/{id}/subcategories/`).
- **Tickets** (`/api/tickets/`): the core module.
  - Auto-generated ticket IDs (`SR-1001`…), role-filtered list (employee=own, agent=assigned+unassigned
    OPEN, admin=all), search, filters (`status`, `priority__name`, `category`, `department`,
    `assigned_to`, `created_by`, date ranges, `is_overdue`), ordering, pagination.
  - SLA: `due_at` computed from priority `sla_hours`; `sla_status` (WITHIN_SLA / NEAR_SLA /
    OVERDUE / RESOLVED_WITHIN_SLA / RESOLVED_AFTER_SLA); priorities with configurable SLA hours.
  - Workflow state machine: OPEN → ASSIGNED → IN_PROGRESS ⇄ WAITING_FOR_USER → RESOLVED →
    CLOSED / REOPENED (invalid transitions rejected with 400).
  - Auto-assignment to the least-busy active agent on creation.
  - Comments (edit/delete own), attachments (type + 10MB size validation, safe UUID paths),
    immutable audit history (CREATED / STATUS_CHANGED / ASSIGNED / REASSIGNED / RESOLVED / …).
  - Bulk actions (admin): bulk_assign, bulk_status, bulk_close.
- **Notifications** (`/api/notifications/`): in-app notifications for create/assign/status/comment,
  list + unread count, mark read, mark all read.
- **Dashboards** (`/api/dashboard/{employee,agent,admin}/`): aggregated stats in single queries
  (counts by status, recent tickets, near-SLA, agent workload, urgent tickets, breakdowns).
- **Reports** (`/api/reports/`, admin-only): by status/priority/category/department, agent workload,
  SLA performance (compliance %), overdue tickets; date presets `today|last7|last30|custom`.
- **Seed data**: `python manage.py seed_data` (priorities, 6 departments, 6 categories + 34
  subcategories, 3 demo users).

## 3. Where the Previous Session Stopped (now resolved)

Evidence: `db.sqlite3` had **zero tables** (`list_tables.py` was a debug script for this),
models had drifted ahead of migrations (`TicketAttachment.filename→original_filename`,
`TicketComment.body→content`, new `Priority` model, new `accounts.User` fields, …), and
`makemigrations` aborted on an interactive rename question. The API code was written but the
database had never been migrated/seeded.

**Session 2 fixed exactly that** — no features were rewritten.

## 4. Files Created / Modified in Session 2

Created:
- `backend/tickets/migrations/0002_priority_alter_ticketattachment_options_and_more.py`
- `backend/categories/migrations/0002_subcategory_alter_agentcategory_unique_together_and_more.py`
  (hand-patched: `RemoveIndex` for both `agentcategory` indexes **before** the `RemoveField`s —
  SQLite rebuilds the table and would otherwise render stale Meta indexes → `FieldDoesNotExist`)
- `backend/departments/migrations/0002_remove_department_departments_is_acti_51d68f_idx_and_more.py`
- `backend/accounts/migrations/0002_delete_department_alter_user_options_and_more.py`
  (deletes the old duplicate `accounts.Department` model → now only `departments.Department`)
- `backend/notifications/migrations/0002_remove_notification_notificatio_recipie_4e3567_idx_and_more.py`
- `backend/dashboard/__init__.py`, `backend/reports/__init__.py` (were namespace packages)

Modified:
- `backend/common/permissions.py` — added missing `SAFE_METHODS` import (NameError if `ReadOnly` used)
- `backend/tickets/management/commands/seed_data.py` — force UTF-8 stdout on Windows
  (`_ensure_utf8_output()`); the `✓`/`↳` glyphs crashed the command under cp1252

Database: `backend/db.sqlite3` fully migrated + seeded (idempotent — safe to re-run `seed_data`).

## 5. Verification Done (session 2)

- `manage.py check` → 0 issues; `manage.py makemigrations --check` → "No changes detected".
- `manage.py migrate` → all migrations applied; `seed_data` → 4 priorities, 6 departments,
  6 categories/34 subcategories, 3 demo users.
- End-to-end HTTP smoke test against `runserver` (all API checks passing): login for all 3 roles,
  `/api/auth/me/`, departments/categories/priorities, ticket create (auto-assigned to agent,
  `due_at` set from SLA), ticket detail/list/search, agent notifications, status workflow
  IN_PROGRESS→RESOLVED (and invalid transition correctly 400), comment create, employee close,
  permission denials (employee→reports 403, employee→foreign status change 403,
  cross-user notification read 404), all 3 dashboards, SLA + overdue reports, admin user list,
  notification read-all + mark-read, token refresh. Logout w/ blacklist verified separately with a
  fresh token pair (a *rotated* refresh token is correctly rejected with 400 — by design).

## 5b. Frontend — built & verified (session 3)

A complete React SPA now exists at `frontend/`. It talks to the same Django API through the
Vite dev proxy (`/api` → `127.0.0.1:8000`), so no CORS config or hardcoded URLs are needed.

**Files created (all new; no existing files were modified):**

- `frontend/package.json`, `vite.config.js` (dev proxy + vendor/charts chunk splitting), `index.html` (Inter font), `.env.example`, `.gitignore`
- `frontend/src/index.css` — design tokens (Tailwind v4 `@theme`): deep-navy chrome, brand-blue
  primary, teal accent, semantic success/warning/danger; reduced-motion support.
- `frontend/src/main.jsx`, `App.jsx` — router + providers + toast defaults
- `frontend/src/api/client.js` — axios instance, JWT attach, **single-flight refresh on 401**, error normalization
- `frontend/src/api/index.js` — one service function per backend endpoint group
- `frontend/src/context/AuthContext.jsx` — session bootstrap via `/auth/me/`, login/logout/roles
- `frontend/src/utils/constants.js` (status/SLA/priority/role → label + color classes; chart
  palette) and `format.js` (dates, relative time, "5h 20m left" countdowns)
- `frontend/src/components/` — `ui/` (Button, Form fields, Card/StatCard, Chips, Table, Modal +
  ConfirmDialog, States (loading/empty/error), Pagination, PageHeader), `layout/` (Sidebar,
  Topbar w/ notifications bell + 60s poll, AppLayout), `auth/RouteGuards.jsx`
- `frontend/src/pages/` — auth (Login, Register, ForgotPassword, ResetPassword), dashboards
  (role-switched Employee/Agent/Admin with recharts), tickets (list w/ filters + admin bulk
  assign/close, create w/ category→subcategory cascade + SLA preview, detail w/ workflow
  actions, comments, attachment upload, audit timeline), NotificationsPage, ProfilePage,
  admin (Users, Categories + subcategories, Departments, Priorities/SLA, Reports w/ range picker
  + charts + CSV export of overdue list)
- `frontend/scripts/e2e-smoke.mjs` — Chrome-CDP driven UI test (26 checks; **self-contained**:
  auto-detects the dev-server port and launches/cleans up its own headless Chrome)

**Design direction:** professional operations console — navy sidebar chrome, white surfaces,
blue-600 primary actions, restrained shadows, 8px radii, tabular numerals in tables. Status and
SLA states are shown as text chips (never color alone).

## 6. Current Status & Next Task

**Backend: complete. Frontend: complete and workflow-verified.** Sensible next steps:

1. Add real backend unit/API tests (`pytest` + DRF `APIClient`); stubs exist but are empty.
2. Optional backend extras: paginated notifications (currently capped at 50), SMTP email.
3. Frontend polish: code-split routes with `React.lazy`, add Playwright-based visual tests,
   dark-mode, i18n — only if wanted.
4. Deploy prep: `python manage.py collectstatic`, serve `frontend/dist` from Django or any
   static host, set `VITE_API_BASE_URL` to the deployed API, switch `DJANGO_ENV=production`.

## 5c. Frontend verification (session 3)

- `npm run build` → clean; chunks: vendor 113 kB, app 340 kB, charts 398 kB (gzip 41/99/115 kB).
- Dev server + API proxy confirmed: `POST /api/auth/login/` through the Vite proxy returns a
  real JWT envelope.
- **Headless-Chrome DOM render check** (`--dump-dom`): `/login` renders the full form (52 kB DOM).
- **`npm run e2e` → 26/26 checks pass (exit 0).** It drives real clicks through
  Chrome DevTools Protocol against the running dev server + backend:
  - Auto-detects the dev server (probes 5173–5176 for the Vite shell) and starts its own
    headless Chrome on CDP :9222 (or reuses one already running), cleaning up afterwards.
  - Guest pages (login/register/forgot-password) render; `/tickets` correctly redirects a guest
    to `/login`.
  - Employee: logs in **through the actual form**, dashboard greets "Hello, Jane" + shows stats,
    ticket list shows the seeded `SR-…` tickets, new-ticket form renders, ticket detail shows
    Conversation + History, notifications + profile render, `/users` correctly shows
    "Access restricted".
  - Admin: logs in through the form, dashboard renders metrics **and recharts SVG charts**,
    Users page lists seeded users, Categories shows Hardware/Software, Departments shows
    "IT Department", Priorities shows "hours to resolve", Reports renders with 4 charts.
  - **No uncaught page exceptions** across all flows.

## 7. Known Bugs / Pending Issues / Cleanup Candidates

Frontend:
- **Port 5173 zombie gotcha (hit during session 3):** stale `node.exe` processes from earlier
  runs can keep 5173 bound, making `vite` auto-increment to 5174 *without* the proxy working
  (API calls then 404). Symptom: pages render but every request through the dev server 404s.
  Fix: `netstat -ano | grep :5173`, kill the stale PIDs, restart with `vite --port 5173
  --strictPort` so it fails loudly instead of jumping ports.
- E2E script needs a running backend + dev server; Chrome is launched automatically (or set
  `CHROME_PATH` / run Chrome yourself with `--remote-debugging-port=9222`). It shares one
  Chrome profile, so it force-clears tokens before each login.
- `React.lazy` route-splitting not applied (single bundle per group is fine at this size).
- No automated visual/screenshot tests; the CDP script asserts DOM text, not pixels.

Backend:

- `backend/config/settings.py` — **legacy file superseded by the `config/settings/` package**
  (the package wins on import). Delete it once confirmed nothing references it.
- `backend/accounts/managers.py` — unused legacy `UserManager` (different signature than the
  live one in `accounts/models.py`). Dead code; remove later.
- `backend/tickets/models_priority.py` — empty leftover file. Remove later.
- `backend/common/response.py` — unused legacy response helpers (live module is `responses.py`).
- `common/permissions.py::ReadOnly` — fixed import, but still unused anywhere.
- `dashboard`/`reports` have no `apps.py`/models/tests (views-only apps — works fine).
- MySQL (base.py) path has never been exercised in this environment; dev runs SQLite.
- Unit tests are empty stubs (`*/tests.py`); `pytest`/`factory-boy`/`Faker` are in
  `requirements.txt` but not wired up (no `pytest.ini`). Worth adding real tests next.
- `get_sla_status()` assumes `closed_at` is set for CLOSED tickets (true via the API views;
  direct ORM edits could raise).
- Seeded demo passwords are dev-only credentials — never seed in production.

## 8. Commands

```bash
cd backend
# one-time setup (venv already exists — Python 3.14):
venv\Scripts\pip install -r requirements.txt      # or: python -m venv venv
python manage.py migrate
python manage.py seed_data                        # idempotent

# run
python manage.py runserver                        # http://localhost:8000
# Swagger UI:  http://localhost:8000/api/docs/
# OpenAPI:     http://localhost:8000/api/schema/

# checks
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py seed_data --reset                # wipe + re-seed reference data (dev only)
```

Frontend (`frontend/`):

```bash
cd frontend
npm install                 # one-time
npm run dev                 # http://127.0.0.1:5173; proxies /api → :8000
npm run build               # production build → dist/
npm run preview             # serve the production build
npm run e2e                 # E2E UI smoke: needs backend :8000 + this dev server running;
                            # auto-launches headless Chrome (26 checks, exit 0 = pass)
```

Run both together for local dev: backend on `:8000`, frontend on `:5173`.

Demo login (after `seed_data`):

| Role | Email | Password |
|---|---|---|
| Admin | admin@servicedesk.com | Admin@1234 |
| Agent | agent@servicedesk.com | Agent@1234 |
| Employee | employee@servicedesk.com | Employee@1234 |

## 9. Key Technical Decisions (keep these)

- **Email is the login field** (`AUTH_USER_MODEL = accounts.User`, `USERNAME_FIELD = 'email'`).
- **Role is stored on the user** (`EMPLOYEE | SUPPORT_AGENT | ADMIN`) and embedded in the JWT
  (`role`, `email`, `full_name`, `is_active` claims) so the frontend can route immediately.
- **Business logic lives in `tickets/services.py`** (SLA calc, auto-assign, history logging,
  notifications); views stay thin. Reuse these services for new ticket features.
- **Every important ticket action writes a `TicketHistory` row** — the audit log is append-only.
- **Permissions**: role checks in `accounts/permissions.py` (IsAdmin, IsSupportAgent,
  IsEmployee, IsAdminOrAgent), object-level checks in `tickets/permissions.py`. List views
  filter by role in `TicketListCreateView.get_queryset` rather than only denying access.
- **Settings package** selects dev/prod via `DJANGO_ENV` env var; never edit the legacy
  `config/settings.py`.
- Migrations were hand-patched once (categories 0002). If SQLite + `RemoveField` ever fails
  again with a `FieldDoesNotExist` on a stale index, apply the same pattern: `RemoveIndex`
  before `RemoveField`.
- **Frontend talks to the API only through `src/api/`** — never call `fetch`/`axios` directly
  from components; add a service function in `src/api/index.js` instead.
- **The axios client owns auth**: components must not read/write tokens or handle 401s; the
  single-flight refresh interceptor in `client.js` already covers that.
- **Status/SLA/priority display lives in `utils/constants.js`** (label + Tailwind classes);
  add new statuses there so chips stay consistent everywhere.
- **Vite binds IPv4 explicitly** (`vite.config.js` → `server.host: '127.0.0.1'` + `strictPort`).
  On this Windows box the default bound only IPv6 `[::1]`, so browsers resolving `localhost`
  to `127.0.0.1` hit "connection refused" (curl to IPv4 returned 000) even though the terminal
  printed a URL. **Don't remove `host`/`strictPort`** — without them the dev server silently
  moves to 5174 and the URL the user opens is stale/broken. Open **http://127.0.0.1:5173/**.
- Dev proxy (`vite.config.js`) targets `127.0.0.1:8000`; change it if the backend moves.
