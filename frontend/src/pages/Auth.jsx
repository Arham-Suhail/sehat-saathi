import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { wakeServer } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import { BigButton, ErrorText, Field, TopBar } from '../components/ui';
import { t } from '../i18n/useT';

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
    <main className="page">
      <TopBar back="/" />
      <form className="stack" onSubmit={submit} noValidate>
        <h1>{t('common.login')}</h1>
        <Field id="email" label={t('auth.email')}>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
            maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label={t('auth.password')}>
          <input id="password" className="input" type="password" autoComplete="current-password" required
            maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{err}</ErrorText>
        <BigButton type="submit" disabled={busy || !email || !password}>
          {busy ? t('common.loading') : t('common.login')}
        </BigButton>
        <p className="center">
          <Link to="/register">{t('auth.no_account')}</Link>
        </p>
      </form>
    </main>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'elder' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
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
      const u = await register({ ...form, name: form.name.trim(), email: form.email.trim() });
      nav(homeFor(u.role), { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <TopBar back="/" />
      <form className="stack" onSubmit={submit} noValidate>
        <h1>{t('common.register')}</h1>
        <fieldset className="card stack" style={{ border: '2px solid var(--border)' }}>
          <legend className="big">{t('auth.role')}</legend>
          {['elder', 'family', 'doctor'].map((r) => (
            <label key={r} className="row" style={{ minHeight: 48 }}>
              <input type="radio" name="role" value={r} checked={form.role === r} onChange={set('role')}
                style={{ width: 28, height: 28 }} />
              {t(`auth.role.${r}`)}
            </label>
          ))}
        </fieldset>
        <Field id="name" label={t('auth.name')}>
          <input id="name" className="input" autoComplete="name" required maxLength={80} value={form.name}
            onChange={set('name')} />
        </Field>
        <Field id="email" label={t('auth.email')}>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
            maxLength={254} value={form.email} onChange={set('email')} />
        </Field>
        <Field id="password" label={t('auth.password')} hint={t('auth.password.hint')}>
          <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8}
            maxLength={72} value={form.password} onChange={set('password')} aria-describedby="password-hint" />
        </Field>
        <ErrorText>{err}</ErrorText>
        <BigButton type="submit" disabled={busy || !form.name || !form.email || !form.password}>
          {busy ? t('common.loading') : t('common.register')}
        </BigButton>
        <p className="center">
          <Link to="/login">{t('auth.have_account')}</Link>
        </p>
      </form>
    </main>
  );
}
