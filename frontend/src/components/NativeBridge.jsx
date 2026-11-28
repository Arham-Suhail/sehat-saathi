import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from '../api/client';
import { isNative } from '../lib/native';
import { cancelAlarm, cancelCareAlarms } from '../lib/nativeAlarms';
import { TAB_ROOTS } from './AppTabBar';

/* Android app only (renders nothing):
   - hardware Back: deeper screen -> back one step; another tab -> Home tab; Home / start screen ->
     minimise the app (like native apps) instead of closing it or leaving a blank page;
   - dose alarm buttons: "Taken" / "Not taken" mark the dose without opening anything; tapping the
     alarm itself opens Today's medicines;
   - care alerts (family / doctor): "Mark as read" stops the repeats; tapping opens Alerts. */
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
        if (extra.kind === 'care') {
          if (actionId === 'read' && extra.alertId) {
            try {
              await api(`/alerts/${encodeURIComponent(extra.alertId)}/read`, { method: 'POST' });
              cancelCareAlarms(extra.alertId);
            } catch {
              /* offline: it rings again and stays in Alerts */
            }
            return;
          }
          nav('/carer/alerts');
          return;
        }
        if (extra.kind === 'vitals') {
          nav('/elder/vitals');
          return;
        }
        if (extra.kind === 'test') {
          nav('/elder');
          return;
        }
        if (extra.kind === 'meeting') {
          nav(path.current.startsWith('/carer') ? '/carer/meetings' : '/elder/meetings');
          return;
        }
        if ((actionId === 'taken' || actionId === 'skipped') && extra.reminderId) {
          try {
            await api(`/reminders/${encodeURIComponent(extra.reminderId)}/${actionId}`, { method: 'POST' });
            cancelAlarm(extra.reminderId);
          } catch {
            /* offline or too early: the dose stays pending and shows in the app */
          }
          if (actionId === 'taken') nav('/elder/reminders');
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
