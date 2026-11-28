import { MotionConfig, motion } from 'motion/react';
import { Outlet, useLocation } from 'react-router-dom';
import AppTabBar from '../../components/AppTabBar';
import { CareAlertsProvider, useCareAlerts } from '../../hooks/useCareAlerts';

function TabBar() {
  const { open } = useCareAlerts();
  return <AppTabBar badge={open} />;
}

/* Wraps family / doctor screens: care alerts (polled, native repeats), page fade-in and, in app
   mode, the bottom tab bar with the open-alerts badge. */
export default function CarerLayout() {
  const { pathname } = useLocation();
  return (
    <CareAlertsProvider>
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
      <TabBar />
    </CareAlertsProvider>
  );
}
