import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { BigButton, BottomBar, Disclaimer, ErrorText, Field, Notice, PharmacistBanner, TopBar } from '../../components/ui';
import { t } from '../../i18n/useT';
import { useReminders } from './ElderLayout';

/* The model only transcribes. Labels, route, reminder mode and suggested times come from the
   server's normaliser; the server re-checks all of it on save. */

const HHMM = /^\d\d:\d\d$/;
const MEAL_OPTS = [
  ['before', 'Khane se pehle'],
  ['after', 'Khane ke baad'],
  ['with', 'Khane ke saath'],
  ['none', 'Koi hidayat nahi'],
];
const HOSPITAL_NOTE = 'Ye hospital wali (IV/injection) dawai hai. Is app mein iske reminders nahi bante.';
const DC_NOTE = "Is order mein 'D/c' (band karna) likha hai. Ye dawai chalu nahi hai.";

let uid = 0;
const blank = () => ({
  key: ++uid,
  original_text: null,
  name: '',
  strength_text: '',
  dose_text: '',
  frequency_raw: null,
  route_raw: null,
  meal_timing: 'none',
  prn: false,
  prn_condition: null,
  duration_raw: null,
  duration_days: '',
  quantity_limit_raw: null,
  instructions_raw: null,
  discontinue_mentioned: false,
  frequency: { kind: 'none', label: '', note: '' },
  frequency_choice: 'custom',
  route: { kind: 'unknown', label: '' },
  reminder_mode: 'manual',
  status: 'active',
  reactivate_confirmed: false,
  timings: ['08:00'],
  confidence: 1,
  needs_pharmacist: false,
  pharmacist_reasons: [],
  edited_by_user: true,
});

function fromDraft(d) {
  return {
    ...blank(),
    ...d,
    strength_text: d.strength_text ?? '',
    dose_text: d.dose_text ?? '',
    name: d.name ?? '',
    meal_timing: d.meal_timing === 'unknown' ? 'none' : d.meal_timing,
    duration_days: d.duration_days ?? '',
    timings: d.reminder_mode === 'manual' ? [''] : d.suggested_times,
    edited_by_user: false,
  };
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** What the elder will see for this medicine after saving. */
function viewMode(med) {
  if (med.status === 'stopped') return 'stopped';
  if (med.route.kind === 'intravenous' || med.route.kind === 'intramuscular' || med.route.kind === 'subcutaneous')
    return 'hospital';
  if (med.prn || med.frequency_choice === 'prn') return 'prn';
  return 'times';
}

function RawNote({ med }) {
  return (
    <>
      {med.quantity_limit_raw ? <p className="small muted" style={{ margin: 0 }}>Note: {med.quantity_limit_raw}</p> : null}
      {med.original_text ? (
        <p className="small muted" style={{ margin: 0 }}>
          Parche mein likha tha: “{med.original_text}”
        </p>
      ) : null}
    </>
  );
}

function FrequencyControl({ med, options, onChange, id }) {
  const opts = [
    ...(med.frequency_choice === 'asis' || med.frequency.kind === 'pattern'
      ? [{ value: 'asis', label: `${med.frequency.label} (jaise likha hai)`, times: med.suggested_times || [] }]
      : []),
    ...options,
  ];
  const pick = (e) => {
    const o = opts.find((x) => x.value === e.target.value);
    const times = o?.times?.length ? o.times : [''];
    onChange({ ...med, frequency_choice: e.target.value, timings: times, edited_by_user: true });
  };
  return (
    <Field id={id} label="Kitni baar">
      <select id={id} className="select" value={med.frequency_choice} onChange={pick}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 'custom' ? 'Waqt khud set karein' : o.label}
          </option>
        ))}
      </select>
      {med.frequency_raw ? <small>Parche par: {med.frequency_raw}</small> : null}
      {med.frequency.note && med.frequency_choice !== 'custom' ? <small>{med.frequency.note}</small> : null}
    </Field>
  );
}

