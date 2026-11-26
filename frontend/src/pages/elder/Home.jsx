/* Elder Home (Stage B, richer): date + greeting with Chotu, the "Madad" call button, the next dose
   (the one primary card), streak and water cards, a daily general-wellness tip, and category tiles
   for every screen. Cards reveal in a gentle stagger; tiles respond to tap. Reduced motion: static. */
import { MotionConfig, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import ChotuAgent from '../../components/chotu/ChotuAgent';
import ChotuBoundary from '../../components/chotu/ChotuBoundary';
import Icon from '../../components/Icon';
import { Disclaimer, fmtTime } from '../../components/ui';
import { useEmergencyContact, useProgress, useWater } from '../../hooks/useElderData';
import { t } from '../../i18n/useT';
import { BADGES } from '../../lib/streaks';
import { WATER_GOAL } from '../../lib/water';
import { useReminders } from './ElderLayout';

const TIP_COUNT = 20;
const PK_DATE = new Intl.DateTimeFormat('en-PK', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' });

const list = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const TILES = [
  { to: '/elder/upload', key: 'upload', icon: 'camera', tint: 'bg-accent-soft text-accent' },
  { to: '/elder/reminders', key: 'reminders', icon: 'pill', tint: 'bg-gold-soft text-gold-text' },
  { to: '/elder/checkin', key: 'checkin', icon: 'chotu', tint: 'bg-accent-soft text-accent' },
  { to: '/elder/vitals', key: 'vitals', icon: 'heart', tint: 'bg-danger-bg text-danger' },
  { to: '/elder/invite', key: 'invite', icon: 'family', tint: 'bg-gold-soft text-gold-text' },
  { to: '/elder/progress', key: 'progress', icon: 'trophy', tint: 'bg-success-bg text-success' },
  { to: '/elder/emergency', key: 'emergency', icon: 'phone', tint: 'bg-danger-bg text-danger' },
];

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86_400_000);
}

function MadadButton({ contact }) {
  if (contact === undefined) return <div className="h-[4.5rem]" aria-hidden="true" />;
  if (!contact) {
    return (
      <Link
        to="/elder/emergency"
        className="flex min-h-[4.5rem] items-center gap-4 rounded-3xl border-2 border-dashed border-danger bg-surface px-5 py-3 text-ink no-underline transition-transform duration-150 active:scale-[0.98]"
      >
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger-bg text-danger">
          <Icon name="phone" size={26} />
        </span>
        <span className="flex flex-col">
          <span className="text-[1.3rem] font-bold leading-snug">{t('home.madad.setup')}</span>
          <span className="text-[1.25rem] text-muted">{t('home.madad.setup.sub')}</span>
        </span>
      </Link>
    );
  }
  const tel = contact.phone.replace(/[^\d+]/g, '');
  return (
    <a
      href={`tel:${tel}`}
      className="flex min-h-[4.5rem] items-center gap-4 rounded-3xl bg-danger px-5 py-3 text-accent-text no-underline shadow-lift transition-transform duration-150 active:scale-[0.98]"
    >
      <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-danger">
        <Icon name="phone" size={26} />
      </span>
      <span className="flex flex-col">
        <span className="text-[1.4rem] font-bold leading-snug">{t('home.madad')}</span>
        <span className="text-[1.25rem]">{t('home.madad.to', { name: contact.name })}</span>
      </span>
    </a>
  );
}

function WaterCard({ water }) {
  const done = water.count >= WATER_GOAL;
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="water" size={24} />
        </span>
        <h2 className="m-0 text-[1.3rem] font-bold">{t('home.water.title')}</h2>
      </div>
      <p className="m-0 text-[1.5rem] font-bold [font-variant-numeric:tabular-nums]" aria-live="polite">
        {t('home.water.count', { n: water.count, goal: WATER_GOAL })}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: WATER_GOAL }, (_, i) => (
          <motion.span
            key={i}
            className={`h-3 flex-1 origin-bottom rounded-full ${i < water.count ? 'bg-accent' : 'bg-line'}`}
            animate={{ scaleY: i < water.count ? 1 : 0.6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          />
        ))}
      </div>
      {done ? <p className="m-0 text-[1.25rem] font-bold text-success">{t('home.water.done')}</p> : null}
      <div className="grid grid-cols-[3.5rem_1fr] gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => water.change(-1)}
          disabled={water.count === 0}
          aria-label={t('home.water.remove')}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface text-ink disabled:opacity-40"
        >
          <Icon name="minus" size={22} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => water.change(1)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-0 bg-accent-soft text-[1.25rem] font-bold text-accent"
        >
          <Icon name="plus" size={22} />
          {t('home.water.add')}
        </motion.button>
      </div>
    </div>
  );
}

