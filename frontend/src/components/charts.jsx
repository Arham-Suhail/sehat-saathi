/* Dashboard charts (Recharts). Colours come from theme tokens via CSS variables. */
import { t } from '../i18n/useT';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// SVG presentation attributes can't resolve CSS variables, so read the real values
// from theme.css at render time (theme.css stays the single source of colours).
const css = (name) =>
  (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || '#555';
const shortDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const moodLabel = (v) => ({ 1: t('mood.low'), 2: t('mood.okay'), 3: t('mood.good') })[v];

export function MoodChart({ series }) {
  if (!series?.length) return <p className="muted">{t('chart.no_checkins')}</p>;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={css('--border')} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <YAxis domain={[1, 3]} ticks={[1, 2, 3]} tickFormatter={moodLabel} width={64}
              tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <Tooltip formatter={(v) => [moodLabel(Math.round(v)) ?? v, t('chart.mood')]} labelFormatter={shortDate} />
            <Line type="linear" dataKey="score" stroke={css('--accent')} strokeWidth={3} dot={{ r: 5 }}
              isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        {t('chart.mood')}: {series.map((s) => `${shortDate(s.date)} ${moodLabel(Math.round(s.score))}`).join(', ')}
      </figcaption>
    </figure>
  );
}

export function AdherenceBars({ series, totals }) {
  if (!series?.length) return <p className="muted">{t('chart.no_doses')}</p>;
  return (
    <figure style={{ margin: 0 }}>
      {totals?.adherence_pct != null ? (
        <p className="big" style={{ margin: '0 0 8px' }}>
          {t('chart.pct_on_time', { pct: totals.adherence_pct })}
        </p>
      ) : null}
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={css('--border')} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <YAxis allowDecimals={false} tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <Tooltip labelFormatter={shortDate} />
            <Legend />
            <Bar dataKey="taken" name={t('chart.taken')} stackId="a" fill={css('--success')} isAnimationActive={false} />
            <Bar dataKey="skipped" name={t('chart.skipped')} stackId="a" fill={css('--warning-border')} isAnimationActive={false} />
            <Bar dataKey="missed" name={t('chart.missed')} stackId="a" fill={css('--danger')} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="small muted">
        {t('chart.totals', { taken: totals.taken, skipped: totals.skipped, missed: totals.missed })}
      </figcaption>
    </figure>
  );
}
