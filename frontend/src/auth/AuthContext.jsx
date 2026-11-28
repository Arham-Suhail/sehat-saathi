import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { TOKEN_KEY, api, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { disablePushForLogout } from '../hooks/usePush';
import { cancelAllAlarms } from '../lib/nativeAlarms';
import { clearCaches, readUser, writeUser } from '../lib/cache';

const AuthContext = createContext(null);

// Set just before this tab reloads because another tab changed the login (read by AccountSwitchedNotice).
export const SWITCH_FLAG = 'ss_account_switched';

export function homeFor(role) {
  return role === 'elder' ? '/elder' : '/carer';
}

export function AuthProvider({ children }) {
  // Draw the app at once from the last known session (Render may be asleep for ~50 s); /me then
  // re-checks it in the background and a 401 clears it.
  const cached = getToken() ? readUser() : null;
  const [user, setUserState] = useState(cached);
  const [ready, setReady] = useState(!!cached);
  const setUser = useCallback((u) => {
    writeUser(u);
    setUserState(u);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    clearCaches();
    setUserState(null);
  }, []);

  // Explicit logout also stops this browser's push alerts and, in the Android app, every native dose
  // alarm (shared phones). An expired token (401) only clears the session: an elder's dose alarms
  // keep working until they log out.
  const logout = useCallback(() => {
    Promise.allSettled([disablePushForLogout(), cancelAllAlarms()]).finally(clearSession);
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
  }, [clearSession, setUser]);

  // The login token is shared by every tab of this browser. If another tab logs in (as anyone) or
  // logs out, this tab would keep showing the old account while its requests already use the new
  // token (e.g. a family screen sending an elder's token -> "Ijazat nahi"). So reload: the app then
  // starts as whoever is logged in now, and RequireRole sends each tab to the right home.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== TOKEN_KEY && e.key !== null) return; // null = storage cleared
      if (e.key !== null && e.oldValue === e.newValue) return;
      try {
        sessionStorage.setItem(SWITCH_FLAG, '1');
      } catch {
        /* private mode: reload anyway */
      }
      window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const finish = useCallback(
    (data) => {
      clearCaches(); // a different account may have used this phone
      setToken(data.access_token);
      setUser(data.user);
      return data.user;
    },
    [setUser],
  );

  const login = useCallback(
    async (email, password) =>
      finish(await api('/auth/login', { method: 'POST', json: { email, password }, auth: false, timeoutMs: 90000 })),
    [finish],
  );

  const register = useCallback(
    async (form) => finish(await api('/auth/register', { method: 'POST', json: form, auth: false, timeoutMs: 90000 })),
    [finish],
  );

  // Code-first sign-up (email on): step 1 emails a code, step 2 creates the account and logs in.
  const registerStart = useCallback(
    async (form) => api('/auth/register/start', { method: 'POST', json: form, auth: false, timeoutMs: 90000 }),
    [],
  );
  const registerVerify = useCallback(
    async (email, code) =>
      finish(await api('/auth/register/verify', { method: 'POST', json: { email, code }, auth: false, timeoutMs: 90000 })),
    [finish],
  );

  const refresh = useCallback(async () => setUser(await api('/me')), [setUser]);

  const value = useMemo(
    () => ({ user, ready, login, register, registerStart, registerVerify, logout, refresh }),
    [user, ready, login, register, registerStart, registerVerify, logout, refresh],
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
