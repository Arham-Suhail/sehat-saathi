import { t } from '../i18n/useT';
import { fmtDay, fmtTime } from './ui';

export function vitalText(v) {
  if (v.type === 'bp') return `${v.systolic}/${v.diastolic} ${v.unit}`;
  return `${v.value} ${v.unit}`;
}

/** Simple list of manually entered vitals (no graph in Stage A, by design). */
export default function VitalsList({ vitals }) {
  if (!vitals?.length) return <p className="muted">{t('vitals.none')}</p>;
  return (
    <ul className="list">
      {vitals.map((v) => (
        <li key={v.id} className="spaced" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <span>
            <strong>{t(`vitals.short.${v.type}`)}</strong> {vitalText(v)}
          </span>
          <span className="muted small">
            {fmtDay(v.measured_at)} {fmtTime(v.measured_at)}
            {v.entered_by_role === 'family' ? ` · ${t('vitals.by_family')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
