/* One elder's dashboard for family and doctors: a full progress report (adherence trend, per
   medicine, time of day, on-time rate, mood, BP / sugar), the medicines with the diagnosis as
   written and any medicine waiting to be checked, the check-in timeline and vitals.
   App mode: one section at a time under a segmented control. Website: everything on one page. */
import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import Alternatives from '../../components/Alternatives';
import { AdherenceBars, AdherenceTrend, MoodChart, PctBars, SlotBars, VitalsChart } from '../../components/charts';
import Icon from '../../components/Icon';
import ReviewSheet from '../../components/ReviewSheet';
import SafeBoundary from '../../components/SafeBoundary';
import Segmented from '../../components/Segmented';
import { BigButton, Disclaimer, ErrorText, TopBar, fmtDay, fmtHHMM, fmtTime } from '../../components/ui';
import VitalsForm from '../../components/VitalsForm';
import VitalsList from '../../components/VitalsList';
import { useCareAlerts } from '../../hooks/useCareAlerts';
import { st } from '../../i18n/server';
import { toUrdu } from '../../i18n/toUrdu';
import { t } from '../../i18n/useT';
import { isAppMode } from '../../lib/appMode';
import { karachiToday, progressFrom } from '../../lib/streaks';

const reveal = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.32, 0.72, 0, 1] },
};
const MOOD_EMOJI = { good: '🙂', okay: '😐', low: '🙁' };

function Card({ title, icon, children, className = '', aside }) {
  return (
    <motion.section {...reveal} className={`card-ios p-5 ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="m-0 flex items-center gap-2 text-[1.2rem] font-bold">
            {icon ? <Icon name={icon} size={22} className="text-accent" /> : null}
            {title}
          </h2>
          {aside}
        </div>
      ) : null}
      {children}
    </motion.section>
  );
}

function Kpi({ value, label, tone = 'text-ink' }) {
  return (
    <div className="card-ios flex flex-col gap-1 p-4">
      <span className={`text-[1.9rem] font-bold leading-none tracking-[-0.03em] [font-variant-numeric:tabular-nums] ${tone}`}>{value}</span>
      <span className="text-[1rem] font-semibold leading-tight text-muted">{label}</span>
    </div>
  );
}

function Timeline({ checkins }) {
  if (!checkins.length) return <p className="m-0 text-muted">{t('chart.no_checkins')}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {checkins.map((c) => (
        <li key={c.id} className={`rounded-[18px] p-4 ${c.concern_flag ? 'bg-danger-bg' : 'bg-surface-alt'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <strong className="text-[1.15rem]">
              {MOOD_EMOJI[c.mood]} {t(`mood.${c.mood}`)}
            </strong>
            <span className="text-[0.95rem] text-muted">
              {fmtDay(c.created_at)} {fmtTime(c.created_at)} · {t(`dash.channel.${c.channel}`)}
            </span>
          </div>
          {c.concern_flag ? (
            <p className="m-0 mt-1 text-[1.05rem] font-bold text-danger">
              ⚠ {t('dash.attention')} {c.concern_reason ? `· ${st(c.concern_reason)}` : ''}
            </p>
          ) : null}
          {c.transcript
            .filter((x) => x.role === 'elder')
            .map((x, i) => (
              <p key={i} className="m-0 mt-1 text-[1.05rem] italic text-muted">
                “<span dir="auto">{toUrdu(x.text)}</span>”
              </p>
            ))}
        </li>
      ))}
    </ul>
  );
}

function schedule(m) {
  if (m.reminder_mode === 'hospital') return t('dash.hospital');
  if (m.reminder_mode === 'prn') return `${t('confirm.prn')}${m.prn_condition ? `: ${m.prn_condition}` : ''}`;
  return m.timings.map(fmtHHMM).join(', ');
}

function MedRow({ m, onReview }) {
  return (
    <li className="flex flex-col gap-2 border-b border-[var(--hairline)] py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="row-icon row-icon--accent">
          <Icon name="pill" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[1.2rem] font-bold" dir="auto">
            {m.name} {m.strength_text ? <span className="font-normal text-muted">{m.strength_text}</span> : null}
          </p>
          <p className="m-0 text-[1rem] text-muted">
            {[m.dose_text, st(m.frequency_label), m.route_kind !== 'unknown' ? st(m.route_label) : null].filter(Boolean).join(' · ')}
          </p>
          <p className="m-0 text-[1.05rem]">{schedule(m)}</p>
          {m.original_text ? (
            <p className="m-0 mt-1 font-mono text-[0.9rem] text-muted" dir="auto">
              {t('dash.as_written')}: {m.original_text}
            </p>
          ) : null}
        </div>
      </div>
      {m.review_state === 'open' ? (
        <div className="flex flex-col gap-2 rounded-[16px] bg-warning-bg p-3 text-warning-text">
          <p className="m-0 text-[1.05rem] font-semibold">
            {m.on_hold ? t('dash.review.hold') : m.review_reason === 'asked' ? t('dash.review.asked') : t('dash.review.unclear')}
          </p>
          <button type="button" onClick={() => onReview(m)} className="app-btn app-btn--primary">
            <Icon name="check" size={22} />
            {t('alerts.review.cta')}
          </button>
        </div>
      ) : null}
      {m.review_state === 'done' ? (
        <p className="m-0 flex items-center gap-2 text-[1rem] font-semibold text-success">
          <Icon name="check" size={18} />
          {t('dash.review.done', { name: m.reviewed_by || '' })}
          {m.review_note ? <span className="font-normal text-muted" dir="auto">· {m.review_note}</span> : null}
        </p>
      ) : null}
      <SafeBoundary>
        <Alternatives medicine={m} />
      </SafeBoundary>
    </li>
  );
}

