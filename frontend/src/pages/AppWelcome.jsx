import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ChotuAgent from '../components/chotu/ChotuAgent';
import ChotuBoundary from '../components/chotu/ChotuBoundary';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import { LangToggle } from '../i18n/LangProvider';
import { getLang, t } from '../i18n/useT';

/* App-mode start screen (Android app / installed PWA): ONE screen, like a native app's onboarding.
   Three swipeable slides (they also move on by themselves; touching them pauses that), Chotu's mood
   changes with each slide, page dots, and two big actions that are always visible.
   The website keeps its scrolling landing page (Landing.jsx). */
const ease = [0.22, 1, 0.36, 1];
const SLIDES = [
  { key: 'meds', icon: 'camera', chotu: 'idle' },
  { key: 'checkin', icon: 'chat', chotu: 'speaking' },
  { key: 'family', icon: 'family', chotu: 'listening' },
];
const AUTO_MS = 4800;

const buzz = () => {
  try {
    navigator.vibrate?.(6);
  } catch {
    /* ignore */
  }
};

export default function AppWelcome() {
  // Short screens or large phone font sizes: a smaller Chotu so everything fits without scrolling.
  const chotuSize = typeof window !== 'undefined' && window.innerHeight < 820 ? 120 : 160;
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const paused = useRef(false);
  const rtl = getLang() === 'ur';

  const go = (next) => {
    const n = (next + SLIDES.length) % SLIDES.length;
    setDir(next > i ? 1 : -1);
    setI(n);
  };

  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => {
      if (!paused.current) {
        setDir(1);
        setI((x) => (x + 1) % SLIDES.length);
      }
    }, AUTO_MS);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[i];
  const sign = rtl ? -1 : 1; // swipe direction follows reading direction

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-bg px-5 text-ink">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[18%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--glow-teal),transparent_68%)]" />
          <div className="absolute -right-24 top-[50%] h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--glow-gold),transparent_70%)]" />
          <div className="absolute -left-20 top-[8%] h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--glow-peach),transparent_70%)]" />
        </div>

        <header className="flex items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),1rem)]">
          <ThemeToggle />
          <p className="m-0 font-serif text-[1.5rem] font-semibold text-accent">{t('app.name')}</p>
          <LangToggle />
        </header>

        <section
          className="flex flex-1 flex-col items-center justify-center py-3 text-center"
          aria-roledescription="carousel"
          aria-label={t('app.welcome.slides')}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
            className="relative"
          >
            <span aria-hidden="true" className="absolute inset-[14%] -z-10 rounded-full bg-accent-soft" />
            <ChotuBoundary>
              <ChotuAgent state={slide.chotu} size={chotuSize} />
            </ChotuBoundary>
            <motion.span
              key={slide.icon}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
              aria-hidden="true"
              className="absolute -bottom-1 end-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-ink shadow-lift"
            >
              <Icon name={slide.icon} size={28} />
            </motion.span>
          </motion.div>

          <motion.div
            className="relative mt-5 w-full max-w-[24rem] touch-pan-y"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragStart={() => {
              paused.current = true;
            }}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 50) {
                buzz();
                go(i + (info.offset.x < 0 ? sign : -sign));
              }
            }}
          >
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={slide.key}
                custom={dir}
                initial={{ opacity: 0, x: 40 * dir * sign }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 * dir * sign }}
                transition={{ duration: 0.35, ease }}
                aria-live="polite"
              >
                <h1 className="m-0 font-serif text-[2rem] font-semibold leading-tight text-ink">{t(`app.welcome.${slide.key}.title`)}</h1>
                <p className="m-0 mx-auto mt-2 max-w-[21rem] text-balance text-[1.2rem] leading-snug text-muted">
                  {t(`app.welcome.${slide.key}.text`)}
                </p>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <div className="mt-5 flex items-center gap-1" role="tablist" aria-label={t('app.welcome.slides')}>
            {SLIDES.map((s, n) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={t(`app.welcome.${s.key}.title`)}
                onClick={() => {
                  paused.current = true;
                  buzz();
                  go(n);
                }}
                className="flex h-12 w-12 items-center justify-center border-0 bg-transparent"
              >
                <motion.span
                  className="block h-2.5 rounded-full"
                  animate={{ width: n === i ? 28 : 10, backgroundColor: n === i ? 'var(--accent)' : 'var(--border)' }}
                  transition={{ duration: 0.3 }}
                />
              </button>
            ))}
          </div>
        </section>

        <motion.footer
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.35, ease }}
          className="flex flex-col gap-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        >
          <Link to="/login" className="app-btn app-btn--primary">
            {t('common.login')}
          </Link>
          <Link to="/register" className="app-btn app-btn--secondary">
            {t('common.register')}
          </Link>
          <p className="m-0 mt-1 text-center text-[1rem] text-muted">{t('app.welcome.note')}</p>
        </motion.footer>
      </main>
    </MotionConfig>
  );
}
