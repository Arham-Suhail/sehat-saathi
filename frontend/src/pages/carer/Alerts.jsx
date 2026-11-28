/* Alerts tab (family / doctor). Everything that needs a look, urgent first:
   - concern     (red)   the elder mentioned a symptom: rings again and again until "Mark as read"
   - med_review  (amber) a medicine the elder couldn't confirm: closes only when someone confirms it
   - missed_dose (amber) a dose was missed or "not taken"
   - meeting             someone asked you to a meeting
   The elder is never shown these. "Done" lists the last 7 days. */
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import ReviewSheet from '../../components/ReviewSheet';
import { ErrorText, TopBar, fmtDay, fmtTime } from '../../components/ui';
import { useCareAlerts } from '../../hooks/useCareAlerts';
import { st } from '../../i18n/server';
import { toUrdu } from '../../i18n/toUrdu';
import { t } from '../../i18n/useT';
import { haptic } from '../../lib/native';

const TONE = {
  concern: { icon: 'heart', ring: 'alert--urgent', chip: 'bg-danger-bg text-danger' },
  med_review: { icon: 'pill', ring: 'alert--important', chip: 'bg-warning-bg text-warning-text' },
  missed_dose: { icon: 'alarm', ring: 'alert--important', chip: 'bg-warning-bg text-warning-text' },
  meeting: { icon: 'calendar', ring: '', chip: 'bg-accent-soft text-accent' },
  vitals: { icon: 'heart', ring: 'alert--important', chip: 'bg-warning-bg text-warning-text' },
  low_mood: { icon: 'chat', ring: 'alert--important', chip: 'bg-warning-bg text-warning-text' },
  inactive: { icon: 'bell', ring: 'alert--important', chip: 'bg-warning-bg text-warning-text' },
  refill: { icon: 'pill', ring: '', chip: 'bg-accent-soft text-accent' },
};

/** One-tap WhatsApp share of an alert (generic text, no symptom details). */
function shareText(a) {
  return `${t('share.prefix')} ${a.elder_name}: ${t(`share.${a.kind}`)} (${fmtDay(a.created_at)} ${fmtTime(a.created_at)})`;
}

function AlertBody({ a }) {
  const d = a.data || {};
  if (a.kind === 'vitals')
    return (
      <p className="m-0 text-[1.15rem]">
        <span className="font-bold">{t(`vitals.short.${d.type}`)}</span> {d.value}{' '}
        <span className="text-muted">· {t(`vitals.flag.${d.flag}`)}</span>
        <span className="block text-[1rem] text-muted">{t('alerts.vitals.note')}</span>
      </p>
    );
  if (a.kind === 'low_mood') return <p className="m-0 text-[1.15rem]">{t('alerts.low_mood')}</p>;
  if (a.kind === 'inactive') return <p className="m-0 text-[1.15rem]">{t('alerts.inactive')}</p>;
  if (a.kind === 'refill')
    return (
      <p className="m-0 text-[1.15rem]">
        <span className="font-bold" dir="auto">{d.medicine_name}</span> · {t('alerts.refill', { n: d.doses_left })}
      </p>
    );
  if (a.kind === 'concern')
    return (
      <>
        <p className="m-0 text-[1.15rem] font-bold text-danger">
          {d.reason === 'fall' ? t('alerts.fall') : d.reason ? st(d.reason) : t('alerts.concern')}
        </p>
        {d.said ? (
          <p className="m-0 mt-1 text-[1.1rem] italic text-muted" dir="auto">
            “{toUrdu(d.said)}”
          </p>
        ) : null}
      </>
    );
  if (a.kind === 'missed_dose')
    return (
      <p className="m-0 text-[1.15rem]">
        <span className="font-bold" dir="auto">
          {st(d.medicine_name)}
        </span>
        {d.dose ? <span className="text-muted"> · {d.dose}</span> : null}
        <span className="block text-muted">
          {d.scheduled_at ? fmtTime(d.scheduled_at) : ''} · {t(d.outcome === 'skipped' ? 'alerts.skipped' : 'alerts.missed')}
        </span>
      </p>
    );
  if (a.kind === 'med_review')
    return (
      <p className="m-0 text-[1.15rem]">
        <span className="font-bold" dir="auto">
          {d.medicine_name} {d.strength ? <span className="font-normal text-muted">{d.strength}</span> : null}
        </span>
        <span className="block text-muted">{t(d.reason === 'asked' ? 'alerts.review.asked' : 'alerts.review.unclear')}</span>
      </p>
    );
  return (
    <p className="m-0 text-[1.15rem]">
      {t('alerts.meeting', { who: d.organiser || '' })}
      {d.starts_at ? <span className="block text-muted">{fmtDay(d.starts_at)} · {fmtTime(d.starts_at)}</span> : null}
    </p>
  );
}

