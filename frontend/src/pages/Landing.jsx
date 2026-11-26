import { motion, useReducedMotion } from 'motion/react';
import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth/AuthContext';
import AuroraBackground from '../components/landing/AuroraBackground';
import BentoFeatures from '../components/landing/BentoFeatures';
import FlipWords from '../components/landing/FlipWords';
import RevealText from '../components/landing/RevealText';
import { BigButton } from '../components/ui';
import { t } from '../i18n/useT';

/* Stage B landing hero: serif "Aapki sehat," + huge tight caps "SAATHI" + serif tagline (CLAUDE.md),
   with an aurora/dot-grid background, letter reveal and flip words (Aceternity-inspired), all CSS/SVG.
   Display/script fonts are used only here and in section headings; buttons keep the body font. */
export default function Landing() {
  const { user, ready } = useAuth();
  const reduce = useReducedMotion();
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;

  const fadeUp = (delay) =>
    reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] } };

  return (
    <main className="relative isolate min-h-dvh overflow-x-clip bg-bg text-ink">
      <AuroraBackground />

      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pb-12 pt-12 text-center sm:pt-20">
        <motion.p
          {...fadeUp(0)}
          className="m-0 mb-6 inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-4 py-2 text-[1rem] font-bold text-accent shadow-soft backdrop-blur-md"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold" />
          {t('landing.badge')}
        </motion.p>

        <h1 className="m-0 flex flex-col items-center">
          <motion.span {...fadeUp(0.1)} className="pb-1 font-serif text-[clamp(2.1rem,8.5vw,4rem)] font-normal italic leading-tight text-ink">
            {t('landing.hero.line1')}
          </motion.span>
          <RevealText
            text="SAATHI"
            delay={0.25}
            className="font-display text-[clamp(5rem,27vw,12.5rem)] uppercase leading-[0.9] tracking-[0.01em]"
          />
        </h1>

        <motion.p {...fadeUp(0.75)} className="m-0 mt-5 max-w-xl font-serif text-[clamp(1.3rem,4.5vw,1.75rem)] leading-snug text-ink">
          {t('app.tagline')}
        </motion.p>

        <motion.p {...fadeUp(0.9)} className="m-0 mt-4 text-[1.15rem] leading-relaxed text-muted">
          {t('landing.flip.lead')}{' '}
          <FlipWords
            className="font-bold text-accent"
            words={[t('landing.flip.1'), t('landing.flip.2'), t('landing.flip.3'), t('landing.flip.4')]}
          />
        </motion.p>

        <motion.div {...fadeUp(1.05)} className="mt-8 flex w-full max-w-md flex-col gap-3">
          <BigButton to="/login" className="shadow-lift">
            {t('common.login')}
          </BigButton>
          <BigButton to="/register" variant="secondary">
            {t('common.register')}
          </BigButton>
        </motion.div>

        <motion.p {...fadeUp(1.2)} aria-hidden="true" className="m-0 mt-6 font-script text-[clamp(1.6rem,6vw,2.2rem)] text-gold-text">
          {t('landing.script')}
        </motion.p>
      </section>

      <BentoFeatures />

      <footer className="mx-auto max-w-5xl px-5 pb-10 text-center">
        <p className="m-0 text-[1rem] leading-relaxed text-muted">{t('landing.disclaimer')}</p>
      </footer>
    </main>
  );
}
