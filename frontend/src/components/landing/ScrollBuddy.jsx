/* A small Chotu that travels down the right edge as the page scrolls. It leans with scroll speed and
   changes pose per section: each section declares data-chotu="idle|listening|thinking|speaking|hide".
   Hidden where the big Chotu is on screen (hero, CTA).
   Phones: Chotu is fully on screen but only WHILE scrolling; about a second after scrolling stops he
   slides away, so he never sits on top of text being read (user choice, Nov 27). Tablets/laptops:
   always shown in the right margin. Decorative only (aria-hidden, no pointer events).
   Reduced motion: not rendered. */
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { useEffect, useState } from 'react';
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';

const PHONE = '(max-width: 767px)';
const HIDE_AFTER_MS = 1100;

export default function ScrollBuddy() {
  const reduce = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ['18vh', '68vh']);
  const velocity = useVelocity(scrollY);
  const lean = useSpring(useTransform(velocity, [-2500, 0, 2500], [-18, 0, 18]), { stiffness: 180, damping: 18 });
  const [pose, setPose] = useState('hide');
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches);
  const [scrolling, setScrolling] = useState(false);

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

  // Phone or not (follows rotation / window resizes).
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Scrolling right now? True on every scroll event, false a moment after the last one.
  useEffect(() => {
    if (reduce || !phone) return undefined;
    let timer = 0;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), HIDE_AFTER_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduce, phone]);

  if (reduce) return null;
  const show = pose !== 'hide' && (!phone || scrolling);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed right-0 top-0 z-10">
      <AnimatePresence>
        {show && (
          <motion.div
            key="buddy"
            style={{ y, rotate: lean }}
            initial={{ opacity: 0, x: 70 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 70 }}
            transition={{ duration: 0.3 }}
            className="-translate-x-2 md:-translate-x-4"
          >
            <ChotuBoundary>
              <ChotuAgent state={pose} size={phone ? 60 : 92} />
            </ChotuBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
