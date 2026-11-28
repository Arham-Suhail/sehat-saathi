/* Light / dark theme. The user's choice is kept on this device (localStorage "ss_theme") and set as
   <html data-theme>. With no choice saved the app is light.
   Also keeps <meta name="theme-color"> in step, so the phone's status bar matches the app. */
const KEY = 'ss_theme_v2'; // v2 (Nov 28): everyone starts on the new light theme
const BAR = { light: '#F3F2EE', dark: '#111514' };

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

// Light by default (elders, family, doctors): dark only when chosen in More.
export function effectiveTheme() {
  return getThemeChoice() || 'light';
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

/** Kept for callers; the app no longer follows the phone's dark setting. */
export function watchSystemTheme() {}
