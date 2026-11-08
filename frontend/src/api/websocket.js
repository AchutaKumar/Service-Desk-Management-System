import { tokenStore } from './client';

/**
 * Checks if WebSockets are supported on the current deployment.
 * Vercel Serverless Functions do not support persistent WebSockets.
 * If deployed on Vercel without an external WS URL (VITE_WS_BASE_URL),
 * we gracefully return false so the chat can use high-speed real-time auto-sync.
 */
export function isWebSocketSupported() {
  const wsEnv = import.meta.env.VITE_WS_BASE_URL;
  if (wsEnv) return true;

  // If on Vercel and no external WS URL is configured, serverless cannot host WebSockets
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')) {
    return false;
  }

  return true;
}

/**
 * Returns the WebSocket URL for a given path, respecting:
 * - VITE_WS_BASE_URL (if explicitly configured, e.g. wss://backend.onrender.com)
 * - VITE_API_BASE_URL (converting http/https to ws/wss)
 * - Current window.location host and protocol (standard Vite proxy or prod)
 */
export function getWebSocketUrl(path) {
  if (!isWebSocketSupported()) return null;

  const token = tokenStore.access;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 1. Explicit WS base URL override (e.g. wss://backend.onrender.com)
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

  // 3. Same-origin default:
  // - On laptop: ws://localhost:5173/ws/... (proxied by Vite to Daphne)
  // - On mobile over Wi-Fi: ws://<laptop-lan-ip>:5173/ws/... (proxied by Vite to Daphne)
  // - In production behind reverse proxy: wss://<domain>/ws/...
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${wsProto}//${window.location.host}${cleanPath}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}
