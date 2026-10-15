import axios from 'axios';

/**
 * Central axios instance.
 * - Base URL comes from env; empty in dev (Vite proxies /api to Django).
 * - Access token is attached to every request.
 * - On 401, one refresh attempt is made (single-flight: concurrent 401s
 *   share the same refresh request), then the original request is retried.
 * - If refresh fails, tokens are cleared and the user is sent to /login.
 */
let rawBaseURL = (import.meta.env.VITE_API_BASE_URL || '/api').trim();
if (rawBaseURL && rawBaseURL.startsWith('http') && !rawBaseURL.endsWith('/api') && !rawBaseURL.endsWith('/api/')) {
  rawBaseURL = `${rawBaseURL.replace(/\/+$/, '')}/api`;
}
const baseURL = rawBaseURL;

const ACCESS_KEY = 'sd_access';
const REFRESH_KEY = 'sd_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  setAccess(access) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({ baseURL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

async function refreshTokens() {
  const refresh = tokenStore.refresh;
  if (!refresh) throw new Error('No refresh token');
  const { data } = await axios.post(`${baseURL}/auth/token/refresh/`, { refresh });
  // TokenRefreshView returns a plain { access } object (not the success envelope)
  const access = data.access ?? data?.data?.access;
  tokenStore.setAccess(access);
  return access;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = original.url || '';

    const isAuthEndpoint =
      url.includes('/auth/login') || url.includes('/auth/token/refresh') || url.includes('/auth/logout');

    if (status === 401 && !original._retry && !isAuthEndpoint && tokenStore.refresh) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise || refreshTokens();
        const access = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extract a human-readable message from any API error.
 * The Django backend uses { success, message, errors } envelopes.
 */
export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (data?.errors && typeof data.errors === 'object') {
    const parts = [];
    for (const [field, value] of Object.entries(data.errors)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      parts.push(`${field === 'non_field_errors' ? '' : field + ': '}${text}`);
    }
    if (parts.length) return parts.join(' ');
  }
  if (error?.message === 'Network Error') {
    return 'Cannot reach the server. Please check your connection.';
  }
  return fallback;
}

export default api;
