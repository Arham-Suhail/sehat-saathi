/* Text size (More -> Text size): Normal / Large / Extra large, saved on this device. */
const KEY = 'ss_textsize';
export const TEXT_SIZES = ['normal', 'large', 'xl'];

export function getTextSize() {
  try {
    const v = localStorage.getItem(KEY);
    return TEXT_SIZES.includes(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}
export function applyTextSize(v = getTextSize()) {
  const el = document.documentElement;
  if (v === 'normal') delete el.dataset.textsize;
  else el.dataset.textsize = v;
}
export function setTextSize(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
  applyTextSize(v);
}
