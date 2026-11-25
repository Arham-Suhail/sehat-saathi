import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { BigButton, BottomBar, Disclaimer, ErrorText, Field, PharmacistBanner, TopBar, fmtHHMM } from '../../components/ui';
import { t } from '../../i18n/useT';
import { useReminders } from './ElderLayout';

let uid = 0;
const blank = () => ({
  key: ++uid,
  name: '',
  strength: '',
  form: '',
  dose: '',
  frequency: '',
  timing_text: '',
  duration: '',
  instructions: '',
  timings: ['08:00'],
  duration_days: '',
  confidence: 1,
  needs_pharmacist: false,
  edited_by_user: true,
});

function fromDraft(d) {
  return {
    ...blank(),
    ...Object.fromEntries(
      ['name', 'strength', 'form', 'dose', 'frequency', 'timing_text', 'duration', 'instructions'].map((k) => [k, d[k] ?? '']),
    ),
    timings: d.suggested_times?.length ? d.suggested_times : [],
    duration_days: d.suggested_duration_days ?? '',
    confidence: d.confidence,
    needs_pharmacist: d.needs_pharmacist,
    edited_by_user: false,
  };
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function MedicineCard({ med, index, onChange, onRemove }) {
  const id = (f) => `m${med.key}-${f}`;
  const set = (f) => (e) => onChange({ ...med, [f]: e.target.value, edited_by_user: true });
  const setTime = (i) => (e) => {
    const timings = [...med.timings];
    timings[i] = e.target.value;
    onChange({ ...med, timings, edited_by_user: true });
  };
  return (
    <section className="card stack" aria-labelledby={id('h')}>
      <h2 id={id('h')}>
        {index + 1}. {med.name || '—'}
      </h2>
      {med.needs_pharmacist ? <PharmacistBanner /> : null}

      <Field id={id('name')} label={t('confirm.name')}>
        <input id={id('name')} className="input" maxLength={120} value={med.name} onChange={set('name')}
          aria-invalid={!med.name.trim()} />
      </Field>
      <div className="grid-2">
        <Field id={id('strength')} label={t('confirm.strength')}>
          <input id={id('strength')} className="input" maxLength={60} value={med.strength} onChange={set('strength')} />
        </Field>
        <Field id={id('dose')} label={t('confirm.dose')}>
          <input id={id('dose')} className="input" maxLength={80} value={med.dose} onChange={set('dose')}
            placeholder="1 goli" />
        </Field>
        <Field id={id('frequency')} label={t('confirm.frequency')}>
          <input id={id('frequency')} className="input" maxLength={80} value={med.frequency} onChange={set('frequency')}
            placeholder="1+0+1" />
        </Field>
        <Field id={id('days')} label={t('confirm.days')}>
          <input id={id('days')} className="input" type="number" inputMode="numeric" min={1} max={365}
            value={med.duration_days} onChange={set('duration_days')} />
        </Field>
      </div>
      <Field id={id('instructions')} label={t('confirm.instructions')}>
        <input id={id('instructions')} className="input" maxLength={200} value={med.instructions}
          onChange={set('instructions')} />
      </Field>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="big">{t('confirm.times')}</legend>
        {!med.edited_by_user && med.timings.length ? <p className="muted small">{t('confirm.suggested')}</p> : null}
        {med.timings.map((tm, i) => (
          <div className="row" key={i}>
            <label className="visually-hidden" htmlFor={id(`t${i}`)}>
              {t('confirm.times')} {i + 1}
            </label>
            <input id={id(`t${i}`)} className="input" type="time" value={tm} onChange={setTime(i)}
              style={{ flex: '1 1 10rem', maxWidth: '14rem' }} />
            <span className="muted" aria-hidden="true">{/^\d\d:\d\d$/.test(tm) ? fmtHHMM(tm) : ''}</span>
            <BigButton variant="danger" small block={false} aria-label={t('confirm.remove_time')}
              onClick={() => onChange({ ...med, timings: med.timings.filter((_, j) => j !== i), edited_by_user: true })}>
              ✕
            </BigButton>
          </div>
        ))}
        {med.timings.length < 6 ? (
          <BigButton variant="secondary" small block={false}
            onClick={() => onChange({ ...med, timings: [...med.timings, '20:00'], edited_by_user: true })}>
            {t('confirm.add_time')}
          </BigButton>
        ) : null}
      </fieldset>

      <BigButton variant="danger" small onClick={onRemove}>
        {t('confirm.remove')}
      </BigButton>
    </section>
  );
}

export default function ConfirmMeds() {
  const { state } = useLocation();
  const nav = useNavigate();
  const { refresh } = useReminders();
  const extraction = state?.extraction;
  const [meds, setMeds] = useState(() => (extraction ? extraction.medicines.map(fromDraft) : [blank()]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setErr(null);
    if (meds.some((m) => !m.name.trim())) return setErr(t('confirm.need_name'));
    if (meds.some((m) => !m.timings.filter((x) => /^\d\d:\d\d$/.test(x)).length)) return setErr(t('confirm.need_time'));
    const body = {
      medicines: meds.map((m) => ({
        name: m.name.trim(),
        strength: clean(m.strength),
        form: clean(m.form),
        dose: clean(m.dose),
        frequency: clean(m.frequency),
        timing_text: clean(m.timing_text),
        duration: clean(m.duration),
        instructions: clean(m.instructions),
        timings: [...new Set(m.timings.filter((x) => /^\d\d:\d\d$/.test(x)))],
        duration_days: m.duration_days === '' ? null : Number(m.duration_days),
        confidence: m.confidence,
        needs_pharmacist: m.needs_pharmacist,
        edited_by_user: m.edited_by_user,
      })),
    };
    setBusy(true);
    try {
      await api('/medicines/confirm', { method: 'POST', json: body });
      await refresh();
      nav('/elder/reminders', { replace: true, state: { saved: true } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page--with-bar stack">
      <TopBar back="/elder/upload" title={t('confirm.title')} />
      <h1>{t('confirm.title')}</h1>
      <p>{t('confirm.help')}</p>
      {extraction?.needs_pharmacist ? <PharmacistBanner /> : null}
      <Disclaimer />

      {meds.length === 0 ? <p className="muted">{t('confirm.empty')}</p> : null}
      {meds.map((m, i) => (
        <MedicineCard
          key={m.key}
          med={m}
          index={i}
          onChange={(nm) => setMeds((list) => list.map((x) => (x.key === m.key ? nm : x)))}
          onRemove={() => setMeds((list) => list.filter((x) => x.key !== m.key))}
        />
      ))}
      {meds.length < 15 ? (
        <BigButton variant="secondary" onClick={() => setMeds((l) => [...l, blank()])}>
          {t('confirm.add')}
        </BigButton>
      ) : null}

      <BottomBar>
        <ErrorText>{err}</ErrorText>
        <BigButton onClick={save} disabled={busy || meds.length === 0}>
          {busy ? t('common.loading') : `✓ ${t('confirm.save')}`}
        </BigButton>
      </BottomBar>
    </main>
  );
}
