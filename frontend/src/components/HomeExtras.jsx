/* Small elder Home cards: notes from the doctor / family (with a heart back), one-tap "I'm OK",
   the weekly summary (facts only), a general wellness tip of the day, and the first-time tour. */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { getLang, t } from '../i18n/useT';
import { hapticSuccess, hapticTap } from '../lib/native';
import { spring } from '../lib/motion';
import { getPrefs, setPref } from '../lib/prefs';
import { speak } from '../lib/speak';
import ChotuAgent from './chotu/ChotuAgent';
import ChotuBoundary from './chotu/ChotuBoundary';
import Icon from './Icon';
import { fmtDay } from './ui';

export function MessagesCard() {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    api('/messages')
      .then((m) => setMsgs(m.slice(0, 2)))
      .catch(() => {});
  }, []);
  if (!msgs.length) return null;
  const heart = async (m) => {
    hapticSuccess();
    setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, hearted: true } : x)));
    api(`/messages/${encodeURIComponent(m.id)}/heart`, { method: 'POST' }).catch(() => {});
  };
  return (
    <section aria-label={t('msg.title')} className="flex flex-col gap-2">
      {msgs.map((m) => (
        <div key={m.id} className="card-ios flex items-start gap-3 p-4">
          <span className="row-icon row-icon--accent shrink-0">
            <Icon name={m.from_role === 'doctor' ? 'doc' : 'family'} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[0.95rem] font-semibold text-muted">
              {t(m.from_role === 'doctor' ? 'msg.from_doctor' : 'msg.from_family', { name: m.from_name })} · {fmtDay(m.created_at)}
            </p>
            <p className="m-0 mt-1 text-[1.25rem] font-semibold leading-snug" dir="auto">
              {m.text}
            </p>
            <p className="m-0 mt-1 text-[0.9rem] text-muted">{t('msg.not_ai')}</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            transition={spring.press}
            onClick={() => heart(m)}
            disabled={m.hearted}
            aria-label={t('msg.heart')}
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-0 text-[1.5rem] ${m.hearted ? 'bg-danger-bg' : 'bg-surface-alt'}`}
          >
            {m.hearted ? '❤️' : '🤍'}
          </motion.button>
        </div>
      ))}
    </section>
  );
}

const todayKey = () => `ss.ok.${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })}`;

export function ImOkCard() {
  const [done, setDone] = useState(() => {
    try {
      return !!localStorage.getItem(todayKey());
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    hapticTap();
    try {
      await api(`/checkins/ok?lang=${getLang() === 'ur' ? 'ur' : getLang() === 'en' ? 'en' : 'roman'}`, { method: 'POST' });
      hapticSuccess();
      try {
        localStorage.setItem(todayKey(), '1');
      } catch {
        /* ignore */
      }
      setDone(true);
    } catch {
      /* stays tappable */
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <div role="status" className="flex items-center gap-3 rounded-[22px] bg-success-bg px-4 py-3 text-success">
        <Icon name="check" size={24} />
        <span className="text-[1.15rem] font-semibold">{t('ok.done')}</span>
      </div>
    );
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} transition={spring.press} onClick={send} disabled={busy} className="ios-row card-ios w-full border-0 text-start">
      <span className="row-icon row-icon--accent">
        <span aria-hidden="true" className="text-[1.4rem]">
          👋
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.3rem] font-bold">{busy ? t('common.loading') : t('ok.title')}</span>
        <span className="block text-[1.05rem] text-muted">{t('ok.sub')}</span>
      </span>
    </motion.button>
  );
}

/** "This week you took 92% of your doses" — facts from the dashboard, no advice. */
export function WeekSummary({ userId }) {
  const [w, setW] = useState(null);
  useEffect(() => {
    if (!userId) return;
    api(`/dashboard/${encodeURIComponent(userId)}?days=14`)
      .then((d) => setW(d.week_compare))
      .catch(() => {});
  }, [userId]);
  if (!w || w.this_week == null) return null;
  const diff = w.last_week == null ? null : w.this_week - w.last_week;
  return (
    <div className="card-ios flex items-center gap-4 p-4">
      <span className="row-icon row-icon--accent">
        <Icon name="chart" size={22} />
      </span>
      <p className="m-0 flex-1 text-[1.15rem] font-semibold leading-snug">
        {t('week.summary', { pct: w.this_week })}
        {diff != null && diff !== 0 ? (
          <span className={`block text-[1rem] font-normal ${diff > 0 ? 'text-success' : 'text-muted'}`}>
            {t(diff > 0 ? 'week.up' : 'week.down', { n: Math.abs(diff) })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

const TIPS = ['tip.water', 'tip.walk', 'tip.call', 'tip.sun', 'tip.meal', 'tip.stretch', 'tip.sleep'];
export function TipOfDay() {
  const day = Math.floor(Date.now() / 86_400_000);
  const key = TIPS[day % TIPS.length];
  return (
    <div className="flex items-start gap-3 rounded-[22px] bg-gold-soft px-4 py-3 text-gold-text">
      <span aria-hidden="true" className="text-[1.4rem]">
        🌿
      </span>
      <p className="m-0 text-[1.1rem] font-semibold leading-snug">
        {t(key)} <span className="block text-[0.9rem] font-normal">{t('tip.note')}</span>
      </p>
    </div>
  );
}

const STEPS = ['tour.1', 'tour.2', 'tour.3', 'tour.4'];
/** First login: four short steps with Chotu (read aloud), once per phone. */
export function Tutorial() {
  const [step, setStep] = useState(() => (getPrefs().tutorialDone ? -1 : 0));
  useEffect(() => {
    if (step >= 0) speak(t(`${STEPS[step]}.body`));
  }, [step]);
  const close = () => {
    setPref('tutorialDone', true);
    setStep(-1);
  };
  return createPortal(
    <AnimatePresence>
      {step >= 0 ? (
        <motion.div key="tour" className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-h"
            className="sheet items-center text-center"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.sheet}
          >
            <span className="sheet__grabber" aria-hidden="true" />
            <ChotuBoundary>
              <ChotuAgent size={110} state="speaking" />
            </ChotuBoundary>
            <p className="m-0 text-[1rem] font-semibold text-muted">
              {step + 1} / {STEPS.length}
            </p>
            <h2 id="tour-h" className="m-0 text-[1.6rem] font-bold">
              {t(`${STEPS[step]}.title`)}
            </h2>
            <p className="m-0 text-[1.25rem] leading-snug">{t(`${STEPS[step]}.body`)}</p>
            <button
              type="button"
              autoFocus
              onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : close())}
              className="app-btn app-btn--primary pressable w-full"
            >
              {step + 1 < STEPS.length ? t('tour.next') : t('tour.done')}
            </button>
            <button type="button" onClick={close} className="sheet__close">
              {t('tour.skip')}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
