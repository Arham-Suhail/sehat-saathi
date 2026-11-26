/* "Ek din Chotu ke saath": a day timeline that reuses the carer dashboard's .timeline look,
   so the landing previews the real app. Chotu sits beside it as decoration. */
import { motion } from 'motion/react';
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';
import Icon from './icons';
import SectionHeading from './SectionHeading';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

const ITEMS = [
  { n: 1, icon: 'bell' },
  { n: 2, icon: 'chat' },
  { n: 3, icon: 'heart' },
  { n: 4, icon: 'family' },
];

export default function DayWithChotu() {
  const { inView } = useReveal();
  return (
    <section aria-labelledby="day-title" className="mx-auto grid w-full max-w-6xl items-start gap-10 px-5 py-14 md:grid-cols-[0.85fr_1.15fr]">
      <div className="md:sticky md:top-28">
        <SectionHeading id="day-title" align="start" eyebrow={t('landing.day.eyebrow')} title={t('landing.day.title')}>
          <p className="m-0 mt-2 max-w-md text-[1.25rem] leading-relaxed text-muted [text-wrap:pretty]">{t('landing.day.text')}</p>
        </SectionHeading>
        <div aria-hidden="true" className="mx-auto hidden w-fit animate-float md:block">
          <ChotuBoundary>
            <ChotuAgent state="listening" size={150} />
          </ChotuBoundary>
        </div>
      </div>

      <ol className="timeline">
        {ITEMS.map((it, i) => (
          <motion.li key={it.n} {...inView(i * 0.08)} className="timeline__item">
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon name={it.icon} size={24} />
                </span>
                <span className="rounded-full bg-gold-soft px-3 py-1 text-[1.1rem] font-bold text-gold-text [font-variant-numeric:tabular-nums]">
                  {t(`landing.day.${it.n}.time`)}
                </span>
              </div>
              <h3 className="m-0 mb-1 text-[1.35rem] font-bold leading-snug text-ink">{t(`landing.day.${it.n}.title`)}</h3>
              <p className="m-0 text-[1.25rem] leading-relaxed text-muted [text-wrap:pretty]">{t(`landing.day.${it.n}.text`)}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
