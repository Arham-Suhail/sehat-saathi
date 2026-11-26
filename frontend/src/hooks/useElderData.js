/* Data for the richer elder Home / Progress screens.
   - progress: streak + badges from the elder's own dashboard (GET /dashboard/{own id}?days=30)
   - contact: emergency contact (GET /emergency-contact)
   - water: device-only glass counter (lib/water.js), per user, resets each Karachi day
   Failures are soft: the Home screen still works with nothing loaded. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { karachiToday, progressFrom } from '../lib/streaks';
import { addGlass, karachiHour, readWater, shouldNudge } from '../lib/water';

export function useProgress(userId) {
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    api(`/dashboard/${encodeURIComponent(userId)}?days=30`)
      .then((d) => alive && setProgress(progressFrom(d, karachiToday())))
      .catch(() => alive && setProgress(progressFrom(null, karachiToday())));
    return () => {
      alive = false;
    };
  }, [userId]);
  return progress;
}

export function useEmergencyContact() {
  const [contact, setContact] = useState(undefined); // undefined = loading, null = none
  const reload = useCallback(() => {
    api('/emergency-contact')
      .then((c) => setContact(c || null))
      .catch(() => setContact(null));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { contact, setContact, reload };
}

export function useWater(userId) {
  const key = `ss.water.${userId}`;
  const [state, setState] = useState(() => readWater(localStorage.getItem(key), karachiToday()));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const change = (delta) => {
    setState((s) => {
      const fresh = s.date === karachiToday() ? s : readWater(null, karachiToday());
      const next = addGlass(fresh, delta, Date.now());
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or blocked: keep in memory */
      }
      return next;
    });
  };

  return { count: state.count, change, nudge: shouldNudge(state, now, karachiHour(new Date(now))) };
}
