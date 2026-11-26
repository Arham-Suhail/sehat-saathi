import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/useT';
import { BigButton, ErrorText, fmtTime } from './ui';
import { st } from '../i18n/server';

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
        <div className="center">
          <span className="alarm-badge" aria-hidden="true">
            ⏰
          </span>
        </div>
        <h2 id="rem-title" className="center">
          {t('rem.alert.title')}
        </h2>
        <div id="rem-body" className="center">
          <p className="big" style={{ marginBottom: 4 }}>
            {st(reminder.medicine_name)}
          </p>
          {reminder.dose ? <p style={{ marginBottom: 4 }}>{reminder.dose}</p> : null}
          {reminder.instructions ? <p className="muted">{reminder.instructions}</p> : null}
          <span className="alarm-time">{fmtTime(reminder.scheduled_at)}</span>
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
