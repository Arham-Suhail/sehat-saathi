import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Disclaimer, ErrorText, TopBar } from '../../components/ui';
import VitalsForm from '../../components/VitalsForm';
import VitalsList from '../../components/VitalsList';
import { t } from '../../i18n/useT';
import { isNative } from '../../lib/native';
import { setVitalsReminder } from '../../lib/nativeAlarms';

function VitalsReminder() {
  const [time, setTime] = useState(() => localStorage.getItem('ss_vitals_time') || '');
  const [draft, setDraft] = useState(time || '08:00');
  if (!isNative()) return null;
  const apply = async (v) => {
    if (await setVitalsReminder(v)) {
      setTime(v || '');
      if (v) localStorage.setItem('ss_vitals_time', v);
      else localStorage.removeItem('ss_vitals_time');
    }
  };
  return (
    <section className="card-ios flex flex-col gap-3 p-4" aria-labelledby="vrem-h">
      <h2 id="vrem-h" className="m-0 text-[1.2rem] font-bold">{t('vitals.remind')}</h2>
      <p className="m-0 text-[1.05rem] text-muted">{time ? t('vitals.remind.on', { time }) : t('vitals.remind.sub')}</p>
      <div className="flex items-center gap-2">
        <input type="time" className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('vitals.remind')} />
        <button type="button" className="app-btn app-btn--primary app-btn--sm" onClick={() => apply(draft)}>{t('common.save')}</button>
        {time ? <button type="button" className="app-btn app-btn--secondary app-btn--sm" onClick={() => apply(null)}>{t('vitals.remind.off')}</button> : null}
      </div>
    </section>
  );
}

export default function Vitals() {
  const [vitals, setVitals] = useState([]);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      setVitals(await api('/vitals?limit=30'));
    } catch (e) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="page stack">
      <TopBar back="/elder" title={t('vitals.short')} />
      <h1>{t('home.vitals')}</h1>
      <p className="muted">{t('vitals.intro')}</p>
      <VitalsForm onSaved={(v) => setVitals((l) => [v, ...l])} />
      <VitalsReminder />
      <section className="card">
        <h2>{t('vitals.previous')}</h2>
        <ErrorText>{err}</ErrorText>
        <VitalsList vitals={vitals} />
      </section>
      <Disclaimer />
    </main>
  );
}
