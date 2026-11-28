import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { isNative } from '../lib/native';
import { cancelAlarm, snoozeAlarm } from '../lib/nativeAlarms';
import { TAB_ROOTS } from './AppTabBar';

/* Android app only (renders nothing):
   - hardware Back: goes back inside the app; on a tab screen / the start screen it minimises the app
     (like native apps) instead of closing it or leaving a blank page;
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
      const { App } = await import('@capacitor/app');
      const back = await App.addListener('backButton', ({ canGoBack }) => {
        const p = path.current.replace(/\/$/, '') || '/';
        if (p === '/' || TAB_ROOTS.includes(p)) App.minimizeApp();
        else if (canGoBack) nav(-1);
        else nav('/', { replace: true });
      });
      const { LocalNotifications } = await import('@capacitor/local-notifications');
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
