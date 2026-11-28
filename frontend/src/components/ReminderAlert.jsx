/* Dose-time sheet (in-app alarm): slides up from the bottom like a native sheet, with only the two
   big answers ("Taken" / "Not taken"). If the elder doesn't answer, the alarm rings again 15 and 30
   minutes later (native / push follow-ups) and after an hour the family is told. */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import DoseCard from './DoseCard';
import { t } from '../i18n/useT';
import { st } from '../i18n/server';
import { speak, stopSpeaking } from '../lib/speak';

export default function ReminderAlert({ reminder, onAct, onClose }) {
  useEffect(() => {
    if (!reminder) return;
    try {
      navigator.vibrate?.([300, 150, 300]); // gentle vibration on phones that support it
    } catch {
      /* ignore */
    }
    // Chotu says it out loud, for elders who can't read the screen well.
    speak(t('speak.dose', { name: st(reminder.medicine_name), dose: reminder.dose || '' }));
    return () => stopSpeaking();
  }, [reminder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <AnimatePresence>
      {reminder ? (
        <motion.div
          key="sheet"
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={t('rem.alert.title')}
            className="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <span className="sheet__grabber" aria-hidden="true" />
            <DoseCard reminder={reminder} onAct={onAct} label={t('rem.alert.title')} className="dose-card--flat" />
            <button type="button" onClick={onClose} className="sheet__close">
              {t('dose.later')}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
