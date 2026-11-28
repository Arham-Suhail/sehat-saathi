/* The one thing an elder must do at dose time: two big buttons, "Taken" and "Not taken".
   Used on Home, on Today's medicines and in the alarm sheet. Big type, 72px buttons, a gentle
   spring on press, and a calm "done" state after tapping. Not taken -> the family is told. */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import { hapticTap } from '../lib/native';
import { spring as springs } from '../lib/motion';
import Icon from './Icon';
import { ErrorText, fmtTime } from './ui';

const spring = springs.press;

export default function DoseCard({ reminder, onAct, label, className = '' }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  if (!reminder) return null;

  const run = async (action) => {
    setBusy(action);
    setErr(null);
    if (action !== 'taken') hapticTap(); // Taken gets the success haptic + chime from the engine
    try {
      await onAct(reminder.id, action);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`dose-${reminder.id}`} className={`dose-card ${className}`}>
      <p className="m-0 flex items-center gap-2 text-[1.05rem] font-semibold text-accent">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
          <Icon name="pill" size={18} />
        </span>
        {label || t('dose.now')}
      </p>
      <p className="m-0 mt-3 text-[2.6rem] font-bold leading-none tracking-[-0.03em] [font-variant-numeric:tabular-nums]">
        {fmtTime(reminder.scheduled_at)}
      </p>
      <h2 id={`dose-${reminder.id}`} className="m-0 mt-2 text-[1.6rem] font-bold leading-tight" dir="auto">
        {st(reminder.medicine_name)}
      </h2>
      {reminder.dose || reminder.instructions ? (
        <p className="m-0 mt-1 text-[1.2rem] text-muted" dir="auto">
          {[reminder.dose, reminder.instructions ? st(reminder.instructions) : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      <ErrorText>{err}</ErrorText>
      <div className="mt-5 flex flex-col gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          transition={spring}
          disabled={!!busy}
          onClick={() => run('taken')}
          className="dose-btn dose-btn--yes"
        >
          <Icon name="check" size={30} />
          {busy === 'taken' ? t('common.loading') : t('dose.taken')}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          transition={spring}
          disabled={!!busy}
          onClick={() => run('skipped')}
          className="dose-btn dose-btn--no"
        >
          <span aria-hidden="true" className="text-[1.5rem] leading-none">
            ✕
          </span>
          {busy === 'skipped' ? t('common.loading') : t('dose.not_taken')}
        </motion.button>
      </div>
    </section>
  );
}

/** Small "done" row shown after the elder answered (or for doses already marked). */
export function DoseDone({ reminder }) {
  const ok = reminder.status === 'taken';
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex items-center gap-3 rounded-[22px] px-4 py-3 ${ok ? 'bg-success-bg text-success' : 'bg-surface-alt text-muted'}`}
      >
        <Icon name={ok ? 'check' : 'bell'} size={24} />
        <span className="text-[1.15rem] font-semibold">
          {ok ? t('dose.done.taken', { name: st(reminder.medicine_name) }) : t('dose.done.skipped', { name: st(reminder.medicine_name) })}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
