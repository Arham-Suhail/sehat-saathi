import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import VerifyEmailBanner from '../../components/VerifyEmailBanner';
import { onlyDigits } from '../../lib/digits';
import { BigButton, ErrorText, Field, Notice } from '../../components/ui';
import { usePush } from '../../hooks/usePush';
import { LangToggle } from '../../i18n/LangProvider';
import { t } from '../../i18n/useT';

// Up to two letters; names without letters fall back to a neutral dot.
const initials = (name) =>
  (name.match(/\p{L}+/gu) || [])
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '•';

// Stage B: sections fade up in a short stagger; elder cards respond to tap. Reduced motion: static.
const list = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

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
      setOk(t('carer.linked', { name: elder.name }));
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
    <MotionConfig reducedMotion="user">
      <motion.main className="page stack" variants={list} initial="hidden" animate="show">
        <motion.header variants={item} className="spaced">
          <div>
            <p className="m-0 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[1.25rem] font-bold text-accent">
              <Icon name={user.role === 'doctor' ? 'stethoscope' : 'family'} size={20} />
              {user.role === 'doctor' ? t('auth.role.doctor') : t('landing.cta.chip.family')}
            </p>
            <h1 className="mt-2">{t('home.greeting', { name: user.name.split(' ')[0] })}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LangToggle />
            <BigButton variant="secondary" block={false} small onClick={logout}>
              {t('common.logout')}
            </BigButton>
          </div>
        </motion.header>
        <motion.div variants={item}>
          <VerifyEmailBanner />
        </motion.div>

        {push.state === 'on' ? <Notice kind="success">🔔 {t('push.carer.enabled')}</Notice> : null}
        {push.state === 'denied' ? <Notice kind="warning">{t('push.denied')}</Notice> : null}
        {push.state === 'off' ? (
          <BigButton variant="secondary" onClick={push.enable}>
            {t('push.carer.on')}
          </BigButton>
        ) : null}
        <ErrorText>{push.error}</ErrorText>
        <p className="muted">{user.role === 'doctor' ? 'Doctor' : 'Family'} account · sirf dekhne ke liye</p>

        <motion.section variants={item} className="card stack" aria-labelledby="elders-h">
          <h2 id="elders-h">{t('carer.elders')}</h2>
          {elders === null ? <p className="muted">…</p> : null}
          {elders?.length === 0 ? <p className="muted">{t('carer.none')}</p> : null}
          <div className="stack">
            {elders?.map((e) => (
              <motion.div key={e.id} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}>
                <Link to={`/carer/elder/${e.id}`} className="tile tile--icon">
                  <span className="avatar" aria-hidden="true">
                    {initials(e.name)}
                  </span>
                  <span className="tile__text">
                    <span>{e.name}</span>
                    <small>{t('carer.open')}</small>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.form variants={item} className="card stack" onSubmit={redeem} noValidate>
          <h2>{t('carer.add')}</h2>
          <Field id="code" label={t('carer.code')} hint={t('carer.code.hint')}>
            <input
              id="code"
              dir="ltr"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              value={code}
              // No maxLength: the code is shown as "123 456" and a pasted copy includes the space, which
              // maxLength would count and cut the last digit. Keep digits only (Urdu digits too).
              onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
              aria-describedby="code-hint"
              style={{ letterSpacing: '0.3em', fontSize: '1.4em' }}
            />
          </Field>
          <ErrorText>{err}</ErrorText>
          {ok ? <Notice kind="success">✓ {ok}</Notice> : null}
          <BigButton type="submit" disabled={busy || code.length !== 6}>
            {busy ? t('carer.checking') : t('carer.join')}
          </BigButton>
        </motion.form>
        <motion.div variants={item} className="flex justify-center">
          <Link
            to="/account/delete"
            className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.25rem] font-bold text-danger"
          >
            <Icon name="trash" size={20} />
            {t('delete.link')}
          </Link>
        </motion.div>
      </motion.main>
    </MotionConfig>
  );
}
