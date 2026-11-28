import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { BigButton, BottomBar, Disclaimer, ErrorText, Notice, TopBar } from '../../components/ui';
import { useSpeech } from '../../hooks/useSpeech';
import { useVapiCall } from '../../hooks/useVapiCall';
import ChotuAgent from '../../components/chotu/ChotuAgent';
import ChotuBoundary from '../../components/chotu/ChotuBoundary';
import { toUrdu } from '../../i18n/toUrdu';
import { getLang, t } from '../../i18n/useT';

const VAPI_STATES = new Set(['connecting', 'listening', 'thinking', 'speaking', 'saving']);
// Vapi's transcriber returns spoken Urdu in Hindi script: show it in Urdu script (English stays English).
const script = toUrdu;

function ResultCard({ result }) {
  return (
    <section className="card stack" aria-live="polite">
      <p className="big">{result.reply}</p>
      {result.wellness_tip ? (
        <p>
          <strong>{t('checkin.tip')} </strong>
          {result.wellness_tip}
        </p>
      ) : null}
      {result.concern_flag ? (
        <Notice kind="warning">
          {t('checkin.concern')}
        </Notice>
      ) : null}
    </section>
  );
}

export default function CheckIn() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [usedSpeech, setUsedSpeech] = useState(false);
  // Chotu remembers today only: "Earlier today you said you felt tired" (facts from today's check-in).
  const [earlier, setEarlier] = useState(null);
  useEffect(() => {
    api('/checkins?limit=10')
      .then((list) => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        const c = list.find((x) => x.channel !== 'ok' && new Date(x.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }) === today);
        if (c) setEarlier(c.mood);
      })
      .catch(() => {});
  }, []);

  const onFinal = useCallback((t) => {
    setUsedSpeech(true);
    setText((prev) => (prev ? `${prev} ${t}` : t).slice(0, 1000));
  }, []);
  const speech = useSpeech({ onFinal });
  const vapi = useVapiCall({ onSaved: setResult });

  // Opened from the phone button (?call=1): start the live call at once, or explain why it can't.
  const [params, setParams] = useSearchParams();
  const [callUnavailable, setCallUnavailable] = useState(false);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.get('call') !== '1' || autoStarted.current) return;
    autoStarted.current = true;
    setParams({}, { replace: true });
    if (vapi.configured) vapi.start();
    else setCallUnavailable(true);
  }, [params, setParams, vapi]);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await api('/checkins/text', {
        method: 'POST',
        json: { message, channel: usedSpeech ? 'speech' : 'text', lang: getLang() },
        timeoutMs: 60000,
      });
      setResult(out);
      setText('');
      setUsedSpeech(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const vapiBusy = vapi.live || vapi.state === 'connecting' || vapi.state === 'saving';
  // Chotu mirrors what is happening: the voice call state first, then the typed check-in.
  const chotuState =
    vapi.state === 'error'
      ? 'error'
      : vapi.state === 'listening' || vapi.state === 'speaking'
        ? vapi.state
        : ['connecting', 'thinking', 'saving'].includes(vapi.state) || busy
          ? 'thinking'
          : 'idle';

  return (
    <main className="page page--with-bar stack">
      <TopBar back="/elder" title={t('checkin.short')} />
      <h1>{t('checkin.title')}</h1>

      <div className="chotu-stage">
        <ChotuBoundary>
          <ChotuAgent state={chotuState} size={150} />
        </ChotuBoundary>
      </div>

      <div className="bubbles" aria-live="polite">
        <div className="bubble bubble--ai">
          {vapi.live && vapi.assistantLine ? script(vapi.assistantLine) : earlier ? t(`checkin.earlier.${earlier}`) : t('checkin.greeting')}
        </div>
        {vapi.transcript
          .filter((x) => x.role === 'elder')
          .slice(-1)
          .map((x, i) => (
            <div key={i} className="bubble bubble--elder">
              {script(x.text)}
            </div>
          ))}
      </div>
      <Disclaimer text={t('landing.chotu.note')} />

      {vapi.configured && VAPI_STATES.has(vapi.state) ? <Notice>{t(`checkin.vapi.${vapi.state}`)}</Notice> : null}
      <ErrorText>{vapi.error}</ErrorText>
      {callUnavailable ? <Notice kind="warning">{t('call.unavailable')}</Notice> : null}

      {result ? <ResultCard result={result} /> : null}

      <section className="stack" aria-labelledby="write-h">
        <h2 id="write-h">{t('checkin.write')}</h2>
        <label htmlFor="checkin-text" className="visually-hidden">
          {t('home.checkin')}
        </label>
        <textarea
          id="checkin-text"
          className="textarea"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('checkin.placeholder')}
          disabled={vapiBusy}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('checkin.quick')}>
          {['good', 'tired', 'unwell'].map((k) => (
            <button
              key={k}
              type="button"
              disabled={vapiBusy || busy}
              onClick={() => setText(t(`checkin.chip.${k}`))}
              className="chip-ios pressable min-h-12 px-4 text-[1.1rem]"
            >
              {t(`checkin.chip.${k}`)}
            </button>
          ))}
        </div>
        {speech.listening && speech.interim ? <p className="muted">🎤 {speech.interim}</p> : null}
        <ErrorText>{speech.error}</ErrorText>
        {speech.supported ? (
          <BigButton variant="secondary" disabled={vapiBusy || busy} onClick={speech.listening ? speech.stop : speech.start}>
            {speech.listening ? `■ ${t('checkin.speech.stop')}` : `🎤 ${t('checkin.speech.start')}`}
          </BigButton>
        ) : null}
        <ErrorText>{err}</ErrorText>
      </section>

      <BottomBar>
        {vapi.configured ? (
          vapi.live ? (
            <BigButton variant="danger" onClick={vapi.stop}>
              ■ {t('checkin.vapi.end')}
            </BigButton>
          ) : (
            <BigButton variant="secondary" disabled={vapiBusy || busy} onClick={vapi.start}>
              📞 {t('checkin.vapi.start')}
            </BigButton>
          )
        ) : null}
        <BigButton onClick={send} disabled={busy || vapiBusy || !text.trim()}>
          {busy ? t('checkin.sending') : t('checkin.send')}
        </BigButton>
      </BottomBar>
    </main>
  );
}
