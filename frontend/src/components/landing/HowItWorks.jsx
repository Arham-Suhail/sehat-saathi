/* "Kaise kaam karta hai?": three numbered steps joined by a line
   (vertical on mobile, horizontal on desktop). A real ordered list for screen readers. */
import { motion } from 'motion/react';
import SectionHeading from './SectionHeading';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

const STEPS = [1, 2, 3];

export default function HowItWorks() {
  const { inView } = useReveal();
  return (
    <section aria-labelledby="how-title" className="mx-auto w-full max-w-6xl px-5 py-14">
      <SectionHeading id="how-title" eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} />
      <ol className="relative m-0 grid list-none gap-6 p-0 md:grid-cols-3 md:gap-8">
        <span
          aria-hidden="true"
          className="absolute bottom-10 left-[1.95rem] top-10 w-[3px] rounded-full md:bottom-auto md:left-[16%] md:right-[16%] md:top-[1.95rem] md:h-[3px] md:w-auto"
          style={{ background: 'linear-gradient(var(--accent-soft), var(--gold-soft))' }}
        />
        {STEPS.map((n, i) => (
          <motion.li key={n} {...inView(i * 0.1)} className="relative flex gap-5 md:flex-col md:items-center md:text-center">
            <span className="relative z-10 inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-bg bg-accent text-[1.6rem] font-bold text-accent-text shadow-lift">
              {n}
            </span>
            <div className="pt-2 md:pt-0">
              <h3 className="m-0 mb-1 text-[1.4rem] font-bold leading-snug text-ink">{t(`landing.how.${n}.title`)}</h3>
              <p className="m-0 text-[1.25rem] leading-relaxed text-muted [text-wrap:pretty]">{t(`landing.how.${n}.text`)}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
