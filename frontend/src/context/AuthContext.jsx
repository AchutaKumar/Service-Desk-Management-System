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
      try {
        const { data } = await authApi.me();
        if (!cancelled) setUser(data.data);
      } catch {
        tokenStore.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    bootstrap();
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
