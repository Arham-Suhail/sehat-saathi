import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, wakeServer } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import ChotuAgent from '../components/chotu/ChotuAgent';
import ChotuBoundary from '../components/chotu/ChotuBoundary';
import AuroraBackground from '../components/landing/AuroraBackground';
import { BigButton, ErrorText, Field, Notice, TopBar } from '../components/ui';
import { useEmailEnabled } from '../hooks/useEmailConfig';
import { t } from '../i18n/useT';
import { onlyDigits } from '../lib/digits';

const RESET_FLAG = 'ss_password_reset';
const recent = (key) => {
  try {
    return Date.now() - Number(sessionStorage.getItem(key) || 0) < 30_000;
  } catch {
    return false;
  }
};

/* Stage B: both auth screens share the landing's aurora, a small Chotu and a glass card. */
function AuthShell({ children }) {
  return (
    <main className="page auth">
      <AuroraBackground />
      <TopBar back="/" />
      <div className="auth__chotu">
        <ChotuBoundary>
          <ChotuAgent size={84} />
        </ChotuBoundary>
      </div>
      {children}
    </main>
  );
}

function useWake() {
  useEffect(() => {
    wakeServer();
  }, []);
}

export function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Shown for 30 s after "Delete my account" (timestamp set by DeleteAccount.jsx). Not removed on
  // read: logging out can mount this screen twice, and the second mount must still show it.
  const [deleted] = useState(() => {
    try {
      return Date.now() - Number(sessionStorage.getItem('ss_account_deleted') || 0) < 30_000;
    } catch {
      return false;
    }
  });
  const [resetDone] = useState(() => recent(RESET_FLAG));
  const emailOn = useEmailEnabled();
  useWake();

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const u = await login(email.trim(), password);
      const from = location.state?.from;
      nav(from && from.startsWith(homeFor(u.role)) ? from : homeFor(u.role), { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form className="glass-card stack" onSubmit={submit} noValidate>
        <h1>{t('common.login')}</h1>
        {deleted ? <Notice kind="success">✓ {t('delete.done')}</Notice> : null}
        {resetDone ? <Notice kind="success">✓ {t('forgot.done')}</Notice> : null}
        <Field id="email" label={t('auth.email')}>
          <input
            id="email"
            className="input"
            dir="ltr"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="password" label={t('auth.password')}>
          <input
            id="password"
            className="input"
            dir="ltr"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{err}</ErrorText>
        <BigButton type="submit" disabled={busy || !email || !password}>
          {busy ? t('common.loading') : t('common.login')}
        </BigButton>
        {emailOn ? (
          <p className="center">
            <Link to="/forgot">{t('forgot.link')}</Link>
          </p>
        ) : null}
        <p className="center">
          <Link to="/register">{t('auth.no_account')}</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* Forgot password: step 1 asks for the email (the server always answers the same way, and only
   emails a code to a VERIFIED address); step 2 takes the 6-digit code and the new password. */
export function ForgotPassword() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useWake();

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const send = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/auth/password/forgot', { method: 'POST', json: { email: email.trim() }, auth: false });
      setStep(2);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setErr(t('auth.password.hint'));
    if (pw !== pw2) return setErr(t('forgot.mismatch'));
    setBusy(true);
    setErr(null);
    try {
      await api('/auth/password/reset', {
        method: 'POST',
        json: { email: email.trim(), code, new_password: pw },
        auth: false,
      });
      try {
        sessionStorage.setItem(RESET_FLAG, String(Date.now()));
      } catch {
        /* no message, the reset still happened */
      }
      nav('/login', { replace: true });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {step === 1 ? (
        <form className="glass-card stack" onSubmit={send} noValidate>
          <h1>{t('forgot.title')}</h1>
          <p>{t('forgot.intro')}</p>
          <Field id="forgot-email" label={t('auth.email')}>
            <input
              id="forgot-email"
              className="input"
              dir="ltr"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorText>{err}</ErrorText>
          <BigButton type="submit" disabled={busy || !email.trim()}>
            {busy ? t('common.loading') : t('forgot.send')}
          </BigButton>
          <p className="center">
            <Link to="/login">{t('auth.have_account')}</Link>
          </p>
        </form>
      ) : (
        <form className="glass-card stack" onSubmit={reset} noValidate>
          <h1>{t('forgot.title')}</h1>
          <Notice kind="info">{t('forgot.sent', { email: email.trim() })}</Notice>
          <Field id="forgot-code" label={t('verify.code')} hint={t('verify.code.hint')}>
            <input
              id="forgot-code"
              className="input"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby="forgot-code-hint"
              value={code}
              style={{ letterSpacing: '0.3em', fontSize: '1.4em' }}
              onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
            />
          </Field>
          <Field id="forgot-pw" label={t('forgot.new')} hint={t('auth.password.hint')}>
            <input
              id="forgot-pw"
              className="input"
              dir="ltr"
              type="password"
              autoComplete="new-password"
              aria-describedby="forgot-pw-hint"
              maxLength={72}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Field id="forgot-pw2" label={t('forgot.again')}>
            <input
              id="forgot-pw2"
              className="input"
              dir="ltr"
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </Field>
          <ErrorText>{err}</ErrorText>
          <BigButton type="submit" disabled={busy || code.length !== 6 || !pw || !pw2}>
            {busy ? t('common.loading') : t('forgot.save')}
          </BigButton>
          <BigButton
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setStep(1);
              setCode('');
              setErr(null);
            }}
          >
            {t('forgot.again_send')}
          </BigButton>
          <p className="muted">{t('verify.spam')}</p>
        </form>
      )}
    </AuthShell>
  );
}

