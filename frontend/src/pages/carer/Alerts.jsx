import { MotionConfig, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { TopBar, fmtDay, fmtTime } from '../../components/ui';
import { concernsFrom, useCarerOverview } from '../../hooks/useCarerData';
import { toUrdu } from '../../i18n/toUrdu';
import { t } from '../../i18n/useT';

/* Alerts tab (family / doctor): everything that needs a look, across all linked elders:
   check-ins flagged as a concern, and doses missed today. Tapping opens that elder's dashboard. */
const list = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

export default function Alerts() {
  const { elders, error } = useCarerOverview();
  const concerns = concernsFrom(elders).slice(0, 30);
  const missedToday = (elders || [])
    .map((e) => {
      const today = e.dash?.adherence?.at(-1);
      return { elder: e, n: today?.missed || 0 };
    })
    .filter((x) => x.n > 0);

  return (
    <MotionConfig reducedMotion="user">
      <main className="page flex flex-col gap-4">
        <TopBar title={t('tab.alerts')} />
        <h1 className="m-0">{t('alerts.title')}</h1>
        {error ? <p className="text-danger">{error}</p> : null}
        {elders === null ? <p className="text-muted">{t('common.loading')}</p> : null}
        {elders && !concerns.length && !missedToday.length ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-8 text-center shadow-soft">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success">
              <Icon name="check" size={34} />
            </span>
            <p className="m-0 text-[1.3rem] font-bold">{t('alerts.none')}</p>
          </div>
        ) : null}
        <motion.ul variants={list} initial="hidden" animate="show" className="m-0 flex list-none flex-col gap-3 p-0">
          {missedToday.map(({ elder, n }) => (
            <motion.li key={`m-${elder.id}`} variants={item}>
              <Link to={`/carer/elder/${elder.id}`} className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 text-ink no-underline shadow-soft">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning-bg text-warning-text">
                  <Icon name="pill" size={24} />
                </span>
                <span className="flex-1">
                  <span className="block text-[1.2rem] font-bold">{elder.name}</span>
                  <span className="text-[1.1rem] text-muted">{t('alerts.missed_today', { n })}</span>
                </span>
                <Icon name="chevron" size={22} className="text-muted rtl:-scale-x-100" />
              </Link>
            </motion.li>
          ))}
          {concerns.map((c) => (
            <motion.li key={c.id} variants={item}>
              <Link to={`/carer/elder/${c.elder.id}`} className="flex gap-4 rounded-3xl border border-danger bg-surface p-4 text-ink no-underline shadow-soft">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger-bg text-danger">
                  <Icon name="heart" size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[1.2rem] font-bold">{c.elder.name}</span>
                    <span className="text-[1rem] text-muted">
                      {fmtDay(c.created_at)} · {fmtTime(c.created_at)}
                    </span>
                  </span>
                  <span className="block text-[1.1rem] font-bold text-danger">{c.concern_reason || t('dash.attention')}</span>
                  {c.transcript?.filter((x) => x.role === 'elder').slice(0, 1).map((x, i) => (
                    <span key={i} className="mt-1 block text-[1.05rem] italic text-muted" dir="auto">
                      “{toUrdu(x.text)}”
                    </span>
                  ))}
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      </main>
    </MotionConfig>
  );
}
