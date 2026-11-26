/* "Aap ki hifazat": four plain safety promises on a calm full-width band (no cards inside cards). */
import { motion } from 'motion/react';
import Icon from './icons';
import SectionHeading from './SectionHeading';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

const POINTS = [
  { n: 1, icon: 'eyeOff' },
  { n: 2, icon: 'stethoscope' },
  { n: 3, icon: 'shield' },
  { n: 4, icon: 'lock' },
];

export default function TrustSection() {
  const { inView } = useReveal();
  return (
    <section aria-labelledby="trust-title" className="border-y border-line bg-surface-alt">
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <SectionHeading id="trust-title" eyebrow={t('landing.trust.eyebrow')} title={t('landing.trust.title')} />
        <ul className="m-0 grid list-none gap-x-10 gap-y-8 p-0 sm:grid-cols-2">
          {POINTS.map((p, i) => (
            <motion.li key={p.n} {...inView(i * 0.06)} className="flex gap-4">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-accent shadow-soft">
                <Icon name={p.icon} size={28} />
              </span>
              <div>
                <h3 className="m-0 mb-1 text-[1.35rem] font-bold leading-snug text-ink">{t(`landing.trust.${p.n}.title`)}</h3>
                <p className="m-0 text-[1.25rem] leading-relaxed text-muted [text-wrap:pretty]">{t(`landing.trust.${p.n}.text`)}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
