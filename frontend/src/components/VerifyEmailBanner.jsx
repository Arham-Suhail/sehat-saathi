/* Soft email verification: a calm banner on the home screens until the email is verified.
   Hidden when email isn't configured on this deployment. Never blocks anything. */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmailEnabled } from '../hooks/useEmailConfig';
import { t } from '../i18n/useT';
import Icon from './Icon';

export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const enabled = useEmailEnabled();
  if (!enabled || !user || user.email_verified) return null;
  return (
    <Link
      to="/account/verify"
      className="flex min-h-12 items-center gap-3 rounded-2xl border border-warning-text bg-warning-bg px-4 py-3 text-warning-text no-underline"
    >
      <Icon name="mail" size={26} />
      <span className="flex-1 text-[1.25rem] font-bold leading-snug">{t('verify.banner')}</span>
      <Icon name="chevron" size={20} className="rtl:-scale-x-100" />
    </Link>
  );
}
