/* Closing call to action + footer. Same Login (primary) / Register (secondary) pair as the hero,
   so the page keeps one primary action. Who it's for and the two key safety promises are short chips
   (they replace the old roles/trust sections). Chotu note and prototype disclaimer always shown. */
import { motion, useReducedMotion } from 'motion/react';
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';
import { BigButton } from '../ui';
import Icon from '../Icon';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

const CHIPS = [
  { key: 'landing.cta.chip.elder', icon: 'elder' },
  { key: 'landing.cta.chip.family', icon: 'family' },
  { key: 'landing.cta.chip.doctor', icon: 'stethoscope' },
  { key: 'landing.cta.chip.photo', icon: 'eyeOff' },
  { key: 'landing.cta.chip.ai', icon: 'shield' },
];

export default function FinalCta() {
  const { inView } = useReveal();
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="cta-title" data-chotu="hide" className="mx-auto w-full max-w-4xl px-5 py-16">
      <motion.div
        {...inView()}
        className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface px-6 py-10 text-center shadow-lift sm:px-12"
      >
        <span
          aria-hidden="true"
          className="absolute -right-16 -top-16 -z-10 h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-20 -left-16 -z-10 h-72 w-72 rounded-full"
          style={{ background: 'radial-gradient(closest-side, var(--glow-teal), transparent)' }}
        />
        <div aria-hidden="true" className="mx-auto mb-2 w-fit">
          <ChotuBoundary>
            <ChotuAgent state="speaking" size={96} />
          </ChotuBoundary>
        </div>
        <h2 id="cta-title" className="m-0 font-serif text-[clamp(2rem,6vw,3rem)] font-semibold leading-tight text-ink [text-wrap:balance]">
          {t('landing.cta.title')}
        </h2>

        <ul className="m-0 mx-auto mt-5 flex max-w-2xl list-none flex-wrap justify-center gap-2 p-0">
          {CHIPS.map((c, i) => (
            <motion.li
              key={c.key}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={reduce ? undefined : { y: -3 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-[1.25rem] font-bold text-ink"
            >
              <Icon name={c.icon} size={20} className="text-accent" />
              {t(c.key)}
            </motion.li>
          ))}
        </ul>

        <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3">
          <BigButton to="/login" className="shadow-lift">
            {t('common.login')}
          </BigButton>
          <BigButton to="/register" variant="secondary">
            {t('common.register')}
          </BigButton>
        </div>
        <p aria-hidden="true" className="m-0 mt-6 font-script text-[clamp(1.6rem,6vw,2.2rem)] text-gold-text">
          {t('landing.script')}
        </p>
      </motion.div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-line" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-8 text-center">
        <p className="m-0 max-w-2xl text-[1.25rem] leading-relaxed text-muted">{t('landing.chotu.note')}</p>
        <p className="m-0 max-w-2xl text-[1.25rem] leading-relaxed text-muted">{t('landing.disclaimer')}</p>
      </div>
    </footer>
  );
}
