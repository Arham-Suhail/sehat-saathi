/* Bento grid of four features, revealed once on scroll. Solid surface cards (not glass) for calm,
   readable text; each card has a small decorative CSS mini-visual (aria-hidden). Body font only.
   Hover lift is decoration only (no hover-only UI). */
import { motion } from 'motion/react';
import Icon from './icons';
import SectionHeading from './SectionHeading';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

function ScanVisual() {
  return (
    <div className="relative mx-auto h-28 w-24 rounded-xl border border-line bg-bg p-3">
      {[90, 70, 80, 55].map((w, i) => (
        <span key={i} className="mb-2 block h-2 rounded-full bg-line" style={{ width: `${w}%` }} />
      ))}
      <span className="absolute inset-x-1 top-1/2 h-[3px] rounded-full bg-accent opacity-70" />
      {['left-0 top-0 border-l-4 border-t-4 rounded-tl-lg', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-lg', 'left-0 bottom-0 border-b-4 border-l-4 rounded-bl-lg', 'right-0 bottom-0 border-b-4 border-r-4 rounded-br-lg'].map((c) => (
        <span key={c} className={`absolute -m-1.5 h-5 w-5 border-accent ${c}`} />
      ))}
    </div>
  );
}

function AlarmVisual() {
  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
      <span className="absolute inset-0 rounded-full border-2 border-gold-soft" />
      <span className="absolute inset-3 rounded-full border-2 border-gold" />
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink">
        <Icon name="bell" size={28} />
      </span>
    </div>
  );
}

function ChatVisual() {
  return (
    <div className="mx-auto flex w-full max-w-[14rem] flex-col gap-2">
      <span className="h-8 w-4/5 self-start rounded-2xl rounded-bl-md bg-accent-soft" />
      <span className="h-8 w-3/5 self-end rounded-2xl rounded-br-md bg-gold-soft" />
      <span className="h-8 w-2/3 self-start rounded-2xl rounded-bl-md bg-accent-soft" />
    </div>
  );
}

function FamilyVisual() {
  return (
    <div className="mx-auto flex items-center">
      {['bg-accent text-accent-text', 'bg-gold text-ink', 'bg-accent-soft text-accent'].map((c, i) => (
        <span key={c} className={`-ml-3 inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-surface first:ml-0 ${c}`}>
          <Icon name={i === 1 ? 'heart' : 'family'} size={26} />
        </span>
      ))}
    </div>
  );
}

const FEATURES = [
  { key: 'scan', icon: 'camera', wide: true, tint: 'accent', Visual: ScanVisual },
  { key: 'alarm', icon: 'alarm', tint: 'gold', Visual: AlarmVisual },
  { key: 'chotu', icon: 'chat', tint: 'gold', Visual: ChatVisual },
  { key: 'family', icon: 'family', wide: true, tint: 'accent', Visual: FamilyVisual },
];

const TINT = { accent: 'bg-accent-soft text-accent', gold: 'bg-gold-soft text-gold-text' };

export default function BentoFeatures() {
  const { inView } = useReveal();
  return (
    <section aria-labelledby="features-title" className="mx-auto w-full max-w-6xl px-5 py-14">
      <SectionHeading id="features-title" eyebrow={t('landing.features.eyebrow')} title={t('landing.features.title')} />
      <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-3">
        {FEATURES.map(({ key, icon, wide, tint, Visual }, i) => (
          <motion.li
            key={key}
            {...inView(i * 0.08)}
            className={`flex flex-col gap-6 rounded-3xl border border-line bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift ${
              wide ? 'sm:col-span-2 sm:flex-row sm:items-center' : ''
            }`}
          >
            <div className="flex-1">
              <span className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${TINT[tint]}`}>
                <Icon name={icon} size={30} />
              </span>
              <h3 className="m-0 mb-2 text-[1.4rem] font-bold leading-snug text-ink [text-wrap:balance]">{t(`landing.f.${key}.title`)}</h3>
              <p className="m-0 text-[1.25rem] leading-relaxed text-muted [text-wrap:pretty]">{t(`landing.f.${key}.text`)}</p>
            </div>
            <div aria-hidden="true" className={`flex items-center justify-center rounded-2xl bg-surface-alt p-5 ${wide ? 'sm:w-56 sm:shrink-0' : ''}`}>
              <Visual />
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
