import { useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { BigButton, ErrorText, Field, Notice } from './ui';

const TYPES = ['bp', 'sugar', 'heart_rate', 'weight', 'spo2', 'temperature'];
const PH = { sugar: '110', heart_rate: '72', weight: '65', spo2: '97', temperature: '98.6' };

/** Manual vitals entry. elderId is passed when a family member enters for a linked elder. */
export default function VitalsForm({ elderId, onSaved }) {
  const [type, setType] = useState('bp');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const [flag, setFlag] = useState(null);

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
      setFlag(saved.flag || null);
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
        <legend className="big">{t('vitals.what')}</legend>
        {TYPES.map((id) => (
          <label key={id} className="row" style={{ minHeight: 48 }}>
            <input type="radio" name="vital-type" value={id} checked={type === id}
              onChange={() => setType(id)} style={{ width: 28, height: 28 }} />
            {t(`vitals.type.${id}`)}
          </label>
        ))}
      </fieldset>
      {type === 'bp' ? (
        <div className="grid-2">
          <Field id="sys" label={t('vitals.sys')}>
            <input id="sys" className="input" type="number" inputMode="numeric" min={50} max={260} value={sys}
              onChange={(e) => setSys(e.target.value)} placeholder="120" />
          </Field>
          <Field id="dia" label={t('vitals.dia')}>
            <input id="dia" className="input" type="number" inputMode="numeric" min={30} max={160} value={dia}
              onChange={(e) => setDia(e.target.value)} placeholder="80" />
          </Field>
        </div>
      ) : (
        <Field id="val" label={type === 'sugar' ? t('vitals.sugar') : type === 'heart_rate' ? t('vitals.pulse') : t(`vitals.label.${type}`)}>
          <input id="val" className="input" type="number" inputMode="decimal" min={10} max={600} value={value}
            onChange={(e) => setValue(e.target.value)} placeholder={PH[type]} />
        </Field>
      )}
      <ErrorText>{err}</ErrorText>
      {ok ? <Notice kind="success">✓ {t('vitals.saved')}</Notice> : null}
      {flag ? <Notice kind="warning">⚠️ {t('vitals.flag', { dir: t(`vitals.flag.${flag}`) })}</Notice> : null}
      <BigButton type="submit" disabled={busy || !ready}>
        {busy ? t('common.saving') : t('common.save')}
      </BigButton>
    </form>
  );
}