function TimesEditor({ med, onChange, id }) {
  const setTime = (i) => (e) => {
    const timings = [...med.timings];
    timings[i] = e.target.value;
    onChange({ ...med, timings, edited_by_user: true });
  };
  const custom = med.frequency_choice === 'custom';
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="big">{t('confirm.times')}</legend>
      <p className="muted small" style={{ margin: 0 }}>
        {custom ? 'Waqt khud set karein.' : 'Ye waqt sirf mashwara hain — tasdeeq karein ya badlein.'}
      </p>
      {med.timings.map((tm, i) => (
        <div className="row" key={i}>
          <label className="visually-hidden" htmlFor={`${id}-${i}`}>
            {t('confirm.times')} {i + 1}
          </label>
          <input id={`${id}-${i}`} className="input" type="time" value={tm} onChange={setTime(i)}
            style={{ flex: '1 1 10rem', maxWidth: '14rem' }} />
          <BigButton variant="danger" small block={false} aria-label={t('confirm.remove_time')}
            onClick={() => onChange({ ...med, timings: med.timings.filter((_, j) => j !== i), edited_by_user: true })}>
            ✕
          </BigButton>
        </div>
      ))}
      {med.timings.length < 6 ? (
        <BigButton variant="secondary" small block={false}
          onClick={() => onChange({ ...med, timings: [...med.timings, ''], edited_by_user: true })}>
          {t('confirm.add_time')}
        </BigButton>
      ) : null}
    </fieldset>
  );
}

