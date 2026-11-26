/* Hero visual: a CSS-only "phone" showing what the elder actually sees (a dose reminder and a
   Chotu check-in), with Chotu floating beside it and a family notification card.
   Purely illustrative, so the whole thing is aria-hidden; theme.css colours only, no images. */
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';
import Icon from './icons';
import { t } from '../../i18n/useT';

export default function HeroShowcase() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative mx-auto select-none w-full max-w-[22rem] pt-14 pb-10 md:max-w-[24rem]">
      {/* glow behind the phone */}
      <div
        className="absolute inset-x-[-10%] top-[10%] bottom-[5%] -z-10 rounded-full"
        style={{ background: 'radial-gradient(closest-side, var(--glow-teal), transparent)' }}
      />

      {/* Chotu, peeking over the phone */}
      <div className="absolute -top-2 right-0 z-10 animate-float lg:-right-6">
        <span
          className="absolute inset-[12%] -z-10 rounded-full"
          style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
        />
        <ChotuBoundary>
          <ChotuAgent state="speaking" size={128} />
        </ChotuBoundary>
      </div>

      {/* phone */}
      <div className="relative rounded-[2.25rem] border border-line bg-surface p-3 shadow-lift">
        <div className="rounded-[1.75rem] bg-bg p-4">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-line" />
          <p className="m-0 mb-3 text-[1.05rem] font-bold text-muted">{t('landing.mock.day')}</p>

          {/* reminder card */}
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-text">
                <Icon name="bell" size={26} />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[1.6rem] font-bold leading-none text-ink [font-variant-numeric:tabular-nums]">
                  {t('landing.mock.time')}
                </p>
                <p className="m-0 mt-1 text-[1.05rem] text-muted">{t('landing.mock.sub')}</p>
              </div>
            </div>
            <p className="m-0 mt-3 text-[1.2rem] font-bold leading-snug text-ink">{t('landing.mock.title')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent text-[1.05rem] font-bold text-accent-text">
                <Icon name="check" size={20} />
                {t('landing.mock.taken')}
              </span>
              <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface text-[1.05rem] font-bold text-ink">
                {t('landing.mock.later')}
              </span>
            </div>
          </div>

          {/* check-in bubbles */}
          <div className="mt-4 flex flex-col gap-2">
            <p className="m-0 max-w-[85%] self-start rounded-2xl rounded-bl-md bg-accent-soft px-4 py-2.5 text-[1.05rem] leading-snug text-accent">
              {t('landing.mock.ask')}
            </p>
            <p className="m-0 max-w-[75%] self-end rounded-2xl rounded-br-md bg-gold-soft px-4 py-2.5 text-[1.05rem] leading-snug text-ink">
              {t('landing.mock.reply')}
            </p>
          </div>
        </div>
      </div>

      {/* family notification */}
      <div className="absolute -left-2 bottom-0 z-10 flex max-w-[16rem] animate-float-slow items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lift sm:-left-10">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold-text">
          <Icon name="family" size={22} />
        </span>
        <p className="m-0 text-[1rem] font-bold leading-snug text-ink">{t('landing.mock.family')}</p>
      </div>
    </div>
  );
}
