import { motion } from 'motion/react';
import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth/AuthContext';
import AuroraBackground from '../components/landing/AuroraBackground';
import BentoFeatures from '../components/landing/BentoFeatures';
import DayWithChotu from '../components/landing/DayWithChotu';
import FinalCta, { LandingFooter } from '../components/landing/FinalCta';
import FlipWords from '../components/landing/FlipWords';
import HeroShowcase from '../components/landing/HeroShowcase';
import HowItWorks from '../components/landing/HowItWorks';
import Icon from '../components/landing/icons';
import LandingNav from '../components/landing/LandingNav';
import RevealText from '../components/landing/RevealText';
import RolesSection from '../components/landing/RolesSection';
import TrustSection from '../components/landing/TrustSection';
import { useReveal } from '../components/landing/motion';
import { BigButton } from '../components/ui';
import { t } from '../i18n/useT';

/* Stage B landing: serif "Aapki sehat," + huge tight caps "SAATHI" + serif tagline (CLAUDE.md).
   Two columns from 768px (text | phone preview with Chotu), stacked and centred on phones.
   Display/script fonts only in the hero and section headings; buttons keep the body font.
   Login stays the single primary action. */
export default function Landing() {
  const { user, ready } = useAuth();
  const { fadeUp } = useReveal();
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-5 focus:py-3 focus:text-[1.25rem] focus:font-bold focus:text-accent focus:shadow-lift">
        {t('landing.skip')}
      </a>
      <AuroraBackground />
      <LandingNav />

      <main id="main" tabIndex={-1}>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pb-12 pt-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pt-16">
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

            <motion.p {...fadeUp(0.85)} className="m-0 mt-4 text-[1.25rem] leading-relaxed text-muted">
              {t('landing.flip.lead')}{' '}
              <FlipWords
                className="font-bold text-accent"
                words={[t('landing.flip.1'), t('landing.flip.2'), t('landing.flip.3'), t('landing.flip.4')]}
              />
            </motion.p>

            <motion.div {...fadeUp(1)} className="mt-8 flex w-full max-w-md flex-col gap-3">
              <BigButton to="/login" className="shadow-lift">
                {t('common.login')}
              </BigButton>
              <BigButton to="/register" variant="secondary">
                {t('common.register')}
              </BigButton>
            </motion.div>

            <motion.ul
              {...fadeUp(1.15)}
              aria-label={t('landing.chips.label')}
              className="m-0 mt-6 flex list-none flex-wrap justify-center gap-2 p-0 md:justify-start"
            >
              {[1, 2, 3, 4].map((n) => (
                <li
                  key={n}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[1.25rem] font-bold text-ink"
                >
                  <Icon name="check" size={18} className="text-accent" />
                  {t(`landing.chip.${n}`)}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div {...fadeUp(0.4)}>
            <HeroShowcase />
          </motion.div>
        </section>

        <BentoFeatures />
        <HowItWorks />
        <DayWithChotu />
        <RolesSection />
        <TrustSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
