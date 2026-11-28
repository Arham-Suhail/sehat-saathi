/* Dashboard charts (Recharts). Colours come from theme tokens via CSS variables. Quiet styling:
   hairline grid, no chart junk, rounded bars, a text summary for screen readers under each chart. */
import { t } from '../i18n/useT';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// SVG presentation attributes can't resolve CSS variables, so read the real values
// from theme.css at render time (theme.css stays the single source of colours).
const css = (name) =>
  (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || '#555';
const shortDate = (iso) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)}/${Number(m)}`;
};
const moodLabel = (v) => ({ 1: t('mood.low'), 2: t('mood.okay'), 3: t('mood.good') })[v];
const tick = () => ({ fill: css('--text-muted'), fontSize: 13 });
const grid = () => <CartesianGrid stroke={css('--border')} vertical={false} />;
const tip = () => ({
  contentStyle: { borderRadius: 14, border: `1px solid ${css('--border')}`, boxShadow: '0 8px 24px rgb(0 0 0 / 0.08)', fontSize: 14 },
  cursor: { fill: css('--surface-alt') },
});

function Empty({ text }) {
  return <p className="m-0 rounded-2xl bg-surface-alt px-4 py-6 text-center text-[1.05rem] text-muted">{text}</p>;
}

export function MoodChart({ series }) {
  if (!series?.length) return <Empty text={t('chart.no_checkins')} />;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={css('--accent')} stopOpacity={0.22} />
                <stop offset="1" stopColor={css('--accent')} stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid()}
            <XAxis dataKey="date" tickFormatter={shortDate} tick={tick()} axisLine={false} tickLine={false} />
            <YAxis domain={[1, 3]} ticks={[1, 2, 3]} tickFormatter={moodLabel} width={64} tick={tick()} axisLine={false} tickLine={false} />
            <Tooltip {...tip()} formatter={(v) => [moodLabel(Math.round(v)) ?? v, t('chart.mood')]} labelFormatter={shortDate} />
            <Area type="monotone" dataKey="score" stroke={css('--accent')} strokeWidth={2.5} fill="url(#moodFill)" dot={{ r: 4, fill: css('--accent') }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        {t('chart.mood')}: {series.map((s) => `${shortDate(s.date)} ${moodLabel(Math.round(s.score))}`).join(', ')}
      </figcaption>
    </figure>
  );
}

export function AdherenceBars({ series, totals }) {
  if (!series?.length) return <Empty text={t('chart.no_doses')} />;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            {grid()}
            <XAxis dataKey="date" tickFormatter={shortDate} tick={tick()} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={tick()} axisLine={false} tickLine={false} />
            <Tooltip {...tip()} labelFormatter={shortDate} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="taken" name={t('chart.taken')} stackId="a" fill={css('--success')} isAnimationActive={false} />
            <Bar dataKey="skipped" name={t('chart.skipped')} stackId="a" fill={css('--warning-border')} isAnimationActive={false} />
            <Bar dataKey="missed" name={t('chart.missed')} stackId="a" fill={css('--danger')} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {totals ? (
        <figcaption className="mt-1 text-[0.95rem] text-muted">
          {t('chart.totals', { taken: totals.taken, skipped: totals.skipped, missed: totals.missed })}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** % of due doses taken, per day. */
export function AdherenceTrend({ series }) {
  const data = (series || [])
    .map((d) => {
      const due = d.taken + d.skipped + d.missed;
      return due ? { date: d.date, pct: Math.round((100 * d.taken) / due) } : null;
    })
    .filter(Boolean);
  if (data.length < 2) return <Empty text={t('chart.no_doses')} />;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="adhFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={css('--success')} stopOpacity={0.25} />
                <stop offset="1" stopColor={css('--success')} stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid()}
            <XAxis dataKey="date" tickFormatter={shortDate} tick={tick()} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={tick()} axisLine={false} tickLine={false} />
            <Tooltip {...tip()} formatter={(v) => [`${v}%`, t('report.taken_pct')]} labelFormatter={shortDate} />
            <Area type="monotone" dataKey="pct" stroke={css('--success')} strokeWidth={2.5} fill="url(#adhFill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">{data.map((d) => `${shortDate(d.date)} ${d.pct}%`).join(', ')}</figcaption>
    </figure>
  );
}

/** One horizontal bar per row: { label, pct, sub }. */
export function PctBars({ rows, empty }) {
  const shown = (rows || []).filter((r) => r.pct != null);
  if (!shown.length) return <Empty text={empty || t('chart.no_doses')} />;
  const tone = (p) => (p >= 80 ? 'var(--success)' : p >= 50 ? 'var(--warning-border)' : 'var(--danger)');
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {shown.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[1.1rem] font-semibold" dir="auto">
              {r.label}
            </span>
            <span className="shrink-0 text-[1.1rem] font-bold [font-variant-numeric:tabular-nums]">{r.pct}%</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-alt" role="img" aria-label={`${r.label}: ${r.pct}%`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, r.pct)}%`, background: tone(r.pct), transition: 'width 0.8s cubic-bezier(0.32,0.72,0,1)' }} />
          </div>
          {r.sub ? <p className="m-0 mt-1 text-[0.95rem] text-muted">{r.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** BP (two lines) or sugar / heart rate (one line) over time. */
export function VitalsChart({ vitals, type }) {
  const data = (vitals || [])
    .filter((v) => v.type === type)
    .slice()
    .reverse()
    .map((v) => ({ date: v.measured_at, sys: v.systolic, dia: v.diastolic, value: v.value }));
  if (data.length < 2) return null;
  const bp = type === 'bp';
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 190 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            {grid()}
            <XAxis dataKey="date" tickFormatter={shortDate} tick={tick()} axisLine={false} tickLine={false} />
            <YAxis tick={tick()} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip {...tip()} labelFormatter={shortDate} />
            {bp ? <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} /> : null}
            {bp ? (
              <>
                <Line type="monotone" dataKey="sys" name={t('vitals.systolic')} stroke={css('--danger')} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="dia" name={t('vitals.diastolic')} stroke={css('--accent')} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </>
            ) : (
              <Line type="monotone" dataKey="value" name={t(`vitals.type.${type}`)} stroke={css('--accent')} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        {data.map((d) => `${shortDate(d.date)} ${bp ? `${d.sys}/${d.dia}` : d.value}`).join(', ')}
      </figcaption>
    </figure>
  );
}

/** Doses taken by time of day (morning / afternoon / evening / night). */
export function SlotBars({ slots }) {
  const data = (slots || []).filter((s) => s.total > 0);
  if (!data.length) return <Empty text={t('chart.no_doses')} />;
  const colour = (p) => (p >= 80 ? css('--success') : p >= 50 ? css('--warning-border') : css('--danger'));
  return (
    <div style={{ width: '100%', height: 170 }}>
      <ResponsiveContainer>
        <BarChart data={data.map((s) => ({ ...s, name: t(`report.slot.${s.slot}`) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          {grid()}
          <XAxis dataKey="name" tick={tick()} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={tick()} axisLine={false} tickLine={false} />
          <Tooltip {...tip()} formatter={(v) => [`${v}%`, t('report.taken_pct')]} />
          <Bar dataKey="pct" radius={[8, 8, 0, 0]} isAnimationActive={false}>
            {data.map((s) => (
              <Cell key={s.slot} fill={colour(s.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
