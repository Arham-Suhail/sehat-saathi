/* Inspired by Aceternity "Text Generate Effect": letters rise in one by one. Screen readers get the
   plain word once (visually-hidden); the animated letters are aria-hidden.
   Gradient: each letter paints its own slice of one word-wide gradient (background-size n×100%,
   position by index), so separately animated letters never show seams. Colours from theme.css. */
import { motion, useReducedMotion } from 'motion/react';

const GRADIENT = 'linear-gradient(90deg, var(--accent) 0%, var(--accent) 45%, var(--gold-text) 100%)';

export default function RevealText({ text, className = '', delay = 0 }) {
  const reduce = useReducedMotion();
  const letters = [...text];
  const n = letters.length;
  return (
    <span className={className}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            style={{
              backgroundImage: GRADIENT,
              backgroundSize: `${n * 100}% 100%`,
              backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
            initial={reduce ? false : { opacity: 0, y: '0.35em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </span>
    </span>
  );
}
