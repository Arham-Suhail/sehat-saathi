/* Web Speech API dictation. Feature-detected; the text box always works without it.
   hi-IN, not ur-PK: spoken Urdu is recognised as well, and Hindi script can be turned into Roman
   Urdu by fixed rules (Urdu script can't: short vowels aren't written). The app shows Roman only. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toRoman } from '../i18n/translit';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function speechSupported() {
  return Boolean(SR);
}

export function useSpeech({ lang = 'hi-IN', onFinal } = {}) {
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
    rec.lang = lang;
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
      setInterim(toRoman(interimText));
      if (finalText) onFinalRef.current?.(toRoman(finalText).trim());
    };
    rec.onerror = (e) => {
      const map = {
        'not-allowed': 'Mic ki ijazat nahi mili. Browser settings mein mic allow karein, ya likh kar bataein.',
        'service-not-allowed': 'Is browser mein awaaz se likhna band hai. Likh kar bataein.',
        'no-speech': 'Awaaz nahi aayi. Dobara bolein ya likh kar bataein.',
        'audio-capture': 'Mic nahi mila — likh kar bataein.',
        network: 'Internet ka masla hai. Likh kar bataein.',
      };
      setError(map[e.error] || 'Awaaz samajh nahi aayi. Likh kar bataein.');
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
