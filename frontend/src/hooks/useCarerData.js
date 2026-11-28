import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/* Family / doctor: every linked elder with their dashboard (last 14 days), loaded in parallel.
   Used by the app-mode carer home (summary cards) and the Alerts tab. */
export function useCarerOverview() {
  const [elders, setElders] = useState(null); // [{ id, name, dash|null }]
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const list = await api('/carer/elders');
      const withDash = await Promise.all(
        list.map(async (e) => {
          try {
            return { ...e, dash: await api(`/dashboard/${encodeURIComponent(e.id)}?days=14`, { timeoutMs: 60000 }) };
          } catch {
            return { ...e, dash: null };
          }
        }),
      );
      setElders(withDash);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { elders, error, reload: load };
}

/** Concern check-ins from all elders, newest first. */
export function concernsFrom(elders) {
  return (elders || [])
    .flatMap((e) => (e.dash?.checkins || []).filter((c) => c.concern_flag).map((c) => ({ ...c, elder: e })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
