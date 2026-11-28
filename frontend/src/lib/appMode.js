/* App mode: the same site looks and behaves like a native app when it is opened from the Android app
   (Trusted Web Activity) or an installed PWA, and like a normal website in a browser tab.
   Signals: ?app=1 in the start URL, the TWA referrer "android-app://com.sehatsathi.app", or
   display-mode standalone. ?web=1 forces website mode (for testing). Kept in sessionStorage, which is
   per tab: opening the site in a normal Chrome tab never inherits app mode from the app. */
import { Capacitor } from '@capacitor/core';

const KEY = 'ss_app';
const PACKAGE_REFERRER = 'android-app://com.sehatsathi.app';

function read() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(v) {
  try {
    sessionStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

let cached = null;

export function isAppMode() {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return (cached = true); // the native Android app
  const params = new URLSearchParams(window.location.search);
  if (params.get('web') === '1') write('0');
  else if (
    params.get('app') === '1' ||
    (document.referrer || '').startsWith(PACKAGE_REFERRER) ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  )
    write('1');
  cached = read() === '1';
  return cached;
}

/** Mark <html> so CSS can tell app mode from website mode (html.is-app). */
export function applyAppMode() {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('is-app', isAppMode());
}
