/* Web Speech API (ur-PK) dictation. Feature-detected; the text box always works without it. */
import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function speechSupported() {
  return Boolean(SR);
}

export function useSpeech({ lang = 'ur-PK', onFinal } = {}) {
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
      setInterim(interimText);
      if (finalText) onFinalRef.current?.(finalText.trim());
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
