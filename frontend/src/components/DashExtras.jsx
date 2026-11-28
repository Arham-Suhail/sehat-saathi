/* Carer dashboard extras: this week vs last week, a short note to the elder (shown on their Home,
   "from your doctor / family, not AI"), and exports: CSV (doses, check-ins, vitals) and a
   printable / PDF report (browser print -> "Save as PDF"). */
import { useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { hapticSuccess, isNative } from '../lib/native';
import Icon from './Icon';
import { download } from './Settings';
import { ErrorText, fmtDay, fmtTime } from './ui';
import { vitalText } from './VitalsList';

export function WeekCompare({ w }) {
  if (!w || w.this_week == null) return null;
  const diff = w.last_week == null ? null : w.this_week - w.last_week;
  return (
    <div className="card-ios flex items-center gap-4 p-4">
      <span className="row-icon row-icon--accent">
        <Icon name="chart" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[1.15rem] font-bold">{t('week.compare', { now: w.this_week, before: w.last_week ?? '—' })}</p>
        {diff != null ? (
          <p className={`m-0 text-[1rem] ${diff >= 0 ? 'text-success' : 'text-danger'}`}>
            {diff === 0 ? t('week.same') : t(diff > 0 ? 'week.up' : 'week.down', { n: Math.abs(diff) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function MessageElder({ elderId, name }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/messages', { method: 'POST', json: { elder_id: elderId, text: text.trim() } });
      hapticSuccess();
      setText('');
      setDone(true);
      setOpen(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="app-btn app-btn--secondary app-btn--sm">
        <Icon name="chat" size={20} />
        {done ? `✓ ${t('msg.sent')}` : t('msg.write', { name })}
      </button>
    );
  return (
    <form onSubmit={send} className="card-ios flex flex-col gap-2 p-4">
      <label htmlFor="msg-elder" className="text-[1.15rem] font-bold">
        {t('msg.write', { name })}
      </label>
      <textarea
        id="msg-elder"
        className="input min-h-20"
        dir="auto"
        maxLength={300}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone(false);
        }}
        placeholder={t('msg.ph')}
      />
      <p className="m-0 text-[0.95rem] text-muted">{t('msg.rule')}</p>
      <ErrorText>{err}</ErrorText>
      {done ? <p className="m-0 font-semibold text-success">✓ {t('msg.sent')}</p> : null}
      <button type="submit" disabled={busy || !text.trim()} className="app-btn app-btn--primary app-btn--sm self-start">
        {busy ? t('common.loading') : t('msg.send')}
      </button>
    </form>
  );
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas (=, +, -, @) and quote everything.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function ExportBar({ d }) {
  const csv = () => {
    const rows = [['section', 'date', 'detail', 'value']];
    for (const day of d.adherence) rows.push(['doses', day.date, 'taken/missed/skipped', `${day.taken}/${day.missed}/${day.skipped}`]);
    for (const c of d.checkins) rows.push(['checkin', c.created_at, c.channel, c.mood]);
    for (const v of d.vitals) rows.push(['vital', v.measured_at, v.type, vitalText(v)]);
    download(`sehat-saathi-${d.elder.name.replace(/\W+/g, '-')}.csv`, toCsv(rows), 'text/csv');
  };
  return (
    <div className="no-print grid grid-cols-2 gap-2">
      {!isNative() ? (
        <button type="button" onClick={() => window.print()} className="app-btn app-btn--secondary app-btn--sm">
          <Icon name="doc" size={20} />
          {t('export.pdf')}
        </button>
      ) : null}
      <button type="button" onClick={csv} className="app-btn app-btn--secondary app-btn--sm">
        <Icon name="chart" size={20} />
        {t('export.csv')}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(
          t('share.summary', {
            name: d.elder.name,
            pct: d.week_compare?.this_week ?? d.adherence_totals?.adherence_pct ?? '—',
          }),
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="app-btn app-btn--secondary app-btn--sm"
      >
        {t('share.whatsapp')}
      </a>
    </div>
  );
}

/** Print-only header for the doctor's PDF (hidden on screen). */
export function PrintHeader({ d }) {
  return (
    <div className="print-only">
      <h1>{t('export.title', { name: d.elder.name })}</h1>
      <p>
        {t('dash.days_label', { days: d.days })} · {fmtDay(new Date().toISOString())} {fmtTime(new Date().toISOString())}
      </p>
      <p>{t('export.disclaimer')}</p>
    </div>
  );
}
