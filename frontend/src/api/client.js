/* API client: bearer token, timeouts, friendly errors, Render cold-start awareness.
   Never logs tokens or request bodies. */
import { t } from '../i18n/useT';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TOKEN_KEY = 'ss_token';

// ---------- token storage (localStorage can throw in private mode) ----------
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- server status (for ServerWakingBanner) ----------
const listeners = new Set();
let serverStatus = 'unknown'; // unknown | waking | ok
export function onServerStatus(fn) {
  listeners.add(fn);
  fn(serverStatus);
  return () => listeners.delete(fn);
}
function setServerStatus(s) {
  if (s === serverStatus) return;
  serverStatus = s;
  listeners.forEach((fn) => fn(s));
}

/** Ping /health until the (possibly sleeping) Render server answers. */
export async function wakeServer({ maxWaitMs = 90000 } = {}) {
  const started = Date.now();
  const slowTimer = setTimeout(() => setServerStatus('waking'), 2500);
  try {
    while (Date.now() - started < maxWaitMs) {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(20000) });
        if (res.ok) {
          setServerStatus('ok');
          return true;
        }
      } catch {
        /* still waking */
      }
      setServerStatus('waking');
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  } finally {
    clearTimeout(slowTimer);
  }
}

// ---------- errors ----------
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/**
 * api('/path', { method, json, body, contentType, timeoutMs, auth })
 * Returns parsed JSON (or null for 204). Throws ApiError with a user-safe Roman Urdu message.
 */
export async function api(path, opts = {}) {
  const { method = 'GET', json, body, contentType, timeoutMs = 30000, auth = true } = opts;
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let payload = body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (contentType) {
    headers['Content-Type'] = contentType;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new ApiError(0, t('common.error'));
    throw new ApiError(0, navigator.onLine === false ? t('common.offline') : t('server.waking'));
  }
  setServerStatus('ok');

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized();
    const msg = typeof data?.detail === 'string' ? data.detail : t('common.error');
    throw new ApiError(res.status, msg);
  }
  return data;
}
