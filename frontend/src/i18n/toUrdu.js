/* Devanagari (Hindi script) -> Urdu script, best effort, for the Urdu UI.
   Used only where speech-to-text can't give Urdu directly (Vapi's transcriber returns Hindi script).
   Common words come from a small dictionary; other words are mapped letter by letter. Short vowels
   are not written in Urdu, so they are dropped; letters Urdu spells several ways (s/ص/ث, z/ذ/ض/ظ)
   use the common form. Latin and Urdu-script text pass through unchanged. Tested in toUrdu.test.js. */

const CONS = {
  क: 'ک', ख: 'کھ', ग: 'گ', घ: 'گھ', ङ: 'ن',
  च: 'چ', छ: 'چھ', ज: 'ج', झ: 'جھ', ञ: 'ن',
  ट: 'ٹ', ठ: 'ٹھ', ड: 'ڈ', ढ: 'ڈھ', ण: 'ن',
  त: 'ت', थ: 'تھ', द: 'د', ध: 'دھ', न: 'ن',
  प: 'پ', फ: 'پھ', ब: 'ب', भ: 'بھ', म: 'م',
  य: 'ی', र: 'ر', ल: 'ل', ळ: 'ل', व: 'و',
  श: 'ش', ष: 'ش', स: 'س', ह: 'ہ',
  'क़': 'ق', 'ख़': 'خ', 'ग़': 'غ', 'ज़': 'ز', 'ड़': 'ڑ', 'ढ़': 'ڑھ', 'फ़': 'ف', 'य़': 'ی',
};
const NUKTA = { क: 'ق', ख: 'خ', ग: 'غ', ज: 'ز', ड: 'ڑ', ढ: 'ڑھ', फ: 'ف', य: 'ی' };
// Independent vowels (word-initial or after another vowel).
const VOWELS = { अ: 'ا', आ: 'آ', इ: 'ا', ई: 'ای', उ: 'ا', ऊ: 'او', ऋ: 'رِ', ए: 'ا', ऐ: 'اے', ओ: 'او', औ: 'او', ऑ: 'او' };
// Vowel signs after a consonant. e/ai become ے at the end of a word and ی inside it.
const MATRAS = { 'ा': 'ا', 'ि': '', 'ी': 'ی', 'ु': '', 'ू': 'و', 'ृ': 'ر', 'े': 'E', 'ै': 'E', 'ो': 'و', 'ौ': 'و', 'ॅ': 'E', 'ॉ': 'و' };
const HALANT = '्';
const NUKTA_SIGN = '़';
const NASAL = new Set(['ं', 'ँ']);
const OTHER = { '।': '۔', '॥': '۔' };
for (let d = 0; d < 10; d++) OTHER[String.fromCharCode(0x0966 + d)] = String(d);

const WORDS = {
  है: 'ہے', हैं: 'ہیں', में: 'میں', मैं: 'میں', नहीं: 'نہیں', 'हूँ': 'ہوں', 'हूं': 'ہوں', हो: 'ہو',
  और: 'اور', क्या: 'کیا', यह: 'یہ', वह: 'وہ', ये: 'یہ', वो: 'وہ', आप: 'آپ', मेरा: 'میرا', मेरी: 'میری',
  ठीक: 'ٹھیک', दर्द: 'درد', दवा: 'دوا', दवाई: 'دوائی', आज: 'آج', कल: 'کل', बहुत: 'بہت', थोड़ा: 'تھوڑا',
  थोड़ी: 'تھوڑی', अच्छा: 'اچھا', अच्छी: 'اچھی', शुक्रिया: 'شکریہ', सिर: 'سر', पेट: 'پیٹ', साँस: 'سانس',
  सांस: 'سانس', चक्कर: 'چکر', बुखार: 'بخار', थकान: 'تھکان', उदास: 'اداس', खुश: 'خوش', रहा: 'رہا',
  रही: 'رہی', रहे: 'رہے', कर: 'کر', कैसा: 'کیسا', कैसे: 'کیسے', महसूस: 'محسوس', ज़्यादा: 'زیادہ',
  ज्यादा: 'زیادہ', नींद: 'نیند', खाना: 'کھانا', पानी: 'پانی', अल्लाह: 'اللہ', सलाम: 'سلام',
  डॉक्टर: 'ڈاکٹر', डाक्टर: 'ڈاکٹر', बीपी: 'بی پی', शुगर: 'شوگر', 'हाँ': 'ہاں', हां: 'ہاں', जी: 'جی',
  दवाइयाँ: 'دوائیاں', दवाइयां: 'دوائیاں', गोली: 'گولی', टेस्ट: 'ٹیسٹ', बेटा: 'بیٹا', बेटी: 'بیٹی',
  अस्सलाम: 'السلام', अलैकुम: 'علیکم', वालेकुम: 'وعلیکم', मुझे: 'مجھے', आपका: 'آپ کا',
};
const WORD_RE = /[ऀ-ॣ॰-ॿ]+/g;

function word(w) {
  if (WORDS[w]) return WORDS[w];
  const chars = [...w];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONS[ch] !== undefined) {
      let c = CONS[ch];
      if (chars[i + 1] === NUKTA_SIGN) {
        c = NUKTA[ch] ?? c;
        i += 1;
      }
      out += c;
    } else if (VOWELS[ch] !== undefined) {
      out += out && !/[اوی]$/.test(out) ? VOWELS[ch].replace(/^ا/, 'ئ') : VOWELS[ch];
    } else if (MATRAS[ch] !== undefined) {
      out += MATRAS[ch];
    } else if (NASAL.has(ch)) {
      out += 'N';
    } else if (ch === HALANT || ch === NUKTA_SIGN) {
      /* no sound of its own */
    }
  }
  // e/ai: ے at the end of the word, ی inside. Nasal: ں at the end, ن inside.
  out = out.replace(/E$/, 'ے').replaceAll('E', 'ی');
  out = out.replace(/N$/, 'ں').replaceAll('N', 'ن');
  return out;
}

export function toUrdu(text) {
  if (!text) return '';
  const mapped = [...text].map((ch) => OTHER[ch] ?? ch).join('');
  return mapped.replace(WORD_RE, (m) => word(m));
}
