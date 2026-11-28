/* Native Android shell (Capacitor). The whole React app is bundled inside the APK; these helpers turn
   on the native pieces: status bar colours that follow light/dark, haptics, splash hand-over, and a
   check for "are we running inside the Android app". Everything is a no-op on the website. */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { effectiveTheme } from './theme';

export const isNative = () => Capacitor.isNativePlatform();

// Haptics: guarded, throttled (never in rapid loops), never throw. Website: a tiny vibration at most.
let last = 0;
const gate = () => {
  const n = performance.now();
  if (n - last < 60) return false;
  last = n;
  return true;
};
const webBuzz = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

export function hapticTap() {
  if (!gate()) return;
  if (!isNative()) return webBuzz(8);
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
export function hapticSelect() {
  if (!gate()) return;
  if (!isNative()) return webBuzz(5);
  Haptics.selectionChanged().catch(() => {});
}
export function hapticSuccess() {
  if (!isNative()) return webBuzz([10, 60, 18]);
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
export function hapticWarning() {
  if (!isNative()) return webBuzz([30, 50, 30]);
  Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
}
/** Old name, kept for existing callers. */
export const haptic = hapticTap;

/** A short soft two-note chime when a dose is marked Taken (Web Audio, no file). */
let audioCtx;
export function chime() {
  try {
    if (localStorage.getItem('ss_sound') === 'off') return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    [
      [659.25, 0],
      [987.77, 0.12],
    ].forEach(([f, d]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.45);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.5);
    });
  } catch {
    /* no audio */
  }
}

/** Hide the splash only after the first real frame (no white flash), with a fallback timer so a JS
    error before this point can never leave the app stuck on the splash. */
export function handOverSplash() {
  if (!isNative()) return;
  const hide = () => SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => {});
  const fallback = setTimeout(hide, 6000);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      hide();
    }),
  );
}

/** Status bar colours follow the app theme (dark text on cream, light text on dark). */
export async function setupNativeChrome() {
  if (!isNative()) return;
  try {
    const apply = async () => {
      const dark = effectiveTheme() === 'dark';
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: dark ? '#111514' : '#F3F2EE' }).catch(() => {});
    };
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await apply();
    window.addEventListener('ss-theme', () => apply().catch(() => {}));
  } catch {
    /* plugin missing: keep the default bar */
  }
}
