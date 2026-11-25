import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/useT';
import { BigButton, ErrorText, fmtTime } from './ui';

/** Large, focused modal shown when a dose is due (in-app alert). */
export default function ReminderAlert({ reminder, onTaken, onSkip, onSnooze }) {
  const firstBtn = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    firstBtn.current?.focus();
    // gentle vibration on phones that support it
    try {
      navigator.vibrate?.([300, 150, 300]);
    } catch {
      /* ignore */
    }
  }, [reminder?.id]);

  if (!reminder) return null;
  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal stack" role="alertdialog" aria-modal="true" aria-labelledby="rem-title" aria-describedby="rem-body">
        <h2 id="rem-title">⏰ {t('rem.alert.title')}</h2>
        <div id="rem-body">
          <p className="big">{reminder.medicine_name}</p>
          {reminder.dose ? <p>{reminder.dose}</p> : null}
          {reminder.instructions ? <p className="muted">{reminder.instructions}</p> : null}
          <p className="muted small">{fmtTime(reminder.scheduled_at)}</p>
        </div>
        <ErrorText>{err}</ErrorText>
        <BigButton ref={firstBtn} variant="success" disabled={busy} onClick={() => run(() => onTaken(reminder.id))}>
          ✓ {t('rem.taken')}
        </BigButton>
        <BigButton variant="secondary" disabled={busy} onClick={() => onSnooze(reminder.id)}>
          {t('rem.alert.later')}
        </BigButton>
        <BigButton variant="danger" disabled={busy} onClick={() => run(() => onSkip(reminder.id))}>
          {t('rem.skip')}
        </BigButton>
      </div>
    </div>
  );
}
