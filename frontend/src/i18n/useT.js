/* Two UI languages: Urdu (Nastaliq script, right-to-left, the default) and English.
   The choice is kept on this device (localStorage "ss_lang") and applied to <html lang dir>.
   t('home.greeting', { name }) -> interpolates {name}. Missing key: English, then the key itself.
   LangProvider (LangProvider.jsx) re-renders the app when the language changes. */
import en from './en.json';
import ur from './ur.json';

export const LANGS = ['ur', 'en'];
const DICTS = { ur, en };
const KEY = 'ss_lang';

function initialLang() {
  try {
    const v = localStorage.getItem(KEY);
    if (LANGS.includes(v)) return v;
  } catch {
    /* private mode */
  }
  return 'ur';
}

let current = typeof window === 'undefined' ? 'ur' : initialLang();

export function getLang() {
  return current;
}

/** Set the active language, remember it, and update <html lang/dir>. */
export function applyLang(lang) {
  current = LANGS.includes(lang) ? lang : 'ur';
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = current === 'ur' ? 'rtl' : 'ltr';
  }
}

export function t(key, vars) {
  let s = DICTS[current][key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function useT() {
  return t;
}
