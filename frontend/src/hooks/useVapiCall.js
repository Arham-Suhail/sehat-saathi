/* Vapi voice check-in (browser Web SDK, no phone numbers).
   Optional at runtime: if the public key / assistant id aren't configured, `configured` is false
   and the UI hides the button. The transcript shown on screen is exactly what is POSTed to
   /checkins/voice at call end. Stage B maps `state` onto the Chotu mascot. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { toUrdu } from '../i18n/toUrdu';
import { getLang, t } from '../i18n/useT';
import { resolveVapiClass } from './vapiClass';

const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || '';
const ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID || '';
const MAX_TURNS = 60;
const MAX_CHARS = 6000;

export const vapiConfigured = Boolean(PUBLIC_KEY && ASSISTANT_ID);

const MIC_ERRORS = { NotAllowedError: 'mic.denied', NotFoundError: 'mic.missing', NotReadableError: 'mic.busy' };

function capTranscript(turns) {
  const out = [];
  let total = 0;
  for (const t of turns.slice(0, MAX_TURNS)) {
    const text = t.text.slice(0, 1000);
    total += text.length;
    if (total > MAX_CHARS) break;
    out.push({ role: t.role, text });
  }
  return out;
}

export function useVapiCall({ onSaved } = {}) {
  const vapiRef = useRef(null);
  const callIdRef = useRef(null);
  const transcriptRef = useRef([]);
  const [state, setState] = useState('idle'); // idle | connecting | listening | thinking | speaking | saving | error
  const [transcript, setTranscript] = useState([]);
  const [assistantLine, setAssistantLine] = useState('');
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const save = useCallback(async () => {
    const turns = capTranscript(transcriptRef.current);
    if (!turns.some((t) => t.role === 'elder')) {
      setState('idle');
      return;
    }
    setState('saving');
    try {
      const saved = await api('/checkins/voice', {
        method: 'POST',
        // Vapi's transcriber writes spoken Urdu in Hindi (Devanagari) script. Always store it in Urdu
        // script, whatever the UI language; English words (Latin letters) pass through unchanged.
        json: {
          transcript: turns.map((x) => ({ ...x, text: toUrdu(x.text) })),
          vapi_call_id: callIdRef.current,
          lang: getLang(),
        },
        timeoutMs: 60000,
      });
      onSavedRef.current?.(saved);
      setState('idle');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }, []);

  const ensureClient = useCallback(async () => {
    if (vapiRef.current) return vapiRef.current;
    // CommonJS package: through Vite the class is at default.default (see vapiClass.js).
    const Vapi = resolveVapiClass(await import('@vapi-ai/web'));
    // avoidEval keeps the WebRTC layer compatible with our strict CSP (no 'unsafe-eval').
    const vapi = new Vapi(PUBLIC_KEY, undefined, { avoidEval: true });
    vapi.on('call-start', () => {
      setLive(true);
      setState('listening');
    });
    vapi.on('speech-start', () => setState('speaking'));
    vapi.on('speech-end', () => setState('listening'));
    vapi.on('message', (m) => {
      if (m?.type !== 'transcript' || typeof m.transcript !== 'string') return;
      const role = m.role === 'assistant' ? 'ai' : 'elder';
      if (role === 'ai') setAssistantLine(m.transcript);
      if (m.transcriptType !== 'final') return;
      transcriptRef.current = [...transcriptRef.current, { role, text: m.transcript }];
      setTranscript(transcriptRef.current);
      if (role === 'elder') setState((s) => (s === 'speaking' ? s : 'thinking'));
    });
    vapi.on('error', (e) => {
      // Type/message only, for debugging; never keys or tokens.
      console.error('vapi error:', e?.type || e?.error?.type || 'unknown', e?.error?.message || e?.message || '');
      setError(t('vapi.dropped'));
      setState('error');
      setLive(false);
    });
    vapi.on('call-end', () => {
      setLive(false);
      save();
    });
    vapiRef.current = vapi;
    return vapi;
  }, [save]);

  const start = useCallback(async () => {
    if (!vapiConfigured) return;
    setError(null);
    transcriptRef.current = [];
    setTranscript([]);
    setAssistantLine('');
    setState('connecting');
    // Mic preflight so permission problems get a clear Roman Urdu message.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setError(t(MIC_ERRORS[e?.name] || 'mic.failed'));
      setState('error');
      return;
    }
    try {
      const vapi = await ensureClient();
      const call = await vapi.start(ASSISTANT_ID);
      callIdRef.current = call?.id ? String(call.id).slice(0, 100) : null;
    } catch (e) {
      console.error('vapi start failed:', e?.name || 'Error', e?.message || '');
      setError(t('vapi.failed'));
      setState('error');
    }
  }, [ensureClient]);

  const stop = useCallback(async () => {
    try {
      await vapiRef.current?.stop();
    } catch {
      /* call-end handler saves */
    }
  }, []);

  useEffect(
    () => () => {
      try {
        vapiRef.current?.stop();
        vapiRef.current?.removeAllListeners();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { configured: vapiConfigured, state, live, transcript, assistantLine, error, start, stop };
}
