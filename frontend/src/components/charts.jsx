/* Dashboard charts (Recharts). Colours come from theme tokens via CSS variables. */
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const css = (name) => `var(${name})`;
const shortDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const MOOD_LABEL = { 1: 'Udaas', 2: 'Theek', 3: 'Acha' };

export function MoodChart({ series }) {
  if (!series?.length) return <p className="muted">Abhi koi hal-chaal nahi.</p>;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={css('--border')} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <YAxis domain={[1, 3]} ticks={[1, 2, 3]} tickFormatter={(v) => MOOD_LABEL[v]} width={64}
              tick={{ fill: css('--text-muted'), fontSize: 14 }} />
            <Tooltip formatter={(v) => [MOOD_LABEL[Math.round(v)] ?? v, 'Mood']} labelFormatter={shortDate} />
            <Line type="monotone" dataKey="score" stroke={css('--accent')} strokeWidth={3} dot={{ r: 5 }}
              isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        Mood: {series.map((s) => `${shortDate(s.date)} ${MOOD_LABEL[Math.round(s.score)]}`).join(', ')}
      </figcaption>
    </figure>
  );
}

export function AdherenceBars({ series, totals }) {
  if (!series?.length) return <p className="muted">Abhi koi dawai ka waqt nahi guzra.</p>;
  return (
    <figure style={{ margin: 0 }}>
      {totals?.adherence_pct != null ? (
        <p className="big" style={{ margin: '0 0 8px' }}>
          {totals.adherence_pct}% waqt par li
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
            <Bar dataKey="taken" name="Li" stackId="a" fill={css('--success')} isAnimationActive={false} />
            <Bar dataKey="skipped" name="Nahi li" stackId="a" fill={css('--warning-border')} isAnimationActive={false} />
            <Bar dataKey="missed" name="Reh gayi" stackId="a" fill={css('--danger')} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="small muted">
        Kul: {totals.taken} li · {totals.skipped} nahi li · {totals.missed} reh gayin
      </figcaption>
    </figure>
  );
}
