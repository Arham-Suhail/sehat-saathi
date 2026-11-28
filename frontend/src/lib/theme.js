/* Light / dark theme. The user's choice is kept on this device (localStorage "ss_theme") and set as
   <html data-theme>. With no choice saved, the phone's own setting decides (theme.css media query).
   Also keeps <meta name="theme-color"> in step, so the phone's status bar matches the app. */
const KEY = 'ss_theme';
const BAR = { light: '#FBF6EC', dark: '#111514' };

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function effectiveTheme() {
  return getThemeChoice() || (systemDark() ? 'dark' : 'light');
}

export function applyTheme() {
  if (typeof document === 'undefined') return;
  const choice = getThemeChoice();
  const root = document.documentElement;
  if (choice) root.dataset.theme = choice;
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR[effectiveTheme()]);
}

export function setTheme(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* private mode: still switch for this visit */
  }
  applyTheme();
  window.dispatchEvent(new Event('ss-theme'));
}

/** Call once at start-up: follow the phone if it switches light/dark while the app is open. */
export function watchSystemTheme() {
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    applyTheme();
    window.dispatchEvent(new Event('ss-theme'));
  });
}
