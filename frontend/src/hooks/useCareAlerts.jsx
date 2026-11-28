/* Family / doctor: open care alerts (GET /alerts), shared by the tab badge, Home and the Alerts tab.
   Re-loaded every 30 s while the app is visible and whenever it comes back to the front. In the
   Android app each open alert is turned into repeating native notifications (until read). */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { readCache, writeCache } from '../lib/cache';
import { cancelCareAlarms, syncCareAlarms } from '../lib/nativeAlarms';

const Ctx = createContext({ alerts: null, open: 0, reload: () => {}, markRead: async () => {} });
const POLL_MS = 30_000;

export function CareAlertsProvider({ children }) {
  const [alerts, setAlerts] = useState(() => readCache('alerts', null));
  const [error, setError] = useState(null);
  const meetings = useRef([]);

  const reload = useCallback(async () => {
    try {
      const list = await api('/alerts?include_done=true');
      setAlerts(list);
      writeCache('alerts', list);
      setError(null);
      syncCareAlarms(list, meetings.current).catch(() => {});
      return list;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let timer;
    let stopped = false;
    api('/meetings')
      .then((m) => {
        meetings.current = m;
      })
      .catch(() => {})
      .finally(() => {
        const tick = async () => {
          if (document.visibilityState === 'visible') await reload();
          if (!stopped) timer = setTimeout(tick, POLL_MS);
        };
        tick();
      });
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const markRead = useCallback(
    async (id) => {
      await api(`/alerts/${encodeURIComponent(id)}/read`, { method: 'POST' });
      cancelCareAlarms(id).catch(() => {});
      setAlerts((list) => (list || []).map((a) => (a.id === id ? { ...a, open: false } : a)));
      reload();
    },
    [reload],
  );

  const open = (alerts || []).filter((a) => a.open).length;
  return <Ctx.Provider value={{ alerts, open, error, reload, markRead }}>{children}</Ctx.Provider>;
}

export function useCareAlerts() {
  return useContext(Ctx);
}
