/* Elder Home: as simple as possible. One question at a time:
   - a dose is due now  -> one card with two big buttons (Taken / Not taken)
   - otherwise          -> when the next dose is, and how today is going (a ring)
   Then two big rows: talk to Chotu, call for help. A calm note if the family/doctor is checking a
   medicine, and the next meeting. Everything else lives in the tabs (Medicines, Progress, More).
   On the website (not the app) the "All features" tiles stay at the bottom. */
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { readCache, writeCache } from '../../lib/cache';
import { useAuth } from '../../auth/AuthContext';
import ChotuAgent from '../../components/chotu/ChotuAgent';
import ChotuBoundary from '../../components/chotu/ChotuBoundary';
import DoseCard from '../../components/DoseCard';
import Icon from '../../components/Icon';
import { MeetingMini } from '../../components/meetings';
import VerifyEmailBanner from '../../components/VerifyEmailBanner';
import { Disclaimer, fmtTime } from '../../components/ui';
import { useEmergencyContact } from '../../hooks/useElderData';
import { LangToggle } from '../../i18n/LangProvider';
import { st } from '../../i18n/server';
import { getLang, t } from '../../i18n/useT';
import { isAppMode } from '../../lib/appMode';
import { dayOffset } from '../../lib/days';
import { useReminders } from './ElderLayout';
import { ImOkCard, MessagesCard, TipOfDay, Tutorial, WeekSummary } from '../../components/HomeExtras';
import { usePrefs } from '../../lib/prefs';

const pkDate = (d) =>
  new Intl.DateTimeFormat(getLang() === 'ur' ? 'ur-PK' : 'en-PK', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' }).format(d);

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } } };
const DUE_BEFORE = 10 * 60_000; // show the two buttons from 10 minutes before the dose
const DUE_AFTER = 3 * 60 * 60_000; // ...until 3 hours after (it is "missed" for the family after 1 h)

const TILES = [
  { to: '/elder/upload', key: 'upload', icon: 'camera' },
  { to: '/elder/reminders', key: 'reminders', icon: 'pill' },
  { to: '/elder/checkin', key: 'checkin', icon: 'chat' },
  { to: '/elder/vitals', key: 'vitals', icon: 'heart' },
  { to: '/elder/invite', key: 'invite', icon: 'family' },
  { to: '/elder/progress', key: 'progress', icon: 'trophy' },
  { to: '/elder/meetings', key: 'meetings', icon: 'calendar' },
  { to: '/elder/emergency', key: 'emergency', icon: 'phone' },
];

function TodayRing({ today }) {
  if (!today.length) return null;
  const taken = today.filter((r) => r.status === 'taken').length;
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = taken / today.length;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 76 76" width="76" height="76" className="shrink-0" role="img" aria-label={t('home.today.ring', { done: taken, all: today.length })}>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-alt)" strokeWidth="8" />
        <motion.circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="var(--success)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="44" textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 18, fontWeight: 700 }}>
          {taken}/{today.length}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="m-0 text-[1.25rem] font-bold">{t('home.today.title')}</p>
        <p className="m-0 text-[1.1rem] text-muted">{t('home.today.ring', { done: taken, all: today.length })}</p>
      </div>
    </div>
  );
}