const ROLE_ICON = { elder: '🧓', family: '👪', doctor: '🩺' };

export function Register() {
  const { user, register, registerStart, registerVerify } = useAuth();
  const nav = useNavigate();
  const emailOn = useEmailEnabled();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'elder' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(1); // 2 = "enter the code we emailed"
  const [code, setCode] = useState('');
  const [sentMsg, setSentMsg] = useState(null);
  useWake();

  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setErr(t('auth.password.hint'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const clean = { ...form, name: form.name.trim(), email: form.email.trim() };
      if (emailOn) {
        // No account until the emailed code is entered (made-up emails can't sign up).
        await registerStart(clean);
        setSentMsg(t('signup.sent', { email: clean.email }));
        setStep(2);
      } else {
        const u = await register(clean);
        nav(homeFor(u.role), { replace: true });
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      const u = await registerVerify(form.email.trim(), code);
      nav(homeFor(u.role), { replace: true });
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setErr(null);
    try {
      await registerStart({ ...form, name: form.name.trim(), email: form.email.trim() });
      setCode('');
      setSentMsg(t('signup.resent', { email: form.email.trim() }));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 2) {
    return (
      <AuthShell>
        <form className="glass-card stack" onSubmit={verify} noValidate>
          <h1>{t('signup.code.title')}</h1>
          <div aria-live="polite">{sentMsg ? <Notice kind="info">{sentMsg}</Notice> : null}</div>
          <Field id="signup-code" label={t('verify.code')} hint={t('verify.code.hint')}>
            <input
              id="signup-code"
              className="input"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby="signup-code-hint"
              value={code}
              style={{ letterSpacing: '0.3em', fontSize: '1.4em' }}
              onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
            />
          </Field>
          <ErrorText>{err}</ErrorText>
          <BigButton type="submit" disabled={busy || code.length !== 6}>
            {busy ? t('common.loading') : t('signup.finish')}
          </BigButton>
          <BigButton variant="secondary" disabled={busy} onClick={resend}>
            {t('verify.resend')}
          </BigButton>
          <BigButton
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setStep(1);
              setCode('');
              setErr(null);
            }}
          >
            {t('signup.change_email')}
          </BigButton>
          <p className="muted">{t('verify.spam')}</p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="glass-card stack" onSubmit={submit} noValidate>
        <h1>{t('common.register')}</h1>
        <fieldset className="role-options">
          <legend className="big">{t('auth.role')}</legend>
          {['elder', 'family', 'doctor'].map((r) => (
            <label key={r} className="role-option">
              <input type="radio" name="role" value={r} checked={form.role === r} onChange={set('role')} />
              <span className="role-option__icon" aria-hidden="true">
                {ROLE_ICON[r]}
              </span>
              {t(`auth.role.${r}`)}
            </label>
          ))}
        </fieldset>
        <Field id="name" label={t('auth.name')}>
          <input id="name" className="input" autoComplete="name" required maxLength={80} value={form.name} onChange={set('name')} />
        </Field>
        <Field id="email" label={t('auth.email')}>
          <input
            id="email"
            className="input"
            dir="ltr"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            value={form.email}
            onChange={set('email')}
          />
        </Field>
        <Field id="password" label={t('auth.password')} hint={t('auth.password.hint')}>
          <input
            id="password"
            className="input"
            dir="ltr"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={form.password}
            onChange={set('password')}
            aria-describedby="password-hint"
          />
        </Field>
        <ErrorText>{err}</ErrorText>
        <BigButton type="submit" disabled={busy || !form.name || !form.email || !form.password}>
          {busy ? t('common.loading') : t('common.register')}
        </BigButton>
        <p className="center">
          <Link to="/login">{t('auth.have_account')}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
