/* Round phone button shown on every elder screen after login. It opens the check-in with ?call=1,
   which starts the live voice call with Chotu (Vapi) straight away. If Vapi isn't configured on this
   deployment, the check-in screen says so and the elder can still speak (voice typing) or type,
   so the button never leads to a dead end. */
import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n/useT';
import Icon from './Icon';

// showLabel (Home): a visible "Voice call" text next to the icon, so the entry point is clear.
export default function CallChotuButton({ showLabel = false }) {
  const { pathname, search } = useLocation();
  const here = pathname === '/elder/checkin' && search.includes('call=1');
  return (
    <Link
      to="/elder/checkin?call=1"
      replace={here}
      aria-label={showLabel ? undefined : t('call.aria')}
      title={t('call.aria')}
      className={`relative inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-accent text-accent-text no-underline shadow-lift transition-transform duration-150 active:scale-[0.94] ${showLabel ? 'px-4' : 'w-12'}`}
    >
      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-accent opacity-25 motion-reduce:hidden" />
      <Icon name="phone" size={24} className="relative" />
      {showLabel ? <span className="relative text-[1.25rem] font-bold">{t('home.call.label')}</span> : null}
    </Link>
  );
}
