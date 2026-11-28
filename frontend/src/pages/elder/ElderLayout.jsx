import { createContext, useContext, useEffect } from 'react';
import { api } from '../../api/client';
import AppTabBar from '../../components/AppTabBar';
import PageTransition from '../../components/PageTransition';
import FallCheck from '../../hooks/useFallCheck';
import { Toast } from '../../components/ui';
import ReminderAlert from '../../components/ReminderAlert';
import { registerServiceWorker, useReminderEngine } from '../../hooks/useReminderEngine';
import { syncMeetingAlarms } from '../../lib/nativeAlarms';

const ReminderContext = createContext(null);

export function useReminders() {
  return useContext(ReminderContext);
}

/** Wraps every elder screen so reminder alerts fire whichever screen is open.
    Each screen fades/slides in on navigation (opacity/transform only; off with reduced motion). */
export default function ElderLayout() {
  const engine = useReminderEngine({ enabled: true });

  useEffect(() => {
    registerServiceWorker();
    // Android app: a reminder 15 minutes before each meeting.
    api('/meetings')
      .then((m) => syncMeetingAlarms(m))
      .catch(() => {});
  }, []);

  return (
    <ReminderContext.Provider value={engine}>
      <PageTransition />
      <Toast text={engine.actError} />
      <FallCheck />
      <AppTabBar />
      <ReminderAlert reminder={engine.due} onAct={(id, action) => engine.act(id, action)} onClose={() => engine.due && engine.snooze(engine.due.id)} />
    </ReminderContext.Provider>
  );
}
