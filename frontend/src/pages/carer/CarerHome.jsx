import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { BigButton, ErrorText, Field, Notice } from '../../components/ui';
import { usePush } from '../../hooks/usePush';
import { t } from '../../i18n/useT';

// Up to two letters; names without letters fall back to a neutral dot.
const initials = (name) =>
  (name.match(/\p{L}+/gu) || [])
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '•';

export default function CarerHome() {
  const { user, logout, refresh } = useAuth();
  const push = usePush();
  const [elders, setElders] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  const load = useCallback(async () => {
    try {
      setElders(await api('/carer/elders'));
    } catch (e) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const redeem = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const elder = await api('/invites/redeem', { method: 'POST', json: { code } });
      setOk(`${elder.name} jur gaye.`);
      setCode('');
      await refresh();
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack">
      <header className="spaced">
        <h1>Assalam o Alaikum, {user.name.split(' ')[0]}</h1>
        <BigButton variant="secondary" block={false} small onClick={logout}>
          Log out
        </BigButton>
      </header>

      {push.state === 'on' ? <Notice kind="success">🔔 {t('push.carer.enabled')}</Notice> : null}
      {push.state === 'denied' ? <Notice kind="warning">{t('push.denied')}</Notice> : null}
      {push.state === 'off' ? (
        <BigButton variant="secondary" onClick={push.enable}>
          {t('push.carer.on')}
        </BigButton>
      ) : null}
      <ErrorText>{push.error}</ErrorText>
      <p className="muted">{user.role === 'doctor' ? 'Doctor' : 'Family'} account · sirf dekhne ke liye</p>

      <section className="card stack" aria-labelledby="elders-h">
        <h2 id="elders-h">Aap ke buzurg</h2>
        {elders === null ? <p className="muted">…</p> : null}
        {elders?.length === 0 ? <p className="muted">Abhi koi buzurg nahi jura. Neeche code daalein.</p> : null}
        <div className="stack">
          {elders?.map((e) => (
            <Link key={e.id} to={`/carer/elder/${e.id}`} className="tile tile--icon">
              <span className="avatar" aria-hidden="true">
                {initials(e.name)}
              </span>
              <span className="tile__text">
                <span>{e.name}</span>
                <small>Dashboard dekhein →</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <form className="card stack" onSubmit={redeem} noValidate>
        <h2>Naya buzurg jorein</h2>
        <Field id="code" label="6 hindson ka code" hint="Buzurg ke app mein 'Ghar walon ko jorein' se milega">
          <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"
            maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-describedby="code-hint" style={{ letterSpacing: '0.3em', fontSize: '1.4em' }} />
        </Field>
        <ErrorText>{err}</ErrorText>
        {ok ? <Notice kind="success">✓ {ok}</Notice> : null}
        <BigButton type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Check ho raha hai…' : 'Jorein'}
        </BigButton>
      </form>
    </main>
  );
}
