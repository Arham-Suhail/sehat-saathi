import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from '../api/client';
import { isNative } from '../lib/native';
import { cancelAlarm, snoozeAlarm } from '../lib/nativeAlarms';
import { TAB_ROOTS } from './AppTabBar';

/* Android app only (renders nothing):
   - hardware Back: deeper screen -> back one step; another tab -> Home tab; Home / start screen ->
     minimise the app (like native apps) instead of closing it or leaving a blank page;
   - dose alarm buttons: "Taken" marks the dose taken (no need to open anything), "10 min" snoozes,
     tapping the alarm itself opens Today's medicines. */
export default function NativeBridge() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    if (!isNative()) return undefined;
    const subs = [];
    let alive = true;
    (async () => {
      const back = await App.addListener('backButton', ({ canGoBack }) => {
        const p = path.current.replace(/\/$/, '') || '/';
        const home = p.startsWith('/carer') ? '/carer' : '/elder';
        // Like native apps: Back on another tab goes to the Home tab; Back on Home (or the start
        // screen) minimises the app; on deeper screens it goes back one step.
        if (p === '/' || p === home) App.minimizeApp();
        else if (TAB_ROOTS.includes(p)) nav(home, { replace: true });
        else if (canGoBack) nav(-1);
        else nav(home, { replace: true });
      });
      const action = await LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
        const extra = notification?.extra || {};
        if (actionId === 'taken' && extra.reminderId) {
          try {
            await api(`/reminders/${encodeURIComponent(extra.reminderId)}/taken`, { method: 'POST' });
            cancelAlarm(extra.reminderId);
          } catch {
            /* offline or too early: the dose stays pending and shows in the app */
          }
          nav('/elder/reminders');
        } else if (actionId === 'snooze') {
          snoozeAlarm(extra).catch(() => {});
        } else {
          nav('/elder/reminders');
        }
      });
      if (alive) subs.push(back, action);
      else [back, action].forEach((s) => s.remove());
    })().catch(() => {});
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
    };
  }, [nav]);

  return null;
}
