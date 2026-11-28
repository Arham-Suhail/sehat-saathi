/* Family / doctor: check a medicine the elder was unsure of (or that was hard to read). Shows what
   was written on the prescription, lets them correct the alarm times, dose and days, and confirm.
   POST /medicines/{id}/review re-checks everything on the server; the elder's alarms then follow. */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import { haptic } from '../lib/native';
import Icon from './Icon';
import { ErrorText, fmtHHMM } from './ui';

export default function ReviewSheet({ open, elderId, medicineId, alert, onClose, onDone }) {
  const [med, setMed] = useState(null);
  const [times, setTimes] = useState([]);
  const [dose, setDose] = useState('');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open || !medicineId) return;
    setMed(null);
    setErr(null);
    api(`/medicines?elder_id=${encodeURIComponent(elderId)}`)
      .then((list) => {
        const m = list.find((x) => x.id === medicineId);
        if (!m) throw new Error(t('review.gone'));
        setMed(m);
        setTimes(m.timings?.length ? m.timings : ['08:00']);
        setDose(m.dose_text || '');
        setDays(m.duration_days ? String(m.duration_days) : '');
      })
      .catch((e) => setErr(e.message));
  }, [open, elderId, medicineId]);

  const fixed = med?.reminder_mode === 'fixed';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    haptic();
    try {
      const body = {
        ...(fixed ? { timings: [...new Set(times.filter(Boolean))] } : {}),
        ...(dose.trim() ? { dose_text: dose.trim() } : {}),
        ...(days ? { duration_days: Number(days) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await api(`/medicines/${encodeURIComponent(medicineId)}/review?elder_id=${encodeURIComponent(elderId)}`, { method: 'POST', json: body });
      onDone?.();
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const data = alert?.data || {};
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-h"
            className="sheet sheet--tall"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            noValidate
          >
            <span className="sheet__grabber" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={onClose} className="min-h-12 border-0 bg-transparent text-[1.1rem] font-semibold text-accent">
                {t('carerapp.cancel')}
              </button>
              <h2 id="review-h" className="m-0 text-[1.25rem] font-bold">
                {t('review.title')}
              </h2>
              <span className="w-16" />
            </div>
            <p className="m-0 rounded-[18px] bg-warning-bg px-4 py-3 text-[1.05rem] font-semibold text-warning-text">
              {data.reason === 'asked' ? t('review.why.asked') : t('review.why.unclear')}
              {data.note ? <span className="mt-1 block font-normal" dir="auto">“{data.note}”</span> : null}
            </p>
            {!med && !err ? <div className="h-32 animate-pulse rounded-[20px] bg-surface-alt" /> : null}
            {med ? (
              <>
                <div className="card-ios p-4">
                  <p className="m-0 text-[0.95rem] font-semibold uppercase tracking-wide text-muted">{t('review.written')}</p>
                  <p className="m-0 mt-1 text-[1.3rem] font-bold" dir="auto">
                    {med.name} {med.strength_text ? <span className="font-normal text-muted">{med.strength_text}</span> : null}
                  </p>
                  {med.original_text ? (
                    <p className="m-0 mt-1 font-mono text-[1rem] text-muted" dir="auto">
                      {med.original_text}
                    </p>
                  ) : null}
                  {med.frequency_label ? <p className="m-0 mt-1 text-[1.05rem]">{st(med.frequency_label)}</p> : null}
                  {data.diagnosis ? (
                    <p className="m-0 mt-2 text-[1.05rem]">
                      <span className="font-semibold">{t('dash.diagnosis')}:</span> <span dir="auto">{data.diagnosis}</span>
                    </p>
                  ) : null}
                </div>
                {fixed ? (
                  <fieldset className="form-row border-0 p-0">
                    <legend className="mb-2 text-[1.05rem] font-semibold text-muted">{t('review.times')}</legend>
                    <div className="flex flex-col gap-2">
                      {times.map((v, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="time"
                            className="input flex-1"
                            value={v}
                            aria-label={t('review.time_n', { n: i + 1 })}
                            onChange={(e) => setTimes((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
                          />
                          <span className="w-24 text-[1rem] text-muted">{v ? fmtHHMM(v) : ''}</span>
                          {times.length > 1 ? (
                            <button
                              type="button"
                              aria-label={t('review.remove_time')}
                              onClick={() => setTimes((x) => x.filter((_, j) => j !== i))}
                              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-muted"
                            >
                              <Icon name="minus" size={20} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {times.length < 6 ? (
                        <button type="button" onClick={() => setTimes((x) => [...x, '20:00'])} className="min-h-12 self-start border-0 bg-transparent text-[1.1rem] font-semibold text-accent">
                          + {t('review.add_time')}
                        </button>
                      ) : null}
                    </div>
                  </fieldset>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <label className="form-row">
                    <span>{t('review.dose')}</span>
                    <input className="input" dir="auto" maxLength={80} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="1 tab" />
                  </label>
                  <label className="form-row">
                    <span>{t('review.days')}</span>
                    <input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  </label>
                </div>
                <label className="form-row">
                  <span>{t('review.note')}</span>
                  <textarea className="input min-h-20" dir="auto" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('review.note.ph')} />
                </label>
              </>
            ) : null}
            <ErrorText>{err}</ErrorText>
            <button type="submit" disabled={busy || !med} className="app-btn app-btn--primary disabled:opacity-50">
              <Icon name="check" size={24} />
              {busy ? t('common.loading') : t('review.confirm')}
            </button>
            <p className="m-0 text-center text-[0.95rem] text-muted">{t('review.disclaimer')}</p>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