function StreakCard({ progress }) {
  const streak = progress?.streak ?? 0;
  return (
    <Link
      to="/elder/progress"
      className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 text-ink no-underline shadow-soft transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-soft text-gold-text"
          animate={streak > 0 ? { rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <Icon name="flame" size={24} />
        </motion.span>
        <h2 className="m-0 text-[1.3rem] font-bold">{t('home.streak.title')}</h2>
      </div>
      <p className="m-0 text-[1.5rem] font-bold [font-variant-numeric:tabular-nums]">
        {progress ? (streak > 0 ? t('home.streak.days', { n: streak }) : t('home.streak.zero')) : '…'}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="flex -space-x-2" aria-hidden="true">
          {(progress?.badges || BADGES).map((b) => (
            <span
              key={b.id}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface ${b.earned ? 'bg-gold text-ink' : 'bg-line text-muted'}`}
            >
              <Icon name={b.icon} size={16} />
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1 text-[1.25rem] font-bold text-accent">
          {t('home.streak.badges', { n: progress?.earned ?? 0, total: BADGES.length })}
          <Icon name="chevron" size={20} />
        </span>
      </div>
    </Link>
  );
}

export default function ElderHome() {
  const { user, logout } = useAuth();
  const { reminders } = useReminders();
  const progress = useProgress(user.id);
  const { contact } = useEmergencyContact();
  const water = useWater(user.id);
  const now = Date.now();
  const next = reminders.find((r) => r.status === 'pending' && new Date(r.scheduled_at).getTime() >= now - 60 * 60_000);
  const tip = t(`tip.${(dayOfYear() % TIP_COUNT) + 1}`);

  return (
    <MotionConfig reducedMotion="user">
      <motion.main className="page flex flex-col gap-5" variants={list} initial="hidden" animate="show">
        <motion.header variants={item} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[1.25rem] font-bold text-muted">{PK_DATE.format(new Date())}</p>
            <h1 className="m-0 text-[clamp(1.7rem,6vw,2.2rem)] leading-tight">{t('home.greeting', { name: user.name.split(' ')[0] })}</h1>
          </div>
          <Link to="/elder/checkin" aria-label={t('home.checkin')} className="shrink-0 rounded-full">
            <ChotuBoundary>
              <ChotuAgent size={64} state="idle" />
            </ChotuBoundary>
          </Link>
        </motion.header>

        <motion.div variants={item}>
          <MadadButton contact={contact} />
        </motion.div>

        <motion.section variants={item} aria-labelledby="next-title" className="relative overflow-hidden rounded-3xl bg-accent p-6 text-accent-text shadow-lift">
          <span
            aria-hidden="true"
            className="absolute -right-10 -top-10 h-40 w-40 rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
          />
          <h2 id="next-title" className="m-0 flex items-center gap-2 text-[1.3rem] font-bold">
            <Icon name="bell" size={22} />
            {t('home.next')}
          </h2>
          {next ? (
            <>
              <p className="m-0 mt-3 text-[2.4rem] font-bold leading-none [font-variant-numeric:tabular-nums]">{fmtTime(next.scheduled_at)}</p>
              <p className="m-0 mt-2 text-[1.4rem] font-bold leading-snug">
                {next.medicine_name}
                {next.dose ? <span className="font-normal"> ({next.dose})</span> : null}
              </p>
            </>
          ) : (
            <p className="m-0 mt-3 text-[1.3rem]">{t('home.next.none')}</p>
          )}
          <Link
            to="/elder/reminders"
            className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-surface px-5 text-[1.25rem] font-bold text-accent no-underline transition-transform duration-150 active:scale-[0.97]"
          >
            {t('home.next.cta')}
            <Icon name="chevron" size={20} />
          </Link>
        </motion.section>

        {water.nudge ? (
          <motion.p
            variants={item}
            role="status"
            className="m-0 flex items-center gap-3 rounded-2xl bg-warning-bg px-4 py-3 text-[1.25rem] font-bold text-warning-text"
          >
            <Icon name="water" size={24} />
            {t('home.water.nudge')}
          </motion.p>
        ) : null}

        <motion.div variants={item} className="grid gap-4 sm:grid-cols-2">
          <StreakCard progress={progress} />
          <WaterCard water={water} />
        </motion.div>

        <motion.section variants={item} aria-labelledby="tip-title" className="rounded-3xl border border-line bg-surface-alt p-5">
          <h2 id="tip-title" className="m-0 flex items-center gap-2 text-[1.3rem] font-bold text-gold-text">
            <Icon name="sparkle" size={22} />
            {t('home.tip.title')}
          </h2>
          <p className="m-0 mt-2 text-[1.35rem] font-bold leading-snug text-ink">{tip}</p>
          <p className="m-0 mt-1 text-[1.25rem] text-muted">{t('home.tip.note')}</p>
        </motion.section>

        <motion.nav variants={item} aria-labelledby="all-title">
          <h2 id="all-title" className="m-0 mb-3 text-[1.4rem] font-bold">
            {t('home.all')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
            {TILES.map((x) => (
              <li key={x.key} className={x.key === 'emergency' ? 'col-span-2 sm:col-span-1' : ''}>
                <motion.div whileTap={{ scale: 0.96 }} whileHover={{ y: -3 }} className="h-full">
                  <Link
                    to={x.to}
                    className="flex h-full min-h-[8.5rem] flex-col gap-3 rounded-3xl border border-line bg-surface p-4 text-ink no-underline shadow-soft"
                  >
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${x.tint}`}>
                      {x.icon === 'chotu' ? (
                        <ChotuBoundary>
                          <ChotuAgent size={36} />
                        </ChotuBoundary>
                      ) : (
                        <Icon name={x.icon} size={26} />
                      )}
                    </span>
                    <span className="text-[1.25rem] font-bold leading-snug">{t(`home.${x.key}`)}</span>
                  </Link>
                </motion.div>
              </li>
            ))}
          </ul>
        </motion.nav>

        <motion.div variants={item} className="flex flex-col gap-3">
          <Disclaimer />
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-12 items-center justify-center gap-2 self-center rounded-full border border-line bg-surface px-6 text-[1.25rem] font-bold text-muted"
          >
            <Icon name="logout" size={22} />
            {t('home.logout')}
          </button>
        </motion.div>
      </motion.main>
    </MotionConfig>
  );
}
