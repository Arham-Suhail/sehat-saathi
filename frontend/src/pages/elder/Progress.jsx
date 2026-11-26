/* "Meri kamyabiyan": the elder's streak, 30-day adherence ring and badges (earned ones pop in,
   locked ones say how to earn them). Data: own dashboard via useProgress (lib/streaks.js). */
import { MotionConfig, motion } from 'motion/react';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import { TopBar } from '../../components/ui';
import { useProgress } from '../../hooks/useElderData';
import { t } from '../../i18n/useT';

function Ring({ pct }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const val = pct ?? 0;
  return (
    <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true" className="-rotate-90">
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" style={{ stroke: 'var(--border)' }} />
      <motion.circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        style={{ stroke: 'var(--accent)' }}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - val / 100) }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
    </svg>
  );
}

export default function Progress() {
  const { user } = useAuth();
  const p = useProgress(user.id);

  return (
    <MotionConfig reducedMotion="user">
      <main className="page stack">
        <TopBar back="/elder" title={t('progress.title')} />
        <h1>{t('progress.title')}</h1>
        {!p ? (
          <p className="muted">{t('common.loading')}</p>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-4 rounded-3xl bg-gold-soft p-5">
                <motion.span
                  className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gold text-ink"
                  initial={{ scale: 0.6, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 12 }}
                >
                  <Icon name="flame" size={34} />
                </motion.span>
                <p className="m-0 text-ink">
                  <span className="block text-[2.6rem] font-bold leading-none [font-variant-numeric:tabular-nums]">{p.streak}</span>
                  <span className="text-[1.25rem] font-bold">{t('progress.streak')}</span>
                </p>
              </div>
              <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5">
                <div className="relative shrink-0">
                  <Ring pct={p.pct} />
                  <span className="absolute inset-0 flex items-center justify-center text-[1.6rem] font-bold [font-variant-numeric:tabular-nums]">
                    {p.pct === null ? '—' : `${p.pct}%`}
                  </span>
                </div>
                <p className="m-0 text-[1.25rem] font-bold leading-snug">{t('progress.pct')}</p>
              </div>
            </section>

            <h2>{t('progress.badges')}</h2>
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
              {p.badges.map((b, i) => (
                <motion.li
                  key={b.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
                  className={`flex flex-col items-center gap-2 rounded-3xl border p-4 text-center ${b.earned ? 'border-gold bg-surface shadow-soft' : 'border-line bg-surface-alt'}`}
                >
                  <span
                    className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${b.earned ? 'bg-gold text-ink shadow-lift' : 'bg-line text-muted'}`}
                  >
                    <Icon name={b.earned ? b.icon : 'lock'} size={30} />
                  </span>
                  <span className="text-[1.25rem] font-bold leading-snug text-ink">{t(`badge.${b.id}.title`)}</span>
                  <span className="text-[1.25rem] leading-snug text-muted">{t(`badge.${b.id}.how`)}</span>
                  <span className={`text-[1.25rem] font-bold ${b.earned ? 'text-success' : 'text-muted'}`}>
                    {b.earned ? t('progress.earned') : t('progress.locked')}
                  </span>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </main>
    </MotionConfig>
  );
}
