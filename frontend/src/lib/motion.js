/* One place for motion values (tune by feel on a real phone). Animate transform / opacity only.
   MotionConfig reducedMotion="user" turns these into instant / opacity-only changes. */
export const spring = {
  snappy: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 },
  gentle: { type: 'spring', stiffness: 300, damping: 30 },
  sheet: { type: 'spring', stiffness: 380, damping: 36 },
  press: { type: 'spring', stiffness: 500, damping: 30 },
};
export const fade = { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] };
export const push = { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] };

/** List entrance: only the first few items, once. */
export const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };
export const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } },
};

export const isRtl = () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
