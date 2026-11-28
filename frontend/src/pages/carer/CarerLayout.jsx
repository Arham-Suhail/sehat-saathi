import { MotionConfig, motion } from 'motion/react';
import { Outlet, useLocation } from 'react-router-dom';
import AppTabBar from '../../components/AppTabBar';

/* Wraps family / doctor screens: page fade-in and, in app mode, the bottom tab bar. */
export default function CarerLayout() {
  const { pathname } = useLocation();
  return (
    <>
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
    </>
  );
}
