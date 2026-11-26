/* Web Push: dose alarms (elder) and concern alerts (family/doctor) even when the app is closed.
   Optional: if the server has no VAPID keys or the browser lacks the Push API, state is
   'disabled' / 'unsupported' and the screens fall back to in-app notifications. */
import { useCallback, useEffect, useState } from 'react';
import { API_URL, api, getToken } from '../api/client';
import { registerServiceWorker } from './useReminderEngine';

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIosNotInstalled() {
  if (typeof navigator === 'undefined') return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && !standalone;
}

function keyBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sendToServer(sub) {
  const j = sub.toJSON();
  await api('/push/subscribe', { method: 'POST', json: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } } });
}

/** Explicit logout: stop this browser's alerts so a shared phone doesn't get someone else's. */
export async function disablePushForLogout() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const token = getToken();
    if (token) {
      // Raw fetch on purpose: a 401 here must not trigger the app's logout handler again.
      await fetch(`${API_URL}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    await sub.unsubscribe();
  } catch {
    /* best effort: the server also drops subscriptions the push service reports as gone */
  }
}

export function usePush() {
  const [state, setState] = useState('loading'); // loading | unsupported | disabled | denied | off | on
  const [publicKey, setPublicKey] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported()) return alive && setState('unsupported');
      try {
        const cfg = await api('/push/config');
        if (!cfg.enabled) return alive && setState('disabled');
        if (alive) setPublicKey(cfg.public_key);
        if (Notification.permission === 'denied') return alive && setState('denied');
        const reg = await registerServiceWorker();
        const sub = await reg?.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') {
          await sendToServer(sub); // re-claim this browser for whoever is logged in now
          if (alive) setState('on');
        } else if (alive) setState('off');
      } catch {
        if (alive) setState('disabled');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState('denied');
      const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
      const opts = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
      let sub;
      try {
        sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe(opts));
      } catch {
        // e.g. the server's keys changed: drop the old subscription and try once more
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        sub = await reg.pushManager.subscribe(opts);
      }
      await sendToServer(sub);
      setState('on');
    } catch (e) {
      setError(e?.message || 'Alarm on nahi ho saka. Dobara koshish karein.');
    }
  }, [publicKey]);

  return { state, enable, error };
}
