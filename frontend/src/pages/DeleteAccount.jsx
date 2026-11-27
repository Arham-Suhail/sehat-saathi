/* Delete my account (elder or family/doctor). Says plainly what will be deleted for this role, asks
   for the password again (POST /me/delete re-checks it), then logs out everywhere in this browser and
   shows a confirmation on the login screen. One danger action; "Cancel" goes back home. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import Icon from '../components/Icon';
import { BigButton, ErrorText, Field, TopBar } from '../components/ui';
import { t } from '../i18n/useT';

export const DELETED_FLAG = 'ss_account_deleted';

export default function DeleteAccount() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const home = homeFor(user.role);
  const items = user.role === 'elder' ? ['elder.1', 'elder.2', 'elder.3', 'elder.4'] : ['carer.1', 'carer.2'];

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/me/delete', { method: 'POST', json: { password } });
      // A flag, not router state: logging out re-renders the route guards, which would drop state.
      try {
        sessionStorage.setItem(DELETED_FLAG, String(Date.now()));
      } catch {
        /* private mode: no confirmation message, the deletion still happened */
      }
      await logout();
      nav('/login', { replace: true });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <main className="page stack">
      <TopBar back={home} title={t('delete.title')} />
      <h1 className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-bg text-danger">
          <Icon name="trash" size={28} />
        </span>
        {t('delete.title')}
      </h1>

      <section className="rounded-3xl border-2 border-danger bg-danger-bg p-5">
        <p className="m-0 text-[1.3rem] font-bold text-danger">{t('delete.warning')}</p>
        <ul className="m-0 mt-3 flex list-disc flex-col gap-1 ps-6 text-[1.25rem] text-ink">
          {items.map((k) => (
            <li key={k}>{t(`delete.${k}`)}</li>
          ))}
        </ul>
      </section>

      <form className="stack" onSubmit={submit} noValidate>
        <Field id="del-pass" label={t('delete.password')} hint={t('delete.password.hint')}>
          <input
            id="del-pass"
            className="input"
            dir="ltr"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            value={password}
            aria-describedby="del-pass-hint"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{err}</ErrorText>
        <BigButton type="submit" variant="danger" disabled={busy || !password}>
          {busy ? t('common.loading') : t('delete.confirm')}
        </BigButton>
        <BigButton variant="secondary" to={home}>
          {t('common.cancel')}
        </BigButton>
      </form>
    </main>
  );
}
