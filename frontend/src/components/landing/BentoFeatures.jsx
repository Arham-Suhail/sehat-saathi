/* Inspired by Aceternity "Bento Grid" + glass cards: four features, revealed once on scroll.
   Card text uses the body font (display fonts are for headings only). Icons are simple inline SVG
   strokes in currentColor, so they follow theme.css. Hover lift is decoration only (no hover-only UI). */
import { motion, useReducedMotion } from 'motion/react';
import { t } from '../../i18n/useT';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  camera: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" {...stroke}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  ),
  alarm: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.5V13l2.4 1.6M4.5 5.5 7 3.5M19.5 5.5 17 3.5" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" {...stroke}>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7.5L7 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" />
    </svg>
  ),
  family: (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" {...stroke}>
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="16.5" cy="9" r="2.2" />
      <path d="M3.5 19c.4-3.2 2.2-5 4.5-5s4.1 1.8 4.5 5M12.8 19c.3-2.6 1.7-4 3.7-4s3.4 1.4 3.7 4" />
    </svg>
  ),
};

const FEATURES = [
  { key: 'scan', icon: 'camera', wide: true },
  { key: 'alarm', icon: 'alarm' },
  { key: 'chotu', icon: 'chat' },
  { key: 'family', icon: 'family', wide: true },
];

export default function BentoFeatures() {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="features-title" className="mx-auto w-full max-w-5xl px-5 pb-14">
      <h2 id="features-title" className="mb-6 text-center font-serif text-[clamp(1.75rem,5vw,2.5rem)] font-semibold text-ink">
        {t('landing.features.title')}
      </h2>
      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.li
            key={f.key}
            className={`group relative overflow-hidden rounded-3xl border border-glass-border bg-glass p-6 shadow-soft backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift ${f.wide ? 'sm:col-span-2' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <span
              aria-hidden="true"
              className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-60"
              style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
            />
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              {ICONS[f.icon]}
            </span>
            <h3 className="m-0 mb-2 text-[1.3rem] font-bold leading-snug text-ink">{t(`landing.f.${f.key}.title`)}</h3>
            <p className="m-0 text-[1.08rem] leading-relaxed text-muted">{t(`landing.f.${f.key}.text`)}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
