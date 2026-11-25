import strings from './ur-roman.json';

/** Roman Urdu only. t('home.greeting', { name }) -> interpolates {name}. Missing keys show the key. */
export function t(key, vars) {
  let s = strings[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function useT() {
  return t;
}
