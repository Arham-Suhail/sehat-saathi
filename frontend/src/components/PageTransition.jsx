/* Route transitions, iOS-style: tab switches are a quick cross-fade (no slide); going deeper slides
   the new screen in from the inline end (right in English, left in Urdu / RTL). transform + opacity
   only, never delays data or dose actions; with reduced motion only the fade remains. Lazy screens
   show a skeleton (not a blank page) while their code loads. */
import { MotionConfig, motion } from 'motion/react';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TAB_ROOTS } from './AppTabBar';
import { fade, isRtl, push } from '../lib/motion';
import { PageSkeleton } from './ui';

export default function PageTransition() {
  const { pathname } = useLocation();
  const clean = pathname.replace(/\/$/, '') || '/';
  const tab = TAB_ROOTS.includes(clean);
  const d = isRtl() ? -28 : 28;
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={clean}
        initial={tab ? { opacity: 0 } : { opacity: 0, transform: `translateX(${d}px)` }}
        animate={tab ? { opacity: 1 } : { opacity: 1, transform: 'translateX(0px)' }}
        transition={tab ? fade : push}
      >
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </motion.div>
    </MotionConfig>
  );
}
