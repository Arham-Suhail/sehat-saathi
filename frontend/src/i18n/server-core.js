/* Pure core of server.js (no JSON import, so node --test can load it): translate Roman Urdu API
   text with a given catalog. Unknown text is returned unchanged: never hide a message. */

const COL = { en: 0, ur: 1 };
const SLOT_JOIN = /^(subah|dopahar|shaam|raat)(?:, (subah|dopahar|shaam|raat))*(?: aur (subah|dopahar|shaam|raat))?$/i;

function fill(tpl, m) {
  return tpl.replace(/\{(\d)\}/g, (_, i) => m[Number(i)]);
}

function slots(catalog, text, col, lang) {
  const t = text.trim();
  const only = /^Sirf (subah|dopahar|shaam|raat)$/i.exec(t);
  if (only) {
    const w = catalog.slots[only[1].toLowerCase()][col];
    return lang === 'ur' ? `صرف ${w}` : `Only ${w}`;
  }
  if (!SLOT_JOIN.test(t)) return null;
  const words = t.split(/, | aur /i).map((w) => catalog.slots[w.toLowerCase()][col]);
  if (words.length === 1) return lang === 'en' ? words[0][0].toUpperCase() + words[0].slice(1) : words[0];
  const and = lang === 'ur' ? ' اور ' : ' and ';
  const sep = lang === 'ur' ? '، ' : ', ';
  const joined = words.slice(0, -1).join(sep) + and + words[words.length - 1];
  return lang === 'en' ? joined[0].toUpperCase() + joined.slice(1) : joined;
}

export function translateServer(catalog, text, lang) {
  if (typeof text !== 'string' || !text) return text;
  const col = COL[lang];
  if (col === undefined) return text;
  const hit = catalog.exact[text.trim()];
  if (hit) return hit[col];
  for (const p of catalog.patterns) {
    const m = new RegExp(p.re).exec(text.trim());
    if (m) return fill(p[lang], m);
  }
  return slots(catalog, text, col, lang) ?? text;
}
