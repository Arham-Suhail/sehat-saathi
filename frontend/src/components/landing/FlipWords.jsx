/* Inspired by Aceternity "Flip Words": the phrase changes every few seconds. Screen readers get the
   whole list once, so nothing is announced on a loop. Reduced motion: first phrase, no cycling.
   Stops after one pass and holds the first phrase again (WCAG 2.2.2: no endless motion). */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

export default function FlipWords({ words, interval = 2800, className = '' }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    let steps = 0;
    const id = setInterval(() => {
      steps += 1;
      setI(steps % words.length);
      if (steps >= words.length) clearInterval(id);
    }, interval);
    return () => clearInterval(id);
  }, [reduce, interval, words.length]);
  return (
    <span className={`relative inline-grid ${className}`}>
      <span className="visually-hidden">{words.join(', ')}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[i]}
          aria-hidden="true"
          className="inline-block"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
