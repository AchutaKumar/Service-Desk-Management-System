import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api';
import { tokenStore } from '../api/client';

const AuthContext = createContext(null);

/**
 * Holds the current user session.
 * - On mount, if a token exists, the profile is fetched from /auth/me/.
 * - login() stores tokens (persisted in localStorage) and profile.
 * - logout() blacklists the refresh token and clears local state.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!tokenStore.refresh || !!tokenStore.access);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!tokenStore.access && !tokenStore.refresh) {
        setBooting(false);
        return;
      }
      // Retry transient server failures a couple of times before giving up,
      // so a brief backend hiccup doesn't tear down an otherwise valid session.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await authApi.me();
          if (!cancelled) setUser(data.data);
          return;
        } catch (err) {
          const status = err?.response?.status;
          const transient = !status || status >= 500;
          if (!transient) {
            // Definitive auth failure (401/403): the stored session is invalid.
            tokenStore.clear();
            if (!cancelled) setUser(null);
            return;
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          // Server is down/unreachable — keep tokens (do not destroy the
          // session over a 5xx) and finish booting without a user.
          if (!cancelled) setUser(null);
        }
      }
    }
    bootstrap().finally(() => {
      if (!cancelled) setBooting(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login(email, password);
    const payload = data.data || {};
    tokenStore.set(payload.access, payload.refresh);
    // Fetch the full profile (login only returns a compact user object)
    const me = await authApi.me();
    setUser(me.data.data);
    return me.data.data;
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh;
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      // Token may already be invalid — clear locally regardless
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      login,
      logout,
      refreshUser: async () => {
        const { data } = await authApi.me();
        setUser(data.data);
        return data.data;
      },
      isAuthenticated: !!user,
      isAdmin: user?.role === 'ADMIN',
      isAgent: user?.role === 'SUPPORT_AGENT',
      isEmployee: user?.role === 'EMPLOYEE',
    }),
    [user, booting, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
