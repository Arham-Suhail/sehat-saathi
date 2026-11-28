/* Tiny stale-while-revalidate cache for a few key reads (Home doses, medicines, alerts), so screens
   draw last-known data instantly and refresh in the background. Small JSON in localStorage only.
   Keys carry the user id; clearCaches() runs on logout / expired session / account switch, so health
   data never leaks between users of a shared phone. */
const PREFIX = 'ss.c.';
const USER_KEY = 'ss_user';

const uid = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')?.id || 'anon';
  } catch {
    return 'anon';
  }
};

export function readCache(name, fallback = null) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${uid()}.${name}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache(name, value) {
  try {
    localStorage.setItem(`${PREFIX}${uid()}.${name}`, JSON.stringify(value));
  } catch {
    /* full / blocked: memory only */
  }
}

export function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}
export function writeUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function clearCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || k === USER_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
