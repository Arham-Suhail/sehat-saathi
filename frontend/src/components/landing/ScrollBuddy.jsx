/* A small Chotu that travels down the right edge as the page scrolls. It leans with scroll speed and
   changes pose per section: each section declares data-chotu="idle|listening|thinking|speaking|hide".
   Hidden where the big Chotu is on screen (hero, CTA). On phones it peeks mostly off the edge so it
   stays clear of text. Decorative only (aria-hidden, no pointer events). Reduced motion: not rendered. */
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { useEffect, useState } from 'react';
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';

export default function ScrollBuddy() {
  const reduce = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ['18vh', '68vh']);
  const velocity = useVelocity(scrollY);
  const lean = useSpring(useTransform(velocity, [-2500, 0, 2500], [-18, 0, 18]), { stiffness: 180, damping: 18 });
  const [pose, setPose] = useState('hide');

  useEffect(() => {
    if (reduce) return undefined;
    const sections = [...document.querySelectorAll('[data-chotu]')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setPose(e.target.getAttribute('data-chotu') || 'idle');
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [reduce]);

  if (reduce) return null;
  const show = pose !== 'hide';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed right-0 top-0 z-10">
      <AnimatePresence>
        {show && (
          <motion.div
            key="buddy"
            style={{ y, rotate: lean }}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ duration: 0.35 }}
            className="translate-x-[55%] md:-translate-x-4"
          >
            <span className="block md:hidden">
              <ChotuBoundary>
                <ChotuAgent state={pose} size={64} />
              </ChotuBoundary>
            </span>
            <span className="hidden md:block">
              <ChotuBoundary>
                <ChotuAgent state={pose} size={92} />
              </ChotuBoundary>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