export default function Dashboard() {
  const { elderId } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const care = useCareAlerts();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [contact, setContact] = useState(null);
  const [seg, setSeg] = useState(params.get('seg') || 'report');
  const [review, setReview] = useState(null);

  useEffect(() => {
    api(`/emergency-contact?elder_id=${encodeURIComponent(elderId)}`)
      .then(setContact)
      .catch(() => setContact(null));
  }, [elderId]);

  const load = useCallback(async () => {
    try {
      setD(await api(`/dashboard/${encodeURIComponent(elderId)}?days=30`, { timeoutMs: 60000 }));
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, [elderId]);
  useEffect(() => {
    load();
  }, [load]);

  if (err && !d)
    return (
      <main className="page flex flex-col gap-4">
        <TopBar back="/carer" />
        <ErrorText>{err}</ErrorText>
      </main>
    );
  if (!d)
    return (
      <main className="page flex flex-col gap-4">
        <TopBar back="/carer" />
        <div className="h-36 animate-pulse rounded-[24px] bg-surface-alt" />
        <div className="h-64 animate-pulse rounded-[24px] bg-surface-alt" />
      </main>
    );

  const tot = d.adherence_totals;
  const rep = d.report || {};
  const streak = progressFrom(d, karachiToday()).streak;
  const app = isAppMode();
  const show = (s) => !app || seg === s;
  const last = d.checkins[0];
  const reviews = d.medicines.filter((m) => m.review_state === 'open');
  const diagnoses = (d.prescriptions || []).filter((p) => p.diagnosis_text);
  const doctor = user.role === 'doctor';

  return (
    <MotionConfig reducedMotion="user">
      <main className="page page--wide flex flex-col gap-4">
        <TopBar
          back="/carer"
          title={d.elder.name}
          right={
            <BigButton variant="secondary" small block={false} onClick={load} aria-label={t('dash.refresh')}>
              ↻
            </BigButton>
          }
        />

        <section className="card-ios p-5">
          <p className="m-0 text-[1rem] font-semibold text-muted">{t('dash.days_label', { days: d.days })}</p>
          <h1 className="m-0 mt-1 text-[2rem] leading-tight">{d.elder.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {last ? (
              <span className="chip-ios">
                {MOOD_EMOJI[last.mood]} {t(`mood.${last.mood}`)} · {fmtDay(last.created_at)}
              </span>
            ) : null}
            <span className="chip-ios">
              ✓ {tot.adherence_pct == null ? '—' : `${tot.adherence_pct}%`} {t('report.taken_short')}
            </span>
            {reviews.length ? <span className="chip-ios chip-ios--warn">⚠ {t('dash.review.count', { n: reviews.length })}</span> : null}
            {d.concerns ? <span className="chip-ios chip-ios--danger">⚠ {t('dash.concerns', { n: d.concerns })}</span> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/carer/meetings?new=1&elder=${encodeURIComponent(d.elder.id)}`} className="app-btn app-btn--primary app-btn--sm">
              <Icon name="calendar" size={20} />
              {doctor ? t('dash.call_meeting') : t('dash.meet_doctor')}
            </Link>
            {contact ? (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="app-btn app-btn--secondary app-btn--sm">
                <Icon name="phone" size={20} />
                {t('dash.call', { name: contact.name })}
              </a>
            ) : (
              <span className="app-btn app-btn--secondary app-btn--sm opacity-60">{t('dash.no_contact.short')}</span>
            )}
          </div>
        </section>

        {app ? (
          <Segmented
            id="dash"
            label={t('dash.sections')}
            value={seg}
            onChange={setSeg}
            options={[
              ['report', t('dash.seg.report')],
              ['meds', t('dash.seg.meds')],
              ['checkins', t('dash.seg.checkins')],
              ['vitals', t('dash.seg.vitals')],
            ]}
          />
        ) : null}

        {show('report') ? (
          <>
            <motion.div {...reveal} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi value={tot.adherence_pct == null ? '—' : `${tot.adherence_pct}%`} label={t('report.kpi.taken')} tone="text-success" />
              <Kpi value={rep.on_time_pct == null ? '—' : `${rep.on_time_pct}%`} label={t('report.kpi.on_time')} />
              <Kpi value={streak} label={t('report.kpi.streak')} tone="text-gold-text" />
              <Kpi value={tot.missed + tot.skipped} label={t('report.kpi.missed')} tone={tot.missed + tot.skipped ? 'text-danger' : 'text-ink'} />
            </motion.div>
            {care.open ? (
              <Link to="/carer/alerts" className="flex items-center gap-3 rounded-[20px] bg-danger-bg px-4 py-3 font-semibold text-danger no-underline">
                <Icon name="bell" size={22} />
                <span className="flex-1">{t('carerapp.attention', { n: care.open })}</span>
                <Icon name="chevron" size={20} className="rtl:-scale-x-100" />
              </Link>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={t('report.trend')} icon="chart">
                <AdherenceTrend series={d.adherence} />
              </Card>
              <Card title={t('dash.adherence')} icon="pill">
                <AdherenceBars series={d.adherence.slice(-14)} totals={tot} />
              </Card>
              <Card title={t('report.per_med')} icon="pill">
                <PctBars
                  rows={(rep.per_medicine || []).map((m) => ({
                    label: m.name,
                    pct: m.pct,
                    sub: t('report.per_med.sub', { taken: m.taken, total: m.total, missed: m.missed + m.skipped }),
                  }))}
                />
              </Card>
              <Card title={t('report.slots')} icon="alarm">
                <SlotBars slots={rep.by_time_of_day} />
              </Card>
              <Card title={t('chart.mood')} icon="chat">
                <MoodChart series={d.mood_series} />
              </Card>
              <Card title={t('report.recent_missed')} icon="bell">
                {rep.recent_missed?.length ? (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {rep.recent_missed.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] py-2.5 last:border-b-0">
                        <span className="font-semibold" dir="auto">
                          {st(r.medicine_name)}
                        </span>
                        <span className="text-[0.98rem] text-muted">
                          {fmtDay(r.scheduled_at)} {fmtTime(r.scheduled_at)} · <span className={r.status === 'missed' ? 'text-danger' : ''}>{t(`rem.status.${r.status}`)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-success">✓ {t('report.none_missed')}</p>
                )}
              </Card>
              {d.vitals.some((v) => v.type === 'bp') ? (
                <Card title={t('report.bp')} icon="heart">
                  <VitalsChart vitals={d.vitals} type="bp" />
                </Card>
              ) : null}
              {d.vitals.filter((v) => v.type === 'sugar').length > 1 ? (
                <Card title={t('report.sugar')} icon="heart">
                  <VitalsChart vitals={d.vitals} type="sugar" />
                </Card>
              ) : null}
            </div>
            <Disclaimer />
          </>
        ) : null}

        {show('meds') ? (
          <>
            {diagnoses.length ? (
              <Card title={t('dash.diagnosis')} icon="doc">
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {diagnoses.map((p) => (
                    <li key={p.id} className="rounded-[16px] bg-surface-alt px-4 py-3">
                      <p className="m-0 text-[1.15rem] font-semibold" dir="auto">
                        {p.diagnosis_text}
                      </p>
                      <p className="m-0 text-[0.95rem] text-muted">
                        {t('dash.diagnosis.from', { date: fmtDay(p.created_at) })}
                        {p.diagnosis_unclear ? ` · ${t('dash.diagnosis.unclear')}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-3 text-[0.95rem] text-muted">{t('dash.diagnosis.note')}</p>
              </Card>
            ) : null}
            <Card title={t('dash.medicines')} icon="pill" aside={reviews.length ? <span className="chip-ios chip-ios--warn">{reviews.length}</span> : null}>
              {d.medicines.length === 0 ? <p className="m-0 text-muted">{t('dash.no_meds')}</p> : null}
              <ul className="m-0 list-none p-0">
                {[...reviews, ...d.medicines.filter((m) => m.review_state !== 'open')].map((m) => (
                  <MedRow key={m.id} m={m} onReview={setReview} />
                ))}
              </ul>
              <Disclaimer />
            </Card>
          </>
        ) : null}

        {show('checkins') ? (
          <Card title={t('dash.timeline')} icon="chat">
            <Timeline checkins={d.checkins} />
          </Card>
        ) : null}

        {show('vitals') ? (
          <Card title={t('dash.vitals')} icon="heart">
            {d.can_add_vitals ? (
              showVitalsForm ? (
                <VitalsForm elderId={d.elder.id} onSaved={() => load()} />
              ) : (
                <BigButton variant="secondary" small onClick={() => setShowVitalsForm(true)}>
                  + {t('dash.add_reading')}
                </BigButton>
              )
            ) : null}
            <div className="mt-3 flex flex-col gap-4">
              <VitalsChart vitals={d.vitals} type="bp" />
              <VitalsList vitals={d.vitals} />
            </div>
          </Card>
        ) : null}

        <ReviewSheet
          open={!!review}
          alert={review ? { data: { reason: review.review_reason, diagnosis: diagnoses[0]?.diagnosis_text } } : null}
          elderId={d.elder.id}
          medicineId={review?.id}
          onClose={() => setReview(null)}
          onDone={() => {
            load();
            care.reload();
          }}
        />
      </main>
    </MotionConfig>
  );
}
