/* Inline editor for an active medicine's alarm: times (1-6), dose text and number of days.
   PATCH /medicines/{id} re-checks everything server-side and moves only FUTURE reminders, so taken /
   missed history stays true. Name, strength and route can't be changed here (they come from the
   prescription); to change those, remove the medicine and add it again. */
import { useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { BigButton, ErrorText } from './ui';

const HHMM = /^\d\d:\d\d$/;

export default function MedicineEditor({ med, onSaved, onCancel }) {
  const [times, setTimes] = useState(med.timings?.length ? med.timings : ['08:00']);
  const [dose, setDose] = useState(med.dose_text || '');
  const [days, setDays] = useState(med.duration_days ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const id = (f) => `edit-${med.id}-${f}`;

  const valid = times.some((x) => HHMM.test(x)) && (days === '' || (Number(days) >= 1 && Number(days) <= 365));

  const save = async (e) => {
    e.preventDefault();
    if (!valid) return setErr(t('confirm.need_time'));
    setBusy(true);
    setErr(null);
    try {
      const body = {
        timings: [...new Set(times.filter((x) => HHMM.test(x)))],
        dose_text: dose.trim() || null,
        duration_days: days === '' ? null : Number(days),
      };
      await api(`/medicines/${encodeURIComponent(med.id)}`, { method: 'PATCH', json: body });
      await onSaved?.();
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-3" onSubmit={save} noValidate>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[1.25rem] font-bold">{t('confirm.times')}</legend>
        {times.map((tm, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="visually-hidden" htmlFor={id(`t${i}`)}>
              {t('confirm.times')} {i + 1}
            </label>
            <input
              id={id(`t${i}`)}
              type="time"
              className="input"
              style={{ flex: '1 1 9rem', maxWidth: '12rem' }}
              value={tm}
              onChange={(e) => setTimes((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {times.length > 1 ? (
              <BigButton
                variant="danger"
                small
                block={false}
                aria-label={t('confirm.remove_time')}
                onClick={() => setTimes((l) => l.filter((_, j) => j !== i))}
              >
                ✕
              </BigButton>
            ) : null}
          </div>
        ))}
        {times.length < 6 ? (
          <BigButton variant="secondary" small block={false} onClick={() => setTimes((l) => [...l, ''])}>
            {t('confirm.add_time')}
          </BigButton>
        ) : null}
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="field">
          <label htmlFor={id('dose')}>{t('confirm.dose')}</label>
          <input id={id('dose')} dir="auto" className="input" maxLength={80} value={dose} onChange={(e) => setDose(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id('days')}>{t('confirm.days')}</label>
          <input
            id={id('days')}
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
      </div>

      <p className="m-0 text-[1.25rem] text-muted">{t('meds.edit.note')}</p>
      <ErrorText>{err}</ErrorText>
      <div className="flex flex-col gap-2">
        <BigButton type="submit" disabled={busy || !valid}>
          {busy ? t('common.saving') : `✓ ${t('meds.edit.save')}`}
        </BigButton>
        <BigButton variant="secondary" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </BigButton>
      </div>
    </form>
  );
}