function AlertCard({ a, onRead, onReview }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const tone = TONE[a.kind] || TONE.meeting;
  const read = async () => {
    setBusy(true);
    setErr(null);
    haptic();
    try {
      await onRead(a.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className={`alert-card ${a.open ? tone.ring : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <span className={`row-icon ${tone.chip}`}>
          <Icon name={tone.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-[1.2rem] font-bold">{a.elder_name}</span>
            <span className="text-[0.95rem] text-muted">
              {fmtDay(a.created_at)} · {fmtTime(a.created_at)}
            </span>
          </div>
          {a.severity === 'urgent' && a.open ? <span className="mt-1 inline-flex rounded-full bg-danger px-2.5 py-0.5 text-[0.85rem] font-bold uppercase tracking-wide text-accent-text">{t('alerts.urgent')}</span> : null}
          <div className="mt-1">
            <AlertBody a={a} />
          </div>
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
      {a.open ? (
        <div className="mt-4 flex flex-col gap-2">
          {a.kind === 'med_review' ? (
            <button type="button" onClick={() => onReview(a)} className="app-btn app-btn--primary">
              <Icon name="check" size={22} />
              {t('alerts.review.cta')}
            </button>
          ) : a.kind === 'meeting' ? (
            <Link to="/carer/meetings" className="app-btn app-btn--primary">
              <Icon name="calendar" size={22} />
              {t('alerts.meeting.cta')}
            </Link>
          ) : (
            <button type="button" disabled={busy} onClick={read} className={`app-btn ${a.severity === 'urgent' ? 'app-btn--danger' : 'app-btn--primary'}`}>
              <Icon name="check" size={22} />
              {busy ? t('common.loading') : t('alerts.read')}
            </button>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
          <Link to={`/carer/elder/${a.elder_id}`} className="app-btn app-btn--secondary app-btn--sm">
            {t('alerts.open_dash')}
          </Link>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText(a))}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('share.whatsapp')}
            className="app-btn app-btn--secondary app-btn--sm px-4"
          >
            <Icon name="chat" size={20} />
            {t('share.short')}
          </a>
          </div>
        </div>
      ) : (
        <p className="m-0 mt-3 text-[1rem] text-muted">{a.resolved_by ? t('alerts.done_by', { name: a.resolved_by }) : t('alerts.done')}</p>
      )}
    </motion.li>
  );
}

export default function Alerts() {
  const { alerts, error, markRead, reload } = useCareAlerts();
  const [review, setReview] = useState(null);
  const open = (alerts || []).filter((a) => a.open);
  const done = (alerts || []).filter((a) => !a.open).slice(0, 20);

  return (
    <MotionConfig reducedMotion="user">
      <main className="page flex flex-col gap-4">
        <TopBar title={t('tab.alerts')} />
        <h1 className="m-0">{t('alerts.title')}</h1>
        <ErrorText>{error}</ErrorText>
        {alerts === null ? <div className="h-40 animate-pulse rounded-[24px] bg-surface-alt" aria-label={t('common.loading')} /> : null}
        {alerts && !open.length ? (
          <div className="card-ios flex flex-col items-center gap-3 p-8 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success">
              <Icon name="check" size={34} />
            </span>
            <p className="m-0 text-[1.3rem] font-bold">{t('alerts.none')}</p>
            <p className="m-0 text-[1.05rem] text-muted">{t('alerts.none.sub')}</p>
          </div>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <AnimatePresence initial={false}>
            {open.map((a) => (
              <AlertCard key={a.id} a={a} onRead={markRead} onReview={setReview} />
            ))}
          </AnimatePresence>
        </ul>
        {done.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="done-h">
            <h2 id="done-h" className="section-label">
              {t('alerts.done_title')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {done.map((a) => (
                <AlertCard key={a.id} a={a} onRead={markRead} onReview={setReview} />
              ))}
            </ul>
          </section>
        ) : null}
        <ReviewSheet
          open={!!review}
          alert={review}
          elderId={review?.elder_id}
          medicineId={review?.data?.medicine_id}
          onClose={() => setReview(null)}
          onDone={reload}
        />
      </main>
    </MotionConfig>
  );
}
