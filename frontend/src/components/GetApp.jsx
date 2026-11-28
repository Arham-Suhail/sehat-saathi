/* App-first website: the Android app is the main way to use Sehat Saathi (real alarms that ring
   with the screen off). The website stays fully usable for iPhone / laptop users, judges and doctors
   ("Use in the browser"), but the download is always the first thing offered.
   - <GetAppHero/>   landing hero / final CTA: Download for Android (+ QR code on big screens)
   - <AndroidAppBanner/>  thin strip for people who open the website on an Android phone */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n/useT';
import { isAppMode } from '../lib/appMode';
import { isNative } from '../lib/native';
import Icon from './Icon';

export const APK_URL = 'https://github.com/Arham-Suhail/sehat-saathi/releases/download/v3.1/SehatSaathi.apk';
const isAndroidWeb = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !isNative();

const AndroidLogo = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="currentColor">
    <path d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.1c-1.77 0-3.43.38-4.92 1.04L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
  </svg>
);

export function GetAppHero({ center = false }) {
  return (
    <div className={`flex w-full max-w-md flex-col gap-3 ${center ? 'items-center' : 'items-center md:items-start'}`}>
      <div className="flex w-full items-center gap-4">
        <a href={APK_URL} className="btn btn--primary btn--block shadow-lift no-underline" download>
          <span className="inline-flex items-center justify-center gap-2.5">
            <AndroidLogo />
            {t('getapp.download')}
          </span>
        </a>
        <img
          src="/qr-android.svg"
          width="96"
          height="96"
          alt={t('getapp.qr')}
          className="hidden h-24 w-24 shrink-0 rounded-2xl border border-line bg-white p-1 shadow-soft md:block"
        />
      </div>
      <p className="m-0 text-[1.05rem] text-muted">
        {t('getapp.note')} <span className="hidden md:inline">{t('getapp.scan')}</span>
      </p>
      <p className="m-0 text-[1.1rem]">
        {t('getapp.web')}{' '}
        <Link to="/login" className="font-bold">
          {t('getapp.web.login')}
        </Link>{' '}
        ·{' '}
        <Link to="/register" className="font-bold">
          {t('getapp.web.register')}
        </Link>
      </p>
    </div>
  );
}

/** Android phone + website (not the app): a small, dismissible "get the app" strip. */
export function AndroidAppBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem('ss_appbanner') || 0) > Date.now();
    } catch {
      return false;
    }
  });
  if (hidden || !isAndroidWeb() || isAppMode()) return null;
  const close = () => {
    try {
      localStorage.setItem('ss_appbanner', String(Date.now() + 7 * 86_400_000));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <div role="region" aria-label={t('getapp.banner')} className="flex items-center gap-3 bg-accent px-4 py-2.5 text-accent-text">
      <Icon name="bell" size={22} className="shrink-0" />
      <p className="m-0 min-w-0 flex-1 text-[1rem] font-semibold leading-snug">{t('getapp.banner')}</p>
      <a href={APK_URL} download className="shrink-0 rounded-full bg-surface px-4 py-2 text-[1rem] font-bold text-accent no-underline">
        {t('getapp.get')}
      </a>
      <button type="button" onClick={close} aria-label={t('getapp.close')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[1.3rem] text-accent-text">
        ✕
      </button>
    </div>
  );
}
