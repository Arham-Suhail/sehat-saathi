/* "Kis ke liye hai?": the three roles. The elder card is highlighted (accent on accent-text, 7.9:1). */
import { motion } from 'motion/react';
import Icon from './icons';
import SectionHeading from './SectionHeading';
import { useReveal } from './motion';
import { t } from '../../i18n/useT';

const ROLES = [
  { key: 'elder', icon: 'elder', strong: true },
  { key: 'family', icon: 'family' },
  { key: 'doctor', icon: 'stethoscope' },
];

export default function RolesSection() {
  const { inView } = useReveal();
  return (
    <section aria-labelledby="roles-title" className="mx-auto w-full max-w-6xl px-5 py-14">
      <SectionHeading id="roles-title" eyebrow={t('landing.roles.eyebrow')} title={t('landing.roles.title')} />
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
        {ROLES.map((r, i) => (
          <motion.li
            key={r.key}
            {...inView(i * 0.08)}
            className={`rounded-3xl border p-6 ${r.strong ? 'border-accent bg-accent text-accent-text shadow-lift' : 'border-line bg-surface text-ink shadow-soft'}`}
          >
            <span
              className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${r.strong ? 'bg-surface text-accent' : 'bg-gold-soft text-gold-text'}`}
            >
              <Icon name={r.icon} size={30} />
            </span>
            <h3 className="m-0 mb-3 text-[1.5rem] font-bold leading-snug">{t(`landing.roles.${r.key}.title`)}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-start gap-2 text-[1.25rem] leading-snug">
                  <Icon name="check" size={22} className={`mt-1 shrink-0 ${r.strong ? '' : 'text-accent'}`} />
                  <span>{t(`landing.roles.${r.key}.${n}`)}</span>
                </li>
              ))}
            </ul>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
