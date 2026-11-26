/* "Chotu kaise madad karta hai?": four features as real ARIA tabs (click/tap, arrow keys, and mouse
   hover on desktop also selects). The preview panel tilts in 3D under the mouse and its mini visual
   plays once each time a tab opens (no endless motion, WCAG 2.2.2). Decorative visuals are aria-hidden. */
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import Icon from '../Icon';
import SectionHeading from './SectionHeading';
import { t } from '../../i18n/useT';

const ease = [0.22, 1, 0.36, 1];

function ScanVisual() {
  return (
    <div className="relative h-44 w-36 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      {[90, 70, 85, 60, 75].map((w, i) => (
        <motion.span
          key={i}
          className="mb-3 block h-2.5 rounded-full bg-line"
          style={{ width: `${w}%` }}
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease }}
        />
      ))}
      <motion.span
        className="absolute inset-x-2 top-[10%] h-[3px] rounded-full bg-accent"
        initial={{ y: 0, opacity: 0 }}
        animate={{ y: [0, 136, 70], opacity: [0, 1, 1] }}
        transition={{ duration: 1.6, ease: 'easeInOut' }}
      />
      {['left-0 top-0 border-l-4 border-t-4 rounded-tl-xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-xl', 'left-0 bottom-0 border-b-4 border-l-4 rounded-bl-xl', 'right-0 bottom-0 border-b-4 border-r-4 rounded-br-xl'].map((c) => (
        <span key={c} className={`absolute -m-2 h-7 w-7 border-accent ${c}`} />
      ))}
    </div>
  );
}

function AlarmVisual() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2 border-gold"
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 1.1, opacity: 0 }}
          transition={{ duration: 1.4, delay: i * 0.35, ease: 'easeOut' }}
        />
      ))}
      <motion.span
        className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-gold text-ink shadow-lift"
        animate={{ rotate: [0, -14, 12, -8, 6, 0] }}
        transition={{ duration: 0.9, delay: 0.2 }}
      >
        <Icon name="bell" size={38} />
      </motion.span>
      <span className="absolute -bottom-1 rounded-full bg-accent px-4 py-1.5 text-[1.1rem] font-bold text-accent-text">8:00</span>
    </div>
  );
}

function ChatVisual() {
  const bubbles = [
    ['self-start rounded-bl-md bg-accent-soft text-accent', 'landing.stage.ask'],
    ['self-end rounded-br-md bg-gold-soft text-ink', 'landing.stage.reply'],
  ];
  return (
    <div className="flex w-full max-w-[17rem] flex-col gap-3">
      {bubbles.map(([cls, key], i) => (
        <motion.span
          key={key}
          className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-[1.1rem] font-bold leading-snug ${cls}`}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15 + i * 0.45, duration: 0.35, ease }}
        >
          {t(key)}
        </motion.span>
      ))}
      <motion.span
        className="inline-flex gap-1.5 self-start rounded-2xl bg-accent-soft px-4 py-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: 1.1, duration: 1.4 }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full bg-accent" />
        ))}
      </motion.span>
    </div>
  );
}

function FamilyVisual() {
  const people = ['bg-accent text-accent-text', 'bg-gold text-ink', 'bg-accent-soft text-accent'];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center">
        {people.map((c, i) => (
          <motion.span
            key={c}
            className={`-ml-4 inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-surface first:ml-0 ${c}`}
            initial={{ opacity: 0, x: (i - 1) * 40, scale: 0.7 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: i * 0.12, duration: 0.45, ease }}
          >
            <Icon name={i === 1 ? 'heart' : 'family'} size={32} />
          </motion.span>
        ))}
      </div>
      <motion.span
        className="rounded-full border border-line bg-surface px-4 py-2 text-[1.1rem] font-bold tracking-[0.3em] text-ink shadow-soft [font-variant-numeric:tabular-nums]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.35 }}
      >
        482 913
      </motion.span>
    </div>
  );
}

const FEATURES = [
  { key: 'scan', icon: 'camera', Visual: ScanVisual },
  { key: 'alarm', icon: 'alarm', Visual: AlarmVisual },
  { key: 'chotu', icon: 'chat', Visual: ChatVisual },
  { key: 'family', icon: 'family', Visual: FamilyVisual },
];

function TiltPanel({ children }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 150, damping: 15 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 150, damping: 15 });
  const onMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };
  return (
    <div style={{ perspective: '1000px' }} onPointerMove={reduce ? undefined : onMove} onPointerLeave={reset}>
      <motion.div style={reduce ? undefined : { rotateX, rotateY }} className="rounded-[2rem] border border-line bg-surface-alt p-6 shadow-lift">
        {children}
      </motion.div>
    </div>
  );
}

export default function FeatureTabs() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const tabsRef = useRef([]);
  const f = FEATURES[active];

  const onKey = (e) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    let next = null;
    if (dir) next = (active + dir + FEATURES.length) % FEATURES.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = FEATURES.length - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabsRef.current[next]?.focus();
  };

  return (
    <section aria-labelledby="features-title" data-chotu="listening" className="mx-auto w-full max-w-6xl px-5 py-16">
      <SectionHeading id="features-title" eyebrow={t('landing.features.eyebrow')} title={t('landing.features.title')} />
      <div className="grid items-center gap-8 md:grid-cols-[1fr_1.1fr]">
        <div role="tablist" aria-orientation="vertical" aria-label={t('landing.features.title')} className="flex flex-col gap-3" onKeyDown={onKey}>
          {FEATURES.map((it, i) => {
            const on = i === active;
            return (
              <button
                key={it.key}
                ref={(el) => (tabsRef.current[i] = el)}
                type="button"
                role="tab"
                id={`ftab-${it.key}`}
                aria-selected={on}
                aria-controls="fpanel"
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                className={`relative flex min-h-16 w-full cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-[transform,box-shadow,background-color,border-color] duration-200 active:scale-[0.98] ${
                  on ? 'border-accent bg-surface shadow-lift' : 'border-line bg-surface/60 shadow-soft hover:bg-surface'
                }`}
              >
                <span
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
                    on ? 'bg-accent text-accent-text' : 'bg-accent-soft text-accent'
                  }`}
                >
                  <Icon name={it.icon} size={26} />
                </span>
                <span className="text-[1.3rem] font-bold leading-snug text-ink">{t(`landing.f.${it.key}.title`)}</span>
                {on && !reduce && (
                  <motion.span layoutId="ftab-bar" aria-hidden="true" className="absolute inset-y-3 left-0 w-1.5 rounded-r-full bg-gold" />
                )}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="fpanel" aria-labelledby={`ftab-${f.key}`}>
          <TiltPanel>
            <div aria-hidden="true" className="flex min-h-56 items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={f.key}
                  initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="flex w-full justify-center"
                >
                  <f.Visual />
                </motion.div>
              </AnimatePresence>
            </div>
            <p className="m-0 mt-5 text-center text-[1.3rem] font-bold leading-snug text-ink [text-wrap:balance]">{t(`landing.f.${f.key}.text`)}</p>
          </TiltPanel>
        </div>
      </div>
    </section>
  );
}
