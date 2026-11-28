import { MotionConfig, motion } from 'motion/react';
import { createContext, useContext, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AppTabBar from '../../components/AppTabBar';
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
  const { pathname } = useLocation();

  useEffect(() => {
    registerServiceWorker();
    // Android app: a reminder 15 minutes before each meeting.
    api('/meetings')
      .then((m) => syncMeetingAlarms(m))
      .catch(() => {});
  }, []);

  return (
    <ReminderContext.Provider value={engine}>
      <MotionConfig reducedMotion="user">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        >
          <Outlet />
        </motion.div>
      </MotionConfig>
      <AppTabBar />
      <ReminderAlert reminder={engine.due} onAct={(id, action) => engine.act(id, action)} onClose={() => engine.due && engine.snooze(engine.due.id)} />
    </ReminderContext.Provider>
  );
}
