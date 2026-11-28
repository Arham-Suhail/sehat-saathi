import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { readCache, writeCache } from '../lib/cache';

/* Family / doctor: every linked elder with their dashboard (last 14 days).
   Last-known cards draw at once (cache); the list of elders shows as soon as it arrives and each
   elder's numbers fill in when their dashboard answers (they no longer wait for each other). */
export function useCarerOverview() {
  const [elders, setElders] = useState(() => readCache('carer.overview', null)); // [{ id, name, dash|null }]
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const list = await api('/carer/elders');
      setElders((prev) => list.map((e) => ({ ...e, dash: prev?.find((p) => p.id === e.id)?.dash ?? null })));
      await Promise.all(
        list.map(async (e) => {
          try {
            const dash = await api(`/dashboard/${encodeURIComponent(e.id)}?days=14`, { timeoutMs: 60000 });
            setElders((cur) => {
              const next = (cur || []).map((x) => (x.id === e.id ? { ...x, dash } : x));
              writeCache('carer.overview', next);
              return next;
            });
          } catch {
            /* keep the last known numbers */
          }
        }),
      );
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
