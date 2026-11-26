import { useCallback, useState } from 'react';
import { api } from '../../api/client';
import { BigButton, BottomBar, Disclaimer, ErrorText, Notice, TopBar } from '../../components/ui';
import { useSpeech } from '../../hooks/useSpeech';
import { useVapiCall } from '../../hooks/useVapiCall';
import ChotuAgent from '../../components/chotu/ChotuAgent';
import ChotuBoundary from '../../components/chotu/ChotuBoundary';
import { toRoman } from '../../i18n/translit';

const GREETING = 'Assalam o Alaikum! Aaj aap kaisa mehsoos kar rahe hain?';
const AI_NOTE = 'Chotu ek AI sahayak hai, doctor nahi. Dawai ke baare mein apne doctor se poochein.';
const VAPI_STATE = {
  connecting: 'Jor raha hoon…',
  listening: 'Main sun raha hoon — boliye',
  thinking: 'Soch raha hoon…',
  speaking: 'Chotu bol raha hai…',
  saving: 'Baat mehfooz ho rahi hai…',
};

function ResultCard({ result }) {
  return (
    <section className="card stack" aria-live="polite">
      <p className="big">{result.reply}</p>
      {result.wellness_tip ? (
        <p>
          <strong>Aaj ka mashwara: </strong>
          {result.wellness_tip}
        </p>
      ) : null}
      {result.concern_flag ? (
        <Notice kind="warning">
          Aap ki baat ghar walon ke dashboard par nazar aayegi. Zaroorat ho to foran doctor se rabta karein.
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

  const onFinal = useCallback((t) => {
    setUsedSpeech(true);
    setText((prev) => (prev ? `${prev} ${t}` : t).slice(0, 1000));
  }, []);
  const speech = useSpeech({ onFinal });
  const vapi = useVapiCall({ onSaved: setResult });

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await api('/checkins/text', {
        method: 'POST',
        json: { message, channel: usedSpeech ? 'speech' : 'text' },
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
      <TopBar back="/elder" title="Hal-chaal" />
      <h1>Aaj ka hal-chaal</h1>

      <div className="chotu-stage">
        <ChotuBoundary>
          <ChotuAgent state={chotuState} size={150} />
        </ChotuBoundary>
      </div>

      <div className="bubbles" aria-live="polite">
        <div className="bubble bubble--ai">{vapi.live && vapi.assistantLine ? toRoman(vapi.assistantLine) : GREETING}</div>
        {vapi.transcript
          .filter((x) => x.role === 'elder')
          .slice(-1)
          .map((x, i) => (
            <div key={i} className="bubble bubble--elder">
              {toRoman(x.text)}
            </div>
          ))}
      </div>
      <Disclaimer text={AI_NOTE} />

      {vapi.configured && vapi.state !== 'idle' && VAPI_STATE[vapi.state] ? <Notice>{VAPI_STATE[vapi.state]}</Notice> : null}
      <ErrorText>{vapi.error}</ErrorText>

      {result ? <ResultCard result={result} /> : null}

      <section className="stack" aria-labelledby="write-h">
        <h2 id="write-h">Likh kar bataein</h2>
        <label htmlFor="checkin-text" className="visually-hidden">
          Aaj aap kaisa mehsoos kar rahe hain?
        </label>
        <textarea
          id="checkin-text"
          className="textarea"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Masalan: Aaj theek hoon, thori thakan hai…"
          disabled={vapiBusy}
        />
        {speech.listening && speech.interim ? <p className="muted">🎤 {speech.interim}</p> : null}
        <ErrorText>{speech.error}</ErrorText>
        {speech.supported ? (
          <BigButton variant="secondary" disabled={vapiBusy || busy} onClick={speech.listening ? speech.stop : speech.start}>
            {speech.listening ? '■ Bas, ruk jayein' : '🎤 Bol kar likhwayein'}
          </BigButton>
        ) : null}
        <ErrorText>{err}</ErrorText>
      </section>

      <BottomBar>
        {vapi.configured ? (
          vapi.live ? (
            <BigButton variant="danger" onClick={vapi.stop}>
              ■ Khatam karein
            </BigButton>
          ) : (
            <BigButton variant="secondary" disabled={vapiBusy || busy} onClick={vapi.start}>
              📞 Chotu se baat karein
            </BigButton>
          )
        ) : null}
        <BigButton onClick={send} disabled={busy || vapiBusy || !text.trim()}>
          {busy ? 'Bhej raha hoon…' : 'Bhejein'}
        </BigButton>
      </BottomBar>
    </main>
  );
}
