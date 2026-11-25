import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Disclaimer, ErrorText, TopBar } from '../../components/ui';
import VitalsForm from '../../components/VitalsForm';
import VitalsList from '../../components/VitalsList';

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
      <TopBar back="/elder" title="BP / Sugar" />
      <h1>BP / Sugar likhein</h1>
      <p className="muted">Machine se reading le kar yahan likhein. Ghar wale aur doctor dashboard par dekh sakenge.</p>
      <VitalsForm onSaved={(v) => setVitals((l) => [v, ...l])} />
      <section className="card">
        <h2>Pichli readings</h2>
        <ErrorText>{err}</ErrorText>
        <VitalsList vitals={vitals} />
      </section>
      <Disclaimer />
    </main>
  );
}
