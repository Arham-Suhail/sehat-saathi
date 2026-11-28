import { MotionConfig, motion } from 'motion/react';
import { createContext, useContext, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppTabBar from '../../components/AppTabBar';
import ReminderAlert from '../../components/ReminderAlert';
import { registerServiceWorker, useReminderEngine } from '../../hooks/useReminderEngine';

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
  }, []);

  return (
    <ReminderContext.Provider value={engine}>
      <MotionConfig reducedMotion="user">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </MotionConfig>
      <AppTabBar />
      <ReminderAlert
        reminder={engine.due}
        onTaken={(id) => engine.act(id, 'taken')}
        onSkip={(id) => engine.act(id, 'skipped')}
        onSnooze={engine.snooze}
      />
    </ReminderContext.Provider>
  );
}
