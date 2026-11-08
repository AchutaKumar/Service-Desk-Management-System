import { tokenStore } from './client';

/**
 * Returns the WebSocket URL for a given path, respecting:
 * - VITE_WS_BASE_URL (if explicitly configured)
 * - VITE_API_BASE_URL (converting http/https to ws/wss)
 * - Current window.location host and protocol (standard Vite proxy or prod)
 */
export function getWebSocketUrl(path) {
  const token = tokenStore.access;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 1. Explicit WS base URL override
  const wsEnv = import.meta.env.VITE_WS_BASE_URL;
  if (wsEnv) {
    const base = wsEnv.replace(/\/+$/, '');
    const url = `${base}${cleanPath}`;
    return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
  }

  // 2. Derive from VITE_API_BASE_URL if it's an absolute URL
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
    const parsed = new URL(apiBase);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProto}//${parsed.host}${cleanPath}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  }

  // 3. In dev mode (e.g. Vite on port 5173): connect directly to Django backend (127.0.0.1:8000)
  // to avoid Vite dev-proxy WebSocket upgrade drops and timeouts
  if (import.meta.env.DEV && window.location.port !== '8000') {
    const url = `ws://127.0.0.1:8000${cleanPath}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  }

  // 4. Same-origin default (production behind reverse proxy / Nginx / Daphne)
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${wsProto}//${window.location.host}${cleanPath}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

