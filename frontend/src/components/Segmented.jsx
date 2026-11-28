import { motion } from 'motion/react';

/* iOS/Android-style segmented control: a sliding pill marks the chosen section.
   Keyboard: it's a tablist of buttons (Tab + Enter/Space). 48px targets. */
export default function Segmented({ options, value, onChange, label, id = 'seg' }) {
  return (
    <div role="tablist" aria-label={label} className="segmented">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => {
            try {
              navigator.vibrate?.(6);
            } catch {
              /* ignore */
            }
            onChange(key);
          }}
          className="segmented__btn"
        >
          {value === key ? (
            <motion.span layoutId={`${id}-pill`} className="segmented__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          ) : null}
          <span className="segmented__label">{text}</span>
        </button>
      ))}
    </div>
  );
}
