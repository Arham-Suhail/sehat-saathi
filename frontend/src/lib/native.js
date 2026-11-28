/* Native Android shell (Capacitor). The whole React app is bundled inside the APK; these helpers turn
   on the native pieces: status bar colours that follow light/dark, haptics, and a check for "are we
   running inside the Android app". Everything is a no-op on the website. */
import { Capacitor } from '@capacitor/core';
import { effectiveTheme } from './theme';

export const isNative = () => Capacitor.isNativePlatform();

export function haptic() {
  if (!isNative()) {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not supported */
    }
    return;
  }
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

/** Status bar colours follow the app theme (dark text on cream, light text on dark). */
export async function setupNativeChrome() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const apply = async () => {
      const dark = effectiveTheme() === 'dark';
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: dark ? '#111514' : '#FBF6EC' }).catch(() => {});
    };
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await apply();
    window.addEventListener('ss-theme', () => apply().catch(() => {}));
  } catch {
    /* plugin missing: keep the default bar */
  }
}
