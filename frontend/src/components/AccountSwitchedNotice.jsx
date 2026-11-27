/* After another tab logged in as someone else (or logged out), this tab reloads itself
   (AuthContext, storage event) and shows this short notice once, so nobody keeps acting as the old
   account by mistake. Auto-hides after a few seconds; announced politely to screen readers. */
import { useEffect, useState } from 'react';
import { SWITCH_FLAG, useAuth } from '../auth/AuthContext';
import { t } from '../i18n/useT';

function takeFlag() {
  try {
    const v = sessionStorage.getItem(SWITCH_FLAG);
    sessionStorage.removeItem(SWITCH_FLAG);
    return v === '1';
  } catch {
    return false;
  }
}

export default function AccountSwitchedNotice() {
  const { user, ready } = useAuth();
  const [show, setShow] = useState(takeFlag);
  useEffect(() => {
    if (!show) return undefined;
    const id = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(id);
  }, [show]);
  if (!show || !ready) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-50 mx-auto max-w-md rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[1.25rem] font-bold text-ink shadow-lift"
      style={{ marginTop: 'env(safe-area-inset-top)' }}
    >
      {user ? t('auth.switched', { name: user.name }) : t('auth.switched_out')}
      <button
        type="button"
        onClick={() => setShow(false)}
        className="ms-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-line bg-bg align-middle text-[1.25rem]"
        aria-label={t('common.close')}
      >
        ✕
      </button>
    </div>
  );
}