function MedicineCard({ med, index, options, onChange, onRemove, showErrors }) {
  const id = (f) => `m${med.key}-${f}`;
  const set = (f) => (e) => onChange({ ...med, [f]: e.target.value, edited_by_user: true });
  const mode = viewMode(med);
  return (
    <section className="card stack" aria-labelledby={id('h')}>
      <h2 id={id('h')}>
        {index + 1}. {med.name || '—'}
      </h2>
      {med.needs_pharmacist ? <PharmacistBanner /> : null}
      {med.pharmacist_reasons?.length ? (
        <ul className="small" style={{ margin: 0 }}>
          {med.pharmacist_reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {mode === 'hospital' ? <Notice kind="warning">{HOSPITAL_NOTE} Ye sirf note ke taur par mehfooz hogi.</Notice> : null}

      <Field id={id('name')} label={t('confirm.name')}>
        <input id={id('name')} className="input" maxLength={120} value={med.name} onChange={set('name')}
          aria-invalid={showErrors && !med.name.trim()} />
      </Field>
      <div className="grid-2">
        <Field id={id('strength')} label={t('confirm.strength')}>
          <input id={id('strength')} className="input" maxLength={60} value={med.strength_text}
            onChange={set('strength_text')} placeholder="jaise 500 mg" />
        </Field>
        <Field id={id('dose')} label={t('confirm.dose')}>
          <input id={id('dose')} className="input" maxLength={80} value={med.dose_text} onChange={set('dose_text')}
            placeholder="jaise 1 tab ya 5 ml" />
        </Field>
        <Field id={id('meal')} label="Khane ke hisaab se">
          <select id={id('meal')} className="select" value={med.meal_timing} onChange={set('meal_timing')}>
            {MEAL_OPTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {mode === 'times' ? (
          <Field id={id('days')} label={t('confirm.days')}>
            <input id={id('days')} className="input" type="number" inputMode="numeric" min={1} max={365}
              value={med.duration_days} onChange={set('duration_days')} />
          </Field>
        ) : null}
      </div>

      <p className="chip" style={{ margin: 0 }}>
        Kaise lein: {med.route.label || 'Likha nahi'}
        {med.route_raw ? <span className="muted"> ({med.route_raw})</span> : null}
      </p>

      {mode === 'prn' ? (
        <Notice>
          <strong>Zaroorat par</strong>
          {med.prn_condition ? <> — parche par shart: “{med.prn_condition}”</> : null}
          <br />
          Iske fixed reminders nahi bante.
          {med.frequency_raw ? <> Parche par: {med.frequency_raw}</> : null}
        </Notice>
      ) : null}
      {mode === 'times' ? (
        <>
          <FrequencyControl med={med} options={options} onChange={onChange} id={id('freq')} />
          <TimesEditor med={med} onChange={onChange} id={id('t')} />
        </>
      ) : null}
      {mode === 'hospital' && med.frequency_raw ? (
        <p className="small muted" style={{ margin: 0 }}>
          {med.frequency.label} (parche par: {med.frequency_raw})
        </p>
      ) : null}

      <RawNote med={med} />
      <BigButton variant="danger" small onClick={onRemove}>
        {t('confirm.remove')}
      </BigButton>
    </section>
  );
}

function StoppedCard({ med, options, onChange, onRemove }) {
  const [asking, setAsking] = useState(false);
  const reactivate = () => {
    const o = options.find((x) => x.value === med.frequency_choice);
    onChange({
      ...med,
      status: 'active',
      reactivate_confirmed: true,
      needs_pharmacist: true,
      timings: o?.times?.length ? o.times : [''],
      edited_by_user: true,
    });
  };
  return (
    <section className="card stack" aria-label={med.name || 'Band dawai'}>
      <h3 style={{ margin: 0 }}>{med.name || '—'}</h3>
      <Notice kind="warning">{DC_NOTE}</Notice>
      <RawNote med={med} />
      {asking ? (
        <div className="stack">
          <PharmacistBanner />
          <p>Pakka? Ise sirf pharmacist ya doctor se poochne ke baad chalu karein.</p>
          <BigButton variant="danger" onClick={reactivate}>
            Haan, chalu karein
          </BigButton>
          <BigButton variant="secondary" onClick={() => setAsking(false)}>
            Nahi, band rehne dein
          </BigButton>
        </div>
      ) : (
        <div className="row">
          <BigButton variant="secondary" small block={false} onClick={() => setAsking(true)}>
            Dobara chalu karein
          </BigButton>
          <BigButton variant="danger" small block={false} onClick={onRemove}>
            {t('confirm.remove')}
          </BigButton>
        </div>
      )}
    </section>
  );
}

function toBody(m) {
  const mode = viewMode(m);
  return {
    name: m.name.trim(),
    original_text: m.original_text,
    strength_text: clean(m.strength_text),
    dose_text: clean(m.dose_text),
    frequency_raw: m.frequency_raw,
    route_raw: m.route_raw,
    meal_timing: m.meal_timing,
    prn: m.prn || m.frequency_choice === 'prn',
    prn_condition: m.prn_condition,
    duration_raw: m.duration_raw,
    quantity_limit_raw: m.quantity_limit_raw,
    instructions_raw: m.instructions_raw,
    discontinue_mentioned: m.discontinue_mentioned,
    frequency_choice: m.frequency_choice,
    timings: mode === 'times' ? [...new Set(m.timings.filter((x) => HHMM.test(x)))] : [],
    duration_days: m.duration_days === '' || mode !== 'times' ? null : Number(m.duration_days),
    confidence: m.confidence,
    needs_pharmacist: m.needs_pharmacist,
    edited_by_user: m.edited_by_user,
    status: m.status,
    reactivate_confirmed: m.reactivate_confirmed,
  };
}

export default function ConfirmMeds() {
  const { state } = useLocation();
  const nav = useNavigate();
  const { refresh } = useReminders();
  const extraction = state?.extraction;
  const [meds, setMeds] = useState(() => (extraction ? extraction.medicines.map(fromDraft) : [blank()]));
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    api('/medicines/schedule-options').then(setOptions).catch(() => setOptions([]));
  }, []);

  const update = (key) => (nm) => setMeds((list) => list.map((x) => (x.key === key ? nm : x)));
  const remove = (key) => () => setMeds((list) => list.filter((x) => x.key !== key));
  const active = meds.filter((m) => m.status !== 'stopped');
  const stopped = meds.filter((m) => m.status === 'stopped');

  const save = async () => {
    setErr(null);
    setShowErrors(true);
    if (meds.some((m) => !m.name.trim())) return setErr(t('confirm.need_name'));
    if (active.some((m) => viewMode(m) === 'times' && !m.timings.some((x) => HHMM.test(x))))
      return setErr(t('confirm.need_time'));
    setBusy(true);
    try {
      await api('/medicines/confirm', { method: 'POST', json: { medicines: meds.map(toBody) } });
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
      {active.map((m, i) => (
        <MedicineCard key={m.key} med={m} index={i} options={options} onChange={update(m.key)}
          onRemove={remove(m.key)} showErrors={showErrors} />
      ))}
      {meds.length < 15 ? (
        <BigButton variant="secondary" onClick={() => setMeds((l) => [...l, blank()])}>
          {t('confirm.add')}
        </BigButton>
      ) : null}

      {stopped.length ? (
        <details className="card stack">
          <summary className="big summary">Band ki gayi dawaiyan ({stopped.length})</summary>
          {stopped.map((m) => (
            <StoppedCard key={m.key} med={m} options={options} onChange={update(m.key)} onRemove={remove(m.key)} />
          ))}
        </details>
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
