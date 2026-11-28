import { useEffect, useState } from 'react';
import { t } from '../i18n/useT';
import { effectiveTheme, setTheme } from '../lib/theme';

/* Sun / moon button: switches light <-> dark and remembers it. 48px target, labelled for screen readers. */
export default function ThemeToggle({ className = '' }) {
  const [theme, setLocal] = useState(effectiveTheme);
  useEffect(() => {
    const on = () => setLocal(effectiveTheme());
    window.addEventListener('ss-theme', on);
    return () => window.removeEventListener('ss-theme', on);
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={t(next === 'dark' ? 'theme.to_dark' : 'theme.to_light')}
      title={t(next === 'dark' ? 'theme.to_dark' : 'theme.to_light')}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-accent shadow-soft transition-transform duration-150 active:scale-[0.94] ${className}`.trim()}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}
