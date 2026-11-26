/* Slim sticky top bar: wordmark + one quiet Login link (the primary action stays in the hero).
   Respects the notch via safe-area inset. */
import { Link } from 'react-router-dom';
import { t } from '../../i18n/useT';

export default function LandingNav() {
  return (
    <header
      className="sticky top-0 z-20 border-b border-glass-border bg-glass backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <nav aria-label={t('app.name')} className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2">
        <Link
          to="/"
          aria-label={t('landing.nav.home')}
          className="inline-flex min-h-12 items-center gap-2 text-[1.3rem] font-bold text-ink no-underline"
        >
          <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-text">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M12 20.5s-7.5-4.6-7.5-10.4A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" />
            </svg>
          </span>
          <span className="whitespace-nowrap max-[379px]:sr-only">{t('app.name')}</span>
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-12 items-center whitespace-nowrap rounded-full border border-line bg-surface px-5 text-[1.25rem] font-bold text-accent no-underline shadow-soft transition-[transform,box-shadow] duration-150 active:scale-[0.97]"
        >
          {t('common.login')}
        </Link>
      </nav>
    </header>
  );
}
