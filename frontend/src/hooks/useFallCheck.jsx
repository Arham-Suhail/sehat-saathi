/* Possible-fall check (prototype, opt-in in More, only while the app is open): a hard jolt from the
   phone's motion sensor followed by ~8 s of stillness asks "Are you OK?" for 30 seconds. "I'm OK"
   closes it; no answer sends an urgent alert to the family / doctor (POST /alerts/fall). Thresholds
   are conservative to avoid false alarms; it is labelled a prototype, not a medical device. */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { hapticWarning } from '../lib/native';
import { spring } from '../lib/motion';
import { usePrefs } from '../lib/prefs';
import { speak } from '../lib/speak';

const JOLT = 28; // m/s^2 (about 3 g)
const STILL = 1.2; // deviation from gravity while still
const STILL_MS = 8000;
const ASK_S = 30;

export default function FallCheck() {
  const { fall } = usePrefs();
  const [asking, setAsking] = useState(false);
  const [left, setLeft] = useState(ASK_S);
  const [sent, setSent] = useState(false);
  const jolt = useRef(0);
  const moved = useRef(0);

  useEffect(() => {
    if (!fall || typeof window.DeviceMotionEvent === 'undefined') return undefined;
    const on = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const g = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const now = Date.now();
      if (g > JOLT) {
        jolt.current = now;
        moved.current = now;
        return;
      }
      if (Math.abs(g - 9.81) > STILL) moved.current = now;
      if (jolt.current && now - jolt.current > STILL_MS && now - moved.current > STILL_MS) {
        jolt.current = 0;
        setLeft(ASK_S);
        setSent(false);
        setAsking(true);
      }
    };
    window.addEventListener('devicemotion', on);
    return () => window.removeEventListener('devicemotion', on);
  }, [fall]);

  useEffect(() => {
    if (!asking) return undefined;
    hapticWarning();
    speak(t('fall.ask'), { force: true });
    const id = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(id);
  }, [asking]);

  useEffect(() => {
    if (asking && left <= 0 && !sent) {
      setSent(true);
      api('/alerts/fall', { method: 'POST', json: {} }).catch(() => {});
      setTimeout(() => setAsking(false), 4000);
    }
  }, [asking, left, sent]);

  return createPortal(
    <AnimatePresence>
      {asking ? (
        <motion.div key="fall" className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="alertdialog" aria-modal="true" aria-labelledby="fall-h" className="sheet text-center" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring.sheet}>
            <span className="sheet__grabber" aria-hidden="true" />
            <h2 id="fall-h" className="m-0 text-[1.8rem] font-bold">
              {t('fall.title')}
            </h2>
            <p className="m-0 text-[1.25rem]">{sent ? t('fall.sent') : t('fall.body', { n: Math.max(0, left) })}</p>
            {!sent ? (
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setAsking(false);
                  api('/alerts/fall', { method: 'POST', json: { answered: true } }).catch(() => {});
                }}
                className="dose-btn dose-btn--yes"
              >
                {t('fall.ok')}
              </button>
            ) : null}
            <p className="m-0 text-[0.95rem] text-muted">{t('fall.note')}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
