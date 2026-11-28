/* Chotu speaks (text-to-speech): the dose alarm ("Metformin ka waqt ho gaya"), "Read to me" on
   Today's medicines. Android app: the phone's own TTS engine (native plugin, works offline);
   website: the browser's speechSynthesis. Off switch in More. Never throws. */
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { getLang } from '../i18n/useT';
import { isNative } from './native';

const KEY = 'ss_speak';
export const speakEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
export const setSpeakEnabled = (on) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
};

// Urdu text is spoken in Urdu; Roman Urdu / English UI in an Indian-English / Hindi voice reads
// Roman Urdu far better than a US voice.
const langFor = () => (getLang() === 'ur' ? 'ur-PK' : getLang() === 'en' ? 'en-IN' : 'hi-IN');

export async function speak(text, { force = false } = {}) {
  if (!text || (!force && !speakEnabled())) return;
  const lang = langFor();
  try {
    if (isNative()) {
      let use = lang;
      try {
        const { supported } = await TextToSpeech.isLanguageSupported({ lang });
        if (!supported) use = lang === 'ur-PK' ? 'hi-IN' : 'en-US';
      } catch {
        /* keep */
      }
      await TextToSpeech.stop().catch(() => {});
      await TextToSpeech.speak({ text, lang: use, rate: 0.9, pitch: 1.0, volume: 1.0, category: 'playback' });
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* no TTS on this device */
  }
}

export function stopSpeaking() {
  try {
    if (isNative()) TextToSpeech.stop().catch(() => {});
    else window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
