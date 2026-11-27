/* Language state for the whole app. Changing it updates <html lang/dir> and remounts the subtree
   (key={lang}) so every t() call re-reads the new dictionary. LangToggle is the switch button. */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { applyLang, getLang } from './useT';

const LangContext = createContext({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(getLang);
  useLayoutEffect(() => {
    applyLang(lang);
  }, [lang]);
  const setLang = useCallback((l) => {
    applyLang(l);
    setLangState(l);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return (
    <LangContext.Provider value={value}>
      <div key={lang} className="contents">
        {children}
      </div>
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

/** Shows the OTHER language's name in its own script, e.g. "English" while Urdu is on. */
export function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang();
  const next = lang === 'ur' ? 'en' : 'ur';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      lang={next}
      aria-label={next === 'en' ? 'Switch to English' : 'اردو میں دیکھیں'}
      className={`inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-4 text-[1.25rem] font-bold text-accent shadow-soft transition-transform duration-150 active:scale-[0.96] ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5z" />
      </svg>
      {next === 'en' ? 'English' : 'اردو'}
    </button>
  );
}
