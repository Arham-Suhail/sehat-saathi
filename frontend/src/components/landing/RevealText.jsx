/* Inspired by Aceternity "Text Generate Effect": letters rise in one by one. Screen readers get the
   plain word once (visually-hidden); the animated letters are aria-hidden.
   Gradient: each letter paints its own slice of one word-wide gradient (background-size n×100%,
   position by index), so separately animated letters never show seams. Colours from theme.css. */
import { motion, useReducedMotion } from 'motion/react';

const GRADIENT = 'linear-gradient(90deg, var(--accent) 0%, var(--accent) 45%, var(--gold-text) 100%)';

// Arabic/Urdu letters join to their neighbours: splitting them into spans would break the word.
const JOINED_SCRIPT = /[\u0600-\u06FF]/;

export default function RevealText({ text, className = '', delay = 0 }) {
  const reduce = useReducedMotion();
  if (JOINED_SCRIPT.test(text)) {
    return (
      <motion.span
        className={`inline-block ${className}`}
        // background-clip:text only paints inside the element's box, and Nastaliq marks (the dots and
        // small ط of ٹ) rise far above the line box, so they came out transparent. Pad the box to
        // cover them and pull the same space back with negative margins, so layout doesn't move.
        style={{
          backgroundImage: GRADIENT,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          padding: '0.6em 0.15em 0.35em',
          margin: '-0.15em -0.15em -0.35em', // less pull-up on top: room so ٹ doesn't touch the line above
        }}
        initial={reduce ? false : { opacity: 0, y: '0.2em' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {text}
      </motion.span>
    );
  }
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
