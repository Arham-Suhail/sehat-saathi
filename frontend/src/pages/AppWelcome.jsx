import { MotionConfig, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import ChotuAgent from '../components/chotu/ChotuAgent';
import ChotuBoundary from '../components/chotu/ChotuBoundary';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import { LangToggle } from '../i18n/LangProvider';
import { t } from '../i18n/useT';

/* App-mode start screen (Android app / installed PWA): ONE screen, no scrolling, like a native app.
   Chotu waves, the app name and tagline, three small feature chips, and two big actions.
   The website keeps its scrolling landing page (Landing.jsx). */
const ease = [0.22, 1, 0.36, 1];
const rise = (delay) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease },
});

export default function AppWelcome() {
  // Short screens or large phone font sizes: a smaller Chotu so everything fits without scrolling.
  const chotuSize = typeof window !== 'undefined' && window.innerHeight < 820 ? 124 : 168;
  const chips = [
    ['alarm', t('app.welcome.chip.reminders')],
    ['chat', t('app.welcome.chip.checkin')],
    ['family', t('app.welcome.chip.family')],
  ];
  return (
    <MotionConfig reducedMotion="user">
      <main className="app-screen relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-bg px-5 text-ink">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[22%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--glow-teal),transparent_68%)]" />
          <div className="absolute -right-24 top-[46%] h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--glow-gold),transparent_70%)]" />
        </div>

        <header className="flex items-center justify-between pt-[max(env(safe-area-inset-top),1rem)]">
          <ThemeToggle />
          <LangToggle />
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.05 }}
          >
            <ChotuBoundary>
              <ChotuAgent state="idle" size={chotuSize} />
            </ChotuBoundary>
          </motion.div>
          <motion.h1 {...rise(0.2)} className="m-0 mt-2 font-serif text-[2.6rem] font-semibold leading-tight text-ink">
            {t('app.name')}
          </motion.h1>
          <motion.p {...rise(0.3)} className="m-0 mt-2 max-w-[22rem] text-balance text-[1.3rem] leading-snug text-muted">
            {t('app.tagline')}
          </motion.p>
          <motion.ul {...rise(0.4)} className="m-0 mt-5 flex list-none flex-wrap justify-center gap-2 p-0">
            {chips.map(([icon, text]) => (
              <li key={icon} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[1.05rem] font-bold text-accent shadow-soft">
                <Icon name={icon} size={18} />
                {text}
              </li>
            ))}
          </motion.ul>
        </section>

        <motion.footer {...rise(0.5)} className="flex flex-col gap-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
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
