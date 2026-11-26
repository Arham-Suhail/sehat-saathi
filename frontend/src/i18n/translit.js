/* Devanagari (Hindi script) -> Roman Urdu, deterministic. Mirror of backend/app/services/translit.py;
   both are tested against shared/translit-vectors.json (npm test / pytest). Latin and Urdu-script text
   pass through unchanged. Used for what the elder sees while speaking (Vapi / Web Speech hi-IN). */

const CONS = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'w',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
};
const NUKTA = { क: 'q', ख: 'kh', ग: 'gh', ज: 'z', ड: 'r', ढ: 'rh', फ: 'f', य: 'y' };
const VOWELS = { अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o' };
const MATRAS = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o',
};
const HALANT = '्';
const NUKTA_SIGN = '़';
const NASAL = new Set(['ं', 'ँ']);
const VISARGA = 'ः';
const OTHER = { '।': '.', '॥': '.' };
for (let d = 0; d < 10; d++) OTHER[String.fromCharCode(0x0966 + d)] = String(d);
const WORDS = {
  में: 'mein', मैं: 'main', हैं: 'hain', है: 'hai', नहीं: 'nahi', 'हूँ': 'hoon', 'हूं': 'hoon',
  यह: 'yeh', वह: 'woh', ये: 'ye', वो: 'wo', और: 'aur', क्या: 'kya',
};
const WORD_RE = /[ऀ-ॣ॰-ॿ]+/g;

function word(w) {
  if (WORDS[w]) return WORDS[w];
  const units = [];
  const chars = [...w];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const last = units[units.length - 1];
    if (CONS[ch] !== undefined) {
      let c = CONS[ch];
      if (chars[i + 1] === NUKTA_SIGN) {
        c = NUKTA[ch] ?? c;
        i += 1;
      }
      units.push({ c, v: 'a', inherent: true, tail: '' });
    } else if (VOWELS[ch] !== undefined) {
      units.push({ c: '', v: VOWELS[ch], inherent: false, tail: '' });
    } else if (last && MATRAS[ch] !== undefined) {
      last.v = MATRAS[ch];
      last.inherent = false;
    } else if (last && ch === HALANT) {
      last.v = '';
      last.inherent = false;
    } else if (last && NASAL.has(ch)) {
      last.tail += 'n';
    } else if (last && ch === VISARGA) {
      last.tail += 'h';
    }
  }

  // Schwa deletion: word-final inherent "a", then a medial one between vowelled syllables.
  const end = units[units.length - 1];
  if (units.length > 1 && end.inherent && end.c) end.v = '';
  for (let k = units.length - 2; k > 0; k--) {
    const u = units[k];
    const prev = units[k - 1];
    const next = units[k + 1];
    if (u.inherent && u.c && !u.tail && prev.v && next.c && next.v) u.v = '';
  }

  let s = units
    .map((u, k) => {
      const next = units[k + 1];
      const v = u.v === 'a' && next && next.c === 'h' && !next.v ? 'e' : u.v; // mahsoos -> mehsoos
      return u.c + v + u.tail;
    })
    .join('')
    .replaceAll('chchh', 'chh');
  if (s.length > 2 && s.endsWith('ee')) s = s.slice(0, -2) + 'i';
  else if (s.length > 2 && s.endsWith('aa')) s = s.slice(0, -1);
  return s;
}

export function toRoman(text) {
  if (!text) return '';
  const mapped = [...text].map((ch) => OTHER[ch] ?? ch).join('');
  return mapped.replace(WORD_RE, (m) => word(m));
}
