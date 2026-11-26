/* One reveal style for every landing section (transform/opacity only).
   Reduced motion: no props at all, so everything renders static and fully visible. */
import { useReducedMotion } from 'motion/react';

export const EASE = [0.22, 1, 0.36, 1];

export function useReveal() {
  const reduce = useReducedMotion();
  return {
    /** Entrance on page load (hero). */
    fadeUp: (delay = 0) =>
      reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: EASE } },
    /** Entrance once when scrolled into view (sections below the fold). */
    inView: (delay = 0) =>
      reduce
        ? {}
        : {
            initial: { opacity: 0, y: 24 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-60px' },
            transition: { duration: 0.55, delay, ease: EASE },
          },
  };
}
