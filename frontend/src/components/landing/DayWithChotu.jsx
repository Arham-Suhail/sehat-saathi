/* "Ek din Chotu ke saath": a day timeline whose line draws itself as you scroll. Each step lights up
   (dot fills, border turns accent) once it reaches the middle of the screen and stays lit; cards also
   lift on hover/tap.
   Reduced motion: line shown full, every step shown lit, no movement. */
import { motion, useInView, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { useRef } from 'react';
import Icon from '../Icon';
import SectionHeading from './SectionHeading';
import { t } from '../../i18n/useT';

const ITEMS = [
  { n: 1, icon: 'bell' },
  { n: 2, icon: 'chat' },
  { n: 3, icon: 'heart' },
  { n: 4, icon: 'family' },
];

function Step({ n, icon, reduce }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -45% 0px' });
  const on = reduce || seen;
  return (
    <li ref={ref} className="relative ps-14">
      <span
        aria-hidden="true"
        className={`absolute start-[0.45rem] top-6 h-7 w-7 rounded-full border-4 transition-[transform,background-color,border-color] duration-300 ${
          on ? 'scale-110 border-accent-soft bg-accent' : 'border-line bg-surface'
        }`}
      />
      <motion.div
        whileHover={reduce ? undefined : { y: -4 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        className={`rounded-3xl border bg-surface p-5 transition-[box-shadow,border-color] duration-300 ${
          on ? 'border-accent shadow-lift' : 'border-line shadow-soft'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-300 ${on ? 'bg-accent text-accent-text' : 'bg-accent-soft text-accent'}`}>
            <Icon name={icon} size={24} />
          </span>
          <span className="rounded-full bg-gold-soft px-3 py-1 text-[1.1rem] font-bold text-gold-text [font-variant-numeric:tabular-nums]">
            {t(`landing.day.${n}.time`)}
          </span>
        </div>
        <h3 className="m-0 mt-3 text-[1.35rem] font-bold leading-snug text-ink">{t(`landing.day.${n}.title`)}</h3>
      </motion.div>
    </li>
  );
}

export default function DayWithChotu() {
  const reduce = useReducedMotion();
  const listRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 65%', 'end 50%'] });
  const draw = useSpring(scrollYProgress, { stiffness: 120, damping: 25 });

  return (
    <section aria-labelledby="day-title" data-chotu="thinking" className="mx-auto w-full max-w-3xl px-5 py-16">
      <SectionHeading id="day-title" eyebrow={t('landing.day.eyebrow')} title={t('landing.day.title')} />
      <ol ref={listRef} className="relative m-0 flex list-none flex-col gap-6 p-0">
        <span aria-hidden="true" className="absolute bottom-6 start-[1.2rem] top-6 w-[3px] rounded-full bg-line" />
        <motion.span
          aria-hidden="true"
          className="absolute bottom-6 start-[1.2rem] top-6 w-[3px] origin-top rounded-full"
          style={{ scaleY: reduce ? 1 : draw, background: 'linear-gradient(var(--accent), var(--gold))' }}
        />
        {ITEMS.map((it) => (
          <Step key={it.n} {...it} reduce={reduce} />
        ))}
      </ol>
    </section>
  );
}
