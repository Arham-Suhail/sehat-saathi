/* Small on-device settings (More): simple mode, high contrast, sound, fall check, quiet hours.
   Each fires 'ss-prefs' so open screens update at once. */
import { useEffect, useState } from 'react';

const DEFAULTS = { simple: false, contrast: false, sound: true, fall: false, quiet: false, tutorialDone: false };
const KEY = 'ss_prefs';

export function getPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPref(name, value) {
  const next = { ...getPrefs(), [name]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    if (name === 'sound') localStorage.setItem('ss_sound', value ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  applyPrefs(next);
  window.dispatchEvent(new Event('ss-prefs'));
}

export function applyPrefs(p = getPrefs()) {
  document.documentElement.toggleAttribute('data-contrast', !!p.contrast);
}

export function usePrefs() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => {
    const on = () => setP(getPrefs());
    window.addEventListener('ss-prefs', on);
    return () => window.removeEventListener('ss-prefs', on);
  }, []);
  return p;
}
