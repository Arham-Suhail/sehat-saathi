/* In-app reminder engine (Stage A).
   Polls /reminders/upcoming every 60s while the app is open, raises an in-app alert and a
   browser notification when a dose is due. Nothing runs when the tab is closed (documented). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { st } from '../i18n/server';
import { readCache, writeCache } from '../lib/cache';
import { chime, hapticSuccess, hapticWarning, isNative } from '../lib/native';
import { cancelAlarm, syncAlarms } from '../lib/nativeAlarms';

const POLL_MS = 60_000;
const DUE_WINDOW_MS = 60 * 60_000; // alert up to 60 min after the scheduled time
const SNOOZE_MS = 10 * 60_000;

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function registerServiceWorker() {
  // Android app: native alarms replace the service worker (Web Push isn't available in a WebView).
  if (isNative() || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

async function showNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag: 'sehat-saathi-dose', renotify: true, requireInteraction: true, icon: '/icons/icon-192.png' };
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* some mobile browsers only allow SW notifications; ignore failures */
  }
}

export function useReminderEngine({ enabled }) {
  // Last-known doses draw instantly; the server list replaces them a moment later.
  const [reminders, setReminders] = useState(() => readCache('reminders', []));
  const [due, setDue] = useState(null);
  const [error, setError] = useState(null);
  const [actError, setActError] = useState(null);
  const alerted = useRef(new Set());
  const snoozed = useRef(new Map());

  const refresh = useCallback(async () => {
    try {
      // Android app: fetch a week so native alarms are scheduled ahead (they ring even if the app
      // isn't opened for days); the screens still show the usual window (up to 24h ahead).
      const native = isNative();
      const full = await api(native ? '/reminders/upcoming?ahead_hours=168' : '/reminders/upcoming');
      if (native) syncAlarms(full).catch(() => {});
      const horizon = Date.now() + 24 * 3_600_000;
      const data = native ? full.filter((r) => new Date(r.scheduled_at).getTime() <= horizon) : full;
      setReminders(data);
      writeCache('reminders', data);
      setError(null);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  const check = useCallback((list) => {
    const now = Date.now();
    const next = list.find((r) => {
      if (r.status !== 'pending') return false;
      const at = new Date(r.scheduled_at).getTime();
      const snoozeUntil = snoozed.current.get(r.id) || 0;
      return at <= now && now - at < DUE_WINDOW_MS && now >= snoozeUntil;
    });
    if (next && !alerted.current.has(`${next.id}:${snoozed.current.get(next.id) || 0}`)) {
      alerted.current.add(`${next.id}:${snoozed.current.get(next.id) || 0}`);
      setDue(next);
      showNotification(t('rem.alert.title'), `${st(next.medicine_name)}${next.dose ? ' — ' + next.dose : ''}`);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === 'visible' || !document.hidden) {
        const list = await refresh();
        if (list && !stopped) check(list);
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    const onVisible = () => document.visibilityState === 'visible' && refresh().then((l) => l && check(l));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh, check]);

  // Optimistic: the screen (and a success haptic + chime) answers the tap at once; the request runs
  // behind it with one retry. If it finally fails the dose goes back to pending and the error shows.
  // The server stays the source of truth (the list refreshes after it answers).
  const act = useCallback(
    async (id, action) => {
      let before;
      setReminders((list) =>
        list.map((r) => {
          if (r.id !== id) return r;
          before = r;
          return { ...r, status: action, acted_at: new Date().toISOString() };
        }),
      );
      setDue((d) => (d && d.id === id ? null : d));
      if (action === 'taken') {
        hapticSuccess();
        chime();
      }
      cancelAlarm(id).catch(() => {});
      const send = () => api(`/reminders/${id}/${action}`, { method: 'POST' });
      try {
        let updated;
        try {
          updated = await send();
        } catch (e) {
          if (e?.status && e.status < 500) throw e;
          await new Promise((r) => setTimeout(r, 1500));
          updated = await send();
        }
        setReminders((list) => {
          const next = list.map((r) => (r.id === id ? updated : r));
          writeCache('reminders', next);
          return next;
        });
        return updated;
      } catch (e) {
        hapticWarning();
        setActError(t('dose.save_failed'));
        setTimeout(() => setActError(null), 6000);
        if (before) setReminders((list) => list.map((r) => (r.id === id ? before : r)));
        refresh().then((l) => l && isNative() && syncAlarms(l).catch(() => {}));
        throw e;
      }
    },
    [refresh],
  );

  const snooze = useCallback((id) => {
    snoozed.current.set(id, Date.now() + SNOOZE_MS);
    setDue(null);
  }, []);

  return { reminders, due, error, actError, refresh, act, snooze };
}
