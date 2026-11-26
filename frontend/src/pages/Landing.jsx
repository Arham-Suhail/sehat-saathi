import { MotionConfig, motion } from 'motion/react';
import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth/AuthContext';
import AuroraBackground from '../components/landing/AuroraBackground';
import DayWithChotu from '../components/landing/DayWithChotu';
import FeatureTabs from '../components/landing/FeatureTabs';
import FinalCta, { LandingFooter } from '../components/landing/FinalCta';
import HeroStage from '../components/landing/HeroStage';
import LandingNav from '../components/landing/LandingNav';
import RevealText from '../components/landing/RevealText';
import ScrollBuddy from '../components/landing/ScrollBuddy';
import { useReveal } from '../components/landing/motion';
import { BigButton } from '../components/ui';
import { t } from '../i18n/useT';

/* Stage B landing, kept to the point: four sections (hero, features, a day with Chotu, CTA).
   Hero: serif "Aapki sehat," + huge tight caps "SAATHI" + serif tagline (CLAUDE.md), next to an
   interactive pseudo-3D Chotu. A small Chotu follows the scroll (ScrollBuddy reads data-chotu).
   MotionConfig reducedMotion="user": with the OS setting on, Motion drops transforms automatically.
   Display/script fonts only in the hero and section headings; Login is the single primary action. */
export default function Landing() {
  const { user, ready } = useAuth();
  const { fadeUp } = useReveal();
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate min-h-dvh overflow-x-clip bg-bg text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-5 focus:py-3 focus:text-[1.25rem] focus:font-bold focus:text-accent focus:shadow-lift"
        >
          {t('landing.skip')}
        </a>
        <AuroraBackground />
        <LandingNav />
        <ScrollBuddy />

        <main id="main" tabIndex={-1}>
          <section
            data-chotu="hide"
            className="mx-auto grid w-full max-w-6xl items-center gap-6 px-5 pb-10 pt-8 md:min-h-[calc(100svh-4.5rem)] md:grid-cols-[1.05fr_0.95fr] md:gap-10 md:pt-10"
          >
            <div className="flex flex-col items-center text-center md:items-start md:text-left">
              <motion.p
                {...fadeUp(0)}
                className="m-0 mb-5 inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-4 py-2 text-[1.25rem] font-bold text-accent shadow-soft backdrop-blur-md"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold" />
                {t('landing.badge')}
              </motion.p>

              <h1 className="m-0 flex flex-col items-center md:items-start">
                <motion.span {...fadeUp(0.1)} className="pb-1 font-serif text-[clamp(2.1rem,8.5vw,3.75rem)] font-normal italic leading-tight text-ink">
                  {t('landing.hero.line1')}
                </motion.span>{' '}
                <RevealText
                  text="SAATHI"
                  delay={0.25}
                  className="font-display text-[clamp(5rem,26vw,12rem)] uppercase leading-[0.9] tracking-[0.01em] md:text-[clamp(6rem,13vw,10.5rem)]"
                />
              </h1>

              <motion.p {...fadeUp(0.7)} className="m-0 mt-5 max-w-xl font-serif text-[clamp(1.35rem,4.5vw,1.75rem)] leading-snug text-ink [text-wrap:balance]">
                {t('app.tagline')}
              </motion.p>

              <motion.div {...fadeUp(0.9)} className="mt-8 flex w-full max-w-md flex-col gap-3">
                <BigButton to="/login" className="shadow-lift">
                  {t('common.login')}
                </BigButton>
                <BigButton to="/register" variant="secondary">
                  {t('common.register')}
                </BigButton>
              </motion.div>
            </div>

            <motion.div {...fadeUp(0.35)}>
              <HeroStage />
            </motion.div>
          </section>

          <FeatureTabs />
          <DayWithChotu />
          <FinalCta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