function Row({ to, href, icon, title, sub, tone = 'accent' }) {
  const body = (
    <>
      <span className={`row-icon row-icon--${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.3rem] font-bold leading-snug">{title}</span>
        {sub ? <span className="line-clamp-2 block text-[1.05rem] leading-snug text-muted">{sub}</span> : null}
      </span>
      <Icon name="chevron" size={22} className="shrink-0 text-muted rtl:-scale-x-100" />
    </>
  );
  const cls = 'ios-row';
  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
      {href ? (
        <a href={href} className={cls}>
          {body}
        </a>
      ) : (
        <Link to={to} className={cls}>
          {body}
        </Link>
      )}
    </motion.div>
  );
}

export default function ElderHome() {
  const { user, logout } = useAuth();
  const { reminders, act } = useReminders();
  const { contact } = useEmergencyContact();
  // Last known lists draw at once (no jump when switching tabs); fresh ones replace them.
  const [meds, setMeds] = useState(() => readCache('meds', []));
  const [meetings, setMeetings] = useState(() => readCache('meetings', []));
  const { simple } = usePrefs(); // Simple mode: only the dose, Chotu and Help

  useEffect(() => {
    api('/medicines')
      .then((m) => {
        setMeds(m);
        writeCache('meds', m);
      })
      .catch(() => {});
    api('/meetings')
      .then((m) => {
        setMeetings(m);
        writeCache('meetings', m);
      })
      .catch(() => {});
  }, []);

  const now = Date.now();
  const due = reminders.find((r) => {
    if (r.status !== 'pending') return false;
    const at = new Date(r.scheduled_at).getTime();
    return at - now <= DUE_BEFORE && now - at <= DUE_AFTER;
  });
  const next = reminders.find((r) => r.status === 'pending' && new Date(r.scheduled_at).getTime() > now);
  const today = reminders.filter((r) => dayOffset(r.scheduled_at) === 0);
  const checking = meds.filter((m) => m.review_state === 'open');
  const meeting = meetings.find((m) => m.status === 'scheduled' && new Date(m.starts_at).getTime() > now - 3_600_000);
  const tel = contact?.phone?.replace(/[^\d+]/g, '');
  const tel2 = contact?.phone2?.replace(/[^\d+]/g, '');

  return (
    <MotionConfig reducedMotion="user">
      <motion.main className="page flex flex-col gap-5" variants={list} initial="hidden" animate="show">
        <motion.header variants={item} className="flex items-start gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[1.05rem] font-semibold text-muted">{pkDate(new Date())}</p>
            <h1 className="m-0 mt-1 text-[clamp(1.9rem,7vw,2.4rem)] leading-[1.1]">{t('home.greeting', { name: user.name.split(' ')[0] })}</h1>
          </div>
          <LangToggle />
        </motion.header>

        <motion.div variants={item}>
          <VerifyEmailBanner />
        </motion.div>

        <motion.div variants={item}>
          {due ? (
            <div className="dose-pulse">
              <DoseCard reminder={due} onAct={act} />
            </div>
          ) : (
            <section className="card-ios p-5" aria-labelledby="next-h">
              <h2 id="next-h" className="m-0 text-[1.05rem] font-semibold text-muted">
                {next ? t('home.next') : t('home.next.none')}
              </h2>
              {next ? (
                <>
                  <p className="nowrap m-0 mt-2 text-[2.3rem] font-bold leading-none tracking-[-0.03em] [font-variant-numeric:tabular-nums]">
                    {dayOffset(next.scheduled_at) === 1 ? <span className="me-2 text-[1.2rem] font-semibold text-accent">{t('day.tomorrow')}</span> : null}
                    {fmtTime(next.scheduled_at)}
                  </p>
                  <p className="m-0 mt-2 text-[1.35rem] font-semibold" dir="auto">
                    {st(next.medicine_name)}
                    {next.dose ? <span className="font-normal text-muted"> · {next.dose}</span> : null}
                  </p>
                </>
              ) : null}
              {today.length ? (
                <div className="mt-5 border-t border-[var(--hairline)] pt-4">
                  <TodayRing today={today} />
                </div>
              ) : null}
            </section>
          )}
        </motion.div>

        {!simple ? (
          <motion.div variants={item}>
            <MessagesCard />
          </motion.div>
        ) : null}

        {checking.length && !simple ? (
          <motion.div variants={item} role="status" className="flex items-start gap-3 rounded-[22px] bg-warning-bg px-4 py-4 text-warning-text">
            <Icon name="family" size={26} className="shrink-0" />
            <p className="m-0 text-[1.15rem] font-semibold leading-snug">
              {t('home.checking', { names: checking.map((m) => m.name).join(', ') })}
            </p>
          </motion.div>
        ) : null}

        {meeting && !simple ? (
          <motion.div variants={item}>
            <MeetingMini meeting={meeting} to="/elder/meetings" />
          </motion.div>
        ) : null}

        <motion.div variants={item} className="ios-group">
          <Row
            to="/elder/checkin"
            tone="accent"
            icon={
              <ChotuBoundary>
                <ChotuAgent size={34} state="idle" />
              </ChotuBoundary>
            }
            title={t('home.talk')}
            sub={t('home.talk.sub')}
          />
          {contact ? (
            <Row href={`tel:${tel}`} tone="danger" icon={<Icon name="phone" size={24} />} title={t('home.madad')} sub={t('home.madad.to', { name: contact.name })} />
          ) : (
            <Row to="/elder/emergency" tone="danger" icon={<Icon name="phone" size={24} />} title={t('home.madad.setup')} sub={t('home.madad.setup.sub')} />
          )}
          {tel2 ? (
            <Row href={`tel:${tel2}`} tone="neutral" icon={<Icon name="phone" size={24} />} title={t('home.madad2')} sub={t('home.madad.to', { name: contact.name2 })} />
          ) : null}
          {!simple ? (
            <Row to="/elder/upload" tone="neutral" icon={<Icon name="camera" size={24} />} title={t('home.upload')} sub={t('home.upload.sub')} />
          ) : null}
        </motion.div>

        {!simple ? (
          <>
            <motion.div variants={item}>
              <ImOkCard />
            </motion.div>
            <motion.div variants={item}>
              <WeekSummary userId={user.id} />
            </motion.div>
            <motion.div variants={item}>
              <TipOfDay />
            </motion.div>
          </>
        ) : null}
        <Tutorial />

        {isAppMode() ? (
          <motion.div variants={item}>
            <Disclaimer />
          </motion.div>
        ) : (
          <>
            <motion.nav variants={item} aria-labelledby="all-title">
              <h2 id="all-title" className="m-0 mb-3 text-[1.3rem] font-bold">
                {t('home.all')}
              </h2>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
                {TILES.map((x) => (
                  <li key={x.key}>
                    <Link to={x.to} className="card-ios flex h-full min-h-[7.5rem] flex-col gap-3 p-4 text-ink no-underline transition-transform duration-150 active:scale-[0.97]">
                      <span className="row-icon row-icon--accent">
                        <Icon name={x.icon} size={24} />
                      </span>
                      <span className="text-[1.15rem] font-bold leading-snug">{t(`home.${x.key}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.nav>
            <motion.div variants={item} className="flex flex-col items-center gap-2">
              <Disclaimer />
              <button type="button" onClick={logout} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-6 text-[1.15rem] font-bold text-muted">
                <Icon name="logout" size={22} />
                {t('home.logout')}
              </button>
              <Link to="/account/delete" className="inline-flex min-h-12 items-center gap-2 px-4 text-[1.1rem] font-bold text-danger">
                <Icon name="trash" size={20} />
                {t('delete.link')}
              </Link>
            </motion.div>
          </>
        )}
      </motion.main>
    </MotionConfig>
  );
}
