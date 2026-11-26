import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { disablePushForLogout } from '../hooks/usePush';

const AuthContext = createContext(null);

export function homeFor(role) {
  return role === 'elder' ? '/elder' : '/carer';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Explicit logout also stops this browser's push alerts (shared phones). An expired token
  // (401) only clears the session: an elder's dose alarms keep working until they log out.
  const logout = useCallback(() => {
    disablePushForLogout().finally(clearSession);
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (!getToken()) {
      setReady(true);
      return;
    }
    api('/me', { timeoutMs: 90000 })
      .then(setUser)
      .catch(() => {
        /* 401 handled by logout; network errors keep token for retry */
      })
      .finally(() => setReady(true));
  }, [clearSession]);

  const finish = useCallback((data) => {
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(
    async (email, password) =>
      finish(await api('/auth/login', { method: 'POST', json: { email, password }, auth: false, timeoutMs: 90000 })),
    [finish],
  );

  const register = useCallback(
    async (form) =>
      finish(await api('/auth/register', { method: 'POST', json: form, auth: false, timeoutMs: 90000 })),
    [finish],
  );

  const refresh = useCallback(async () => setUser(await api('/me')), []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, refresh }),
    [user, ready, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Route guard: requires login and (optionally) one of the given roles. */
export function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="page">…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
