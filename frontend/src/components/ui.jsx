/* Small reusable building blocks. Stage B restyles these via CSS only. */
import { Link, useLocation } from 'react-router-dom';
import CallChotuButton from './CallChotuButton';
import { TAB_ROOTS } from './AppTabBar';
import { isAppMode } from '../lib/appMode';
import { LangToggle } from '../i18n/LangProvider';
import { getLang, t } from '../i18n/useT';

export function BigButton({ variant = 'primary', block = true, small = false, to, className = '', ...props }) {
  const cls = `btn btn--${variant}${block ? ' btn--block' : ''}${small ? ' btn--small' : ''} ${className}`.trim();
  if (to) return <Link to={to} className={cls} {...props} />;
  return <button type="button" className={cls} {...props} />;
}

export function Disclaimer({ text }) {
  return (
    <p className="disclaimer" role="note">
      {text || t('disclaimer.medical')}
    </p>
  );
}

export function PharmacistBanner() {
  return (
    <div className="notice notice--warning" role="alert">
      <strong>⚠ {t('pharmacist.title')}</strong>
      {t('pharmacist.body')}
    </div>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <div className="notice notice--danger" role="alert">
      {children}
    </div>
  );
}

export function Notice({ kind = 'info', children }) {
  return (
    <div className={`notice notice--${kind}`} role="status">
      {children}
    </div>
  );
}

export function BottomBar({ children }) {
  return (
    <div className="bottom-bar">
      <div className="bottom-bar__inner">{children}</div>
    </div>
  );
}

export function TopBar({ title, back: backTo, right }) {
  // Every elder screen gets the live-call button next to the language switch.
  const { pathname } = useLocation();
  const elder = pathname.startsWith('/elder');
  // App mode: the four tab screens are top level (the tab bar is the navigation), so no Back button.
  const back = isAppMode() && TAB_ROOTS.includes(pathname.replace(/\/$/, '')) ? null : backTo;
  return (
    <header className="topbar">
      {back ? (
        <BigButton variant="secondary" block={false} small to={back}>
          {getLang() === 'ur' ? '→' : '←'} {t('common.back')}
        </BigButton>
      ) : (
        <span className="topbar__title">{t('app.name')}</span>
      )}
      {title && back ? <span className="topbar__title">{title}</span> : null}
      {right || (
        <span className="flex shrink-0 items-center gap-2">
          {elder ? <CallChotuButton /> : null}
          <LangToggle />
        </span>
      )}
    </header>
  );
}

export function Field({ id, label, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

// Times and dates follow the UI language: ur-PK writes "6:46 صبح" and Urdu month/day names, so a
// time never flips into "am 6:46" inside right-to-left text. Always Asia/Karachi.
const locale = () => (getLang() === 'ur' ? 'ur-PK' : 'en-PK');
// Some browsers still print AM/PM for ur-PK: use the Urdu words (صبح = am, شام = pm).
const urduPeriod = (s) => (getLang() === 'ur' ? s.replace(/\bAM\b/, 'صبح').replace(/\bPM\b/, 'شام') : s);
export const fmtTime = (iso) =>
  urduPeriod(
    new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }).format(new Date(iso)),
  );
export const fmtDay = (iso) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }).format(new Date(iso));
export function fmtHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return urduPeriod(new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(d));
}

/** Shimmering placeholder blocks (never a blank screen or a bare spinner). */
export function Skeleton({ className = '', style }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

export function SkeletonList({ rows = 3, height = 84 }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={{ height }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="page flex flex-col gap-4" role="status" aria-label={t('common.loading')}>
      <Skeleton style={{ height: 40, width: '60%' }} />
      <Skeleton style={{ height: 180 }} />
      <SkeletonList rows={3} />
    </main>
  );
}

/** Small toast at the bottom (aria-live), e.g. "Could not save, try again". */
export function Toast({ text, tone = 'danger' }) {
  if (!text) return null;
  return (
    <div role="status" aria-live="polite" className={`ss-toast ss-toast--${tone}`}>
      {text}
    </div>
  );
}
