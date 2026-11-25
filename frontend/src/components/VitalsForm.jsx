import { useState } from 'react';
import { api } from '../api/client';
import { BigButton, ErrorText, Field, Notice } from './ui';

const TYPES = [
  { id: 'bp', label: 'BP (blood pressure)' },
  { id: 'sugar', label: 'Sugar (mg/dL)' },
  { id: 'heart_rate', label: 'Dil ki dhadkan (pulse)' },
];

/** Manual vitals entry. elderId is passed when a family member enters for a linked elder. */
export default function VitalsForm({ elderId, onSaved }) {
  const [type, setType] = useState('bp');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setOk(false);
    const body = { type, ...(elderId ? { elder_id: elderId } : {}) };
    if (type === 'bp') {
      body.systolic = Number(sys);
      body.diastolic = Number(dia);
    } else body.value = Number(value);
    setBusy(true);
    try {
      const saved = await api('/vitals', { method: 'POST', json: body });
      setSys('');
      setDia('');
      setValue('');
      setOk(true);
      onSaved?.(saved);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = type === 'bp' ? sys && dia : value;
  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="big">Kya likhna hai?</legend>
        {TYPES.map((x) => (
          <label key={x.id} className="row" style={{ minHeight: 48 }}>
            <input type="radio" name="vital-type" value={x.id} checked={type === x.id}
              onChange={() => setType(x.id)} style={{ width: 28, height: 28 }} />
            {x.label}
          </label>
        ))}
      </fieldset>
      {type === 'bp' ? (
        <div className="grid-2">
          <Field id="sys" label="Upar wali (systolic)">
            <input id="sys" className="input" type="number" inputMode="numeric" min={50} max={260} value={sys}
              onChange={(e) => setSys(e.target.value)} placeholder="120" />
          </Field>
          <Field id="dia" label="Neeche wali (diastolic)">
            <input id="dia" className="input" type="number" inputMode="numeric" min={30} max={160} value={dia}
              onChange={(e) => setDia(e.target.value)} placeholder="80" />
          </Field>
        </div>
      ) : (
        <Field id="val" label={type === 'sugar' ? 'Sugar (mg/dL)' : 'Pulse (bpm)'}>
          <input id="val" className="input" type="number" inputMode="decimal" min={10} max={600} value={value}
            onChange={(e) => setValue(e.target.value)} placeholder={type === 'sugar' ? '110' : '72'} />
        </Field>
      )}
      <ErrorText>{err}</ErrorText>
      {ok ? <Notice kind="success">✓ Reading mehfooz ho gayi</Notice> : null}
      <BigButton type="submit" disabled={busy || !ready}>
        {busy ? 'Mehfooz ho raha hai…' : 'Mehfooz karein'}
      </BigButton>
    </form>
  );
}
