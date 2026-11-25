import { createContext, useContext, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import ReminderAlert from '../../components/ReminderAlert';
import { registerServiceWorker, useReminderEngine } from '../../hooks/useReminderEngine';

const ReminderContext = createContext(null);

export function useReminders() {
  return useContext(ReminderContext);
}

/** Wraps every elder screen so reminder alerts fire whichever screen is open. */
export default function ElderLayout() {
  const engine = useReminderEngine({ enabled: true });

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <ReminderContext.Provider value={engine}>
      <Outlet />
      <ReminderAlert
        reminder={engine.due}
        onTaken={(id) => engine.act(id, 'taken')}
        onSkip={(id) => engine.act(id, 'skipped')}
        onSnooze={engine.snooze}
      />
    </ReminderContext.Provider>
  );
}
