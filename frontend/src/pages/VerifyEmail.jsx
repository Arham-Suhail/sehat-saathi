/* Verify my email: a 6-digit code was emailed at sign-up (or on "Send a new code"). Typing it calls
   POST /me/verify-email; the server allows 5 tries per code, 15 minutes. */
import { useState } from 'react';
import { api } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import Icon from '../components/Icon';
import { BigButton, ErrorText, Field, Notice, TopBar } from '../components/ui';
import { t } from '../i18n/useT';
import { onlyDigits } from '../lib/digits';

export default function VerifyEmail() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const home = homeFor(user.role);

  const resend = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api('/me/verify-email/send', { method: 'POST' });
      setMsg(t('verify.sent', { email: user.email }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api('/me/verify-email', { method: 'POST', json: { code } });
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (user.email_verified) {
    return (
      <main className="page stack">
        <TopBar back={home} title={t('verify.title')} />
        <Notice kind="success">✓ {t('verify.done')}</Notice>
        <BigButton to={home}>{t('verify.home')}</BigButton>
      </main>
    );
  }

  return (
    <main className="page stack">
      <TopBar back={home} title={t('verify.title')} />
      <h1 className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="mail" size={28} />
        </span>
        {t('verify.title')}
      </h1>
      <p>
        {t('verify.intro')} <strong dir="ltr">{user.email}</strong>
      </p>
      <form className="stack" onSubmit={submit} noValidate>
        <Field id="verify-code" label={t('verify.code')} hint={t('verify.code.hint')}>
          <input
            id="verify-code"
            className="input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            aria-describedby="verify-code-hint"
            onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
            style={{ letterSpacing: '0.3em', fontSize: '1.4em' }}
          />
        </Field>
        <div aria-live="polite">
          {msg ? <Notice kind="success">{msg}</Notice> : null}
          <ErrorText>{err}</ErrorText>
        </div>
        <BigButton type="submit" disabled={busy || code.length !== 6}>
          {busy ? t('common.loading') : t('verify.confirm')}
        </BigButton>
      </form>
      <BigButton variant="secondary" disabled={busy} onClick={resend}>
        {t('verify.resend')}
      </BigButton>
      <p className="muted">{t('verify.spam')}</p>
    </main>
  );
}
