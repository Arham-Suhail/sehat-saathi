/* Is email (verification / forgot password) switched on for this deployment? GET /auth/email-config,
   asked once per page load. While unknown or on error: treated as off, so nothing half-works. */
import { useEffect, useState } from 'react';
import { api } from '../api/client';

let cached = null;

export function useEmailEnabled() {
  const [enabled, setEnabled] = useState(cached ?? false);
  useEffect(() => {
    if (cached !== null) return undefined;
    let alive = true;
    api('/auth/email-config', { auth: false })
      .then((c) => {
        cached = Boolean(c?.enabled);
        if (alive) setEnabled(cached);
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
