/* Web Speech API dictation. Feature-detected; the text box always works without it.
   The recogniser follows the UI language: ur-PK returns Urdu script for the Urdu UI, en-IN English
   for the English UI. A legacy hi-IN caller still gets Hindi script turned into Roman Urdu.
   Android app (Capacitor): the WebView has no Web Speech, so the native Google recogniser is used
   through @capacitor-community/speech-recognition (same hook API for the screens). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toRoman } from '../i18n/translit';
import { getLang, t } from '../i18n/useT';
import { SpeechRecognition as SRN } from '@capacitor-community/speech-recognition';
import { isNative } from '../lib/native';

const SPEECH_LANG = { ur: 'ur-PK', en: 'en-IN' };

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const NATIVE = typeof window !== 'undefined' && isNative();

export function speechSupported() {
  return NATIVE || Boolean(SR);
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
  const [nativeOk, setNativeOk] = useState(NATIVE);
  useEffect(() => {
    if (!NATIVE) return;
    SRN.available()
      .then((r) => setNativeOk(Boolean(r?.available)))
      .catch(() => setNativeOk(false));
  }, []);

  const startNative = useCallback(async () => {
    setError(null);
    try {
      const perm = await SRN.requestPermissions();
      if (perm?.speechRecognition && perm.speechRecognition !== 'granted') {
        setError(t('mic.denied'));
        return;
      }
      await SRN.removeAllListeners();
      let last = '';
      await SRN.addListener('partialResults', (d) => {
        last = d?.matches?.[0] || last;
        setInterim(last);
      });
      await SRN.addListener('listeningState', (d) => {
        if (d?.status === 'stopped') {
          setListening(false);
          setInterim('');
          if (last.trim()) onFinalRef.current?.(last.trim());
          last = '';
        }
      });
      recRef.current = { stop: () => SRN.stop(), abort: () => SRN.stop() };
      setListening(true);
      await SRN.start({ language: lang || SPEECH_LANG[getLang()] || 'ur-PK', maxResults: 1, partialResults: true, popup: false });
    } catch {
      setListening(false);
      setError(t('speech.unclear'));
    }
  }, [lang]);

  const start = useCallback(() => {
    if (NATIVE) return startNative();
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
  }, [lang, startNative]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported: NATIVE ? nativeOk : Boolean(SR), listening, interim, error, start, stop };
}
