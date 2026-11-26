/* Web Speech API dictation. Feature-detected; the text box always works without it.
   The recogniser follows the UI language: ur-PK returns Urdu script for the Urdu UI, en-IN English
   for the English UI. A legacy hi-IN caller still gets Hindi script turned into Roman Urdu. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toRoman } from '../i18n/translit';
import { getLang, t } from '../i18n/useT';

const SPEECH_LANG = { ur: 'ur-PK', en: 'en-IN' };

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function speechSupported() {
  return Boolean(SR);
}

export function useSpeech({ lang, onFinal } = {}) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => recRef.current?.abort?.(), []);

  const start = useCallback(() => {
    if (!SR) return;
    setError(null);
    const rec = new SR();
    const recLang = lang || SPEECH_LANG[getLang()] || 'ur-PK';
    const shown = (s) => (recLang === 'hi-IN' ? toRoman(s) : s);
    rec.lang = recLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(shown(interimText));
      if (finalText) onFinalRef.current?.(shown(finalText).trim());
    };
    rec.onerror = (e) => {
      const map = {
        'not-allowed': 'mic.denied',
        'service-not-allowed': 'speech.blocked',
        'no-speech': 'speech.silence',
        'audio-capture': 'mic.missing',
        network: 'speech.network',
      };
      setError(t(map[e.error] || 'speech.unclear'));
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported: Boolean(SR), listening, interim, error, start, stop };
}
