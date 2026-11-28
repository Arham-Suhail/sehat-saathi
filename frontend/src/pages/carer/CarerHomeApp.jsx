import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import { ErrorText, Notice, fmtTime } from '../../components/ui';
import { useCarerOverview } from '../../hooks/useCarerData';
import { useCareAlerts } from '../../hooks/useCareAlerts';
import { t } from '../../i18n/useT';
import { onlyDigits } from '../../lib/digits';
import { karachiToday, progressFrom } from '../../lib/streaks';
import { dayOffset } from '../../lib/days';

/* Family / doctor home in app mode: a status strip, one rich card per linked elder (mood, doses on
   time, streak, latest BP) and "connect an elder" behind one button. */
const MOOD_EMOJI = { good: '🙂', okay: '😐', low: '🙁' };
const initials = (name) =>
  (name.match(/\p{L}+/gu) || [])
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '•';
const list = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } };

// "Dr. Sana (Demo)" -> "Sana": skip titles so the greeting uses the person's name.
const firstName = (name) => name.split(/\s+/).find((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w)) || name;

function when(iso) {
  const off = dayOffset(iso);
  if (off === 0) return `${t('day.today')} · ${fmtTime(iso)}`;
  if (off === -1) return `${t('day.yesterday')} · ${fmtTime(iso)}`;
  return fmtTime(iso);
}

function Stat({ icon, value, label, tone }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-3 ${tone}`}>
      <span className="flex items-center gap-1.5 text-[1.45rem] font-bold leading-none [font-variant-numeric:tabular-nums]">
        <Icon name={icon} size={20} />
        {value}
      </span>
      <span className="text-[0.95rem] font-bold leading-tight opacity-90">{label}</span>
    </div>
  );
}

function ElderCard({ e }) {
  const d = e.dash;
  const last = d?.checkins?.[0];
  const pct = d?.adherence_totals?.adherence_pct;
  const streak = d ? progressFrom(d, karachiToday()).streak : 0;
  const bp = d?.vitals?.find((v) => v.type === 'bp');
  const concerns = d?.concerns || 0;
  return (
    <motion.li variants={item}>
      <motion.div whileTap={{ scale: 0.98 }}>
        <Link to={`/carer/elder/${e.id}`} className="card-ios block p-5 text-ink no-underline">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-[1.35rem] font-bold text-accent-text">
              {initials(e.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[1.35rem] font-bold leading-tight">{e.name}</p>
              <p className="m-0 truncate text-[1.05rem] text-muted">
                {last ? (
                  <>
                    {MOOD_EMOJI[last.mood]} {t(`mood.${last.mood}`)} · {when(last.created_at)}
                  </>
                ) : (
                  t('chart.no_checkins')
                )}
              </p>
            </div>
            {concerns ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-bg px-3 py-1 text-[1rem] font-bold text-danger">
                ⚠ {concerns}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-success-bg px-3 py-1 text-[1rem] font-bold text-success">
                {t('carerapp.ok')}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat icon="check" value={pct == null ? '—' : `${pct}%`} label={t('carerapp.on_time')} tone="bg-accent-soft text-accent" />
            <Stat icon="flame" value={streak} label={t('carerapp.streak')} tone="bg-gold-soft text-gold-text" />
            <Stat icon="heart" value={bp ? `${bp.systolic}/${bp.diastolic}` : '—'} label={t('carerapp.bp')} tone="bg-danger-bg text-danger" />
          </div>
          <p className="m-0 mt-3 flex items-center justify-end gap-1 text-[1.1rem] font-bold text-accent">
            {t('carer.open')}
            <Icon name="chevron" size={20} className="rtl:-scale-x-100" />
          </p>
        </Link>
      </motion.div>
    </motion.li>
  );
}

export default function CarerHomeApp() {
  const { user, refresh } = useAuth();
  const { elders, error, reload } = useCarerOverview();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const doctor = user.role === 'doctor';
  const { open: attention, alerts } = useCareAlerts();
  const urgent = (alerts || []).some((a) => a.open && a.severity === 'urgent');

  const redeem = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const elder = await api('/invites/redeem', { method: 'POST', json: { code } });
      setOk(t('carer.linked', { name: elder.name }));
      setCode('');
      setAdding(false);
      await refresh();
      await reload();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <motion.main className="page flex flex-col gap-5" variants={list} initial="hidden" animate="show">
        <motion.header variants={item}>
          <p className="m-0 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[1.05rem] font-bold text-accent">
            <Icon name={doctor ? 'stethoscope' : 'family'} size={18} />
            {t(doctor ? 'auth.role.doctor' : 'auth.role.family')}
          </p>
          <h1 className="m-0 mt-2 text-[clamp(1.7rem,6vw,2.2rem)] leading-tight">{t('home.greeting', { name: firstName(user.name) })}</h1>
        </motion.header>

        {alerts ? (
          <motion.div variants={item}>
            <Link
              to="/carer/alerts"
              className={`flex items-center gap-3 rounded-[22px] p-4 no-underline ${attention ? (urgent ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning-text') : 'bg-success-bg text-success'}`}
            >
              <Icon name={attention ? 'bell' : 'check'} size={26} />
              <span className="flex-1 text-[1.2rem] font-bold leading-snug">
                {attention ? t('carerapp.attention', { n: attention }) : t('carerapp.all_ok')}
              </span>
              <Icon name="chevron" size={22} className="rtl:-scale-x-100" />
            </Link>
          </motion.div>
        ) : null}

        <section aria-labelledby="elders-h" className="flex flex-col gap-3">
          <h2 id="elders-h" className="m-0 text-[1.3rem] font-bold">
            {t(doctor ? 'carerapp.patients' : 'carer.elders')}
          </h2>
          {error ? <ErrorText>{error}</ErrorText> : null}
          {elders === null ? <div className="h-48 animate-pulse rounded-[28px] bg-surface-alt" aria-label={t('common.loading')} /> : null}
          {elders?.length === 0 ? <p className="m-0 text-[1.15rem] text-muted">{t('carer.none')}</p> : null}
          <motion.ul variants={list} className="m-0 flex list-none flex-col gap-4 p-0">
            {elders?.map((e) => (
              <ElderCard key={e.id} e={e} />
            ))}
          </motion.ul>
        </section>

        {ok ? <Notice kind="success">✓ {ok}</Notice> : null}
        <motion.div variants={item}>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="app-btn app-btn--secondary w-full">
              <Icon name="plus" size={24} />
              {t('carer.add')}
            </button>
          ) : null}
          <AnimatePresence>
            {adding ? (
              <motion.form
                key="add"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={redeem}
                noValidate
                className="flex flex-col gap-3 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-soft"
              >
                <label htmlFor="code" className="text-[1.2rem] font-bold">
                  {t('carer.code')}
                </label>
                <input
                  id="code"
                  dir="ltr"
                  className="input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
                  style={{ letterSpacing: '0.3em', fontSize: '1.4em', textAlign: 'center' }}
                />
                <small className="text-[1rem] text-muted">{t('carer.code.hint')}</small>
                <ErrorText>{err}</ErrorText>
                <button type="submit" disabled={busy || code.length !== 6} className="app-btn app-btn--primary disabled:opacity-50">
                  {busy ? t('carer.checking') : t('carer.join')}
                </button>
                <button type="button" onClick={() => setAdding(false)} className="min-h-12 border-0 bg-transparent text-[1.1rem] font-bold text-muted">
                  {t('carerapp.cancel')}
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.main>
    </MotionConfig>
  );
}
