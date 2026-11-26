/* Interactive hero: a pseudo-3D Chotu (no 3D library). The stage tilts toward the pointer with a
   spring, layers sit at different depths (translateZ + parallax), and Chotu's eyes follow the pointer
   via CSS variables (no React re-render per move). Tap/click/Enter: Chotu squishes, says a friendly
   line (announced politely to screen readers) and a few hearts pop out.
   Reduced motion: no tilt, parallax or eye tracking; tapping still shows the speech bubble.
   transform/opacity only. Theme colours only. */
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import ChotuAgent from '../chotu/ChotuAgent';
import ChotuBoundary from '../chotu/ChotuBoundary';
import Icon from './icons';
import { t } from '../../i18n/useT';

const SAY_COUNT = 5;
const SPRING = { stiffness: 110, damping: 15, mass: 0.6 };
// Heart burst directions (px), fixed so renders stay deterministic.
const BURST = [
  [-70, -90],
  [-20, -120],
  [40, -105],
  [85, -60],
  [-95, -30],
];

export default function HeroStage() {
  const reduce = useReducedMotion();
  const stageRef = useRef(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const rotateY = useTransform(sx, [-1, 1], [-16, 16]);
  const rotateX = useTransform(sy, [-1, 1], [12, -12]);
  const backX = useTransform(sx, [-1, 1], [22, -22]);
  const backY = useTransform(sy, [-1, 1], [16, -16]);
  const frontX = useTransform(sx, [-1, 1], [-30, 30]);
  const frontY = useTransform(sy, [-1, 1], [-20, 20]);

  const [say, setSay] = useState(null);
  const [pokes, setPokes] = useState(0);
  const [hover, setHover] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const el = stageRef.current;
    if (reduce || !el) return undefined;
    let raf = 0;
    const setGaze = (x, y) => {
      el.style.setProperty('--gaze-x', `${(x * 14).toFixed(1)}px`);
      el.style.setProperty('--gaze-y', `${(y * 12).toFixed(1)}px`);
    };
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
        px.set(nx);
        py.set(ny);
        setGaze(nx, ny);
      });
    };
    const onLeave = () => {
      px.set(0);
      py.set(0);
      setGaze(0, 0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [reduce, px, py]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poke = () => {
    setSay((n) => ((n ?? -1) + 1) % SAY_COUNT);
    setPokes((n) => n + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSay(null), 3500);
  };

  const state = say !== null ? 'speaking' : hover ? 'listening' : 'idle';

  return (
    <div ref={stageRef} className="relative mx-auto w-full max-w-[26rem] select-none" style={{ perspective: '900px' }}>
      <motion.div
        className="relative flex flex-col items-center px-2 pt-16 pb-6"
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
      >
        {/* back layer: glow disc + orbit ring */}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center" style={reduce ? undefined : { x: backX, y: backY, z: -40 }}>
          <span
            className="absolute h-[18rem] w-[18rem] rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--glow-teal), transparent)' }}
          />
          <span className="absolute h-[16rem] w-[16rem] rounded-full border-2 border-dashed border-line opacity-70" />
          <span
            className="absolute -right-2 top-10 h-24 w-24 rounded-full"
            style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
          />
        </motion.div>

        {/* speech bubble (also a polite live region) */}
        <div className="absolute left-1/2 top-0 z-20 w-max max-w-[17rem] -translate-x-1/2" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            {say !== null && (
              <motion.p
                key={say}
                className="m-0 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-center text-[1.2rem] font-bold leading-snug text-ink shadow-lift"
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.25 }}
              >
                {t(`landing.chotu.say.${say + 1}`)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Chotu itself: the one interactive element */}
        <motion.button
          type="button"
          onClick={poke}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          aria-label={t('landing.chotu.poke')}
          className="relative z-10 cursor-pointer rounded-full border-0 bg-transparent p-2"
          style={reduce ? undefined : { z: 60 }}
          whileHover={reduce ? undefined : { scale: 1.04 }}
          whileTap={reduce ? undefined : { scale: 0.9, rotate: -4 }}
        >
          <motion.span
            key={pokes}
            className="block"
            initial={false}
            animate={reduce || pokes === 0 ? {} : { scaleX: [1, 1.14, 0.94, 1], scaleY: [1, 0.86, 1.08, 1] }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <ChotuBoundary>
              <ChotuAgent state={state} size={230} className="chotu--gaze" />
            </ChotuBoundary>
          </motion.span>

          {/* heart burst */}
          {!reduce && pokes > 0 && (
            <span key={`b${pokes}`} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/3">
              {BURST.map(([dx, dy], i) => (
                <motion.span
                  key={i}
                  className={`absolute ${i % 2 ? 'text-gold' : 'text-accent'}`}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                  animate={{ opacity: 0, x: dx, y: dy, scale: 1.1 }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.03 }}
                >
                  <Icon name="heart" size={22} />
                </motion.span>
              ))}
            </span>
          )}
        </motion.button>

        {/* front layer: floating chips at depth */}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20" style={reduce ? undefined : { x: frontX, y: frontY, z: 90 }}>
          <span
            className="absolute left-0 top-[30%] inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-[1.05rem] font-bold text-ink shadow-lift sm:-left-6"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-text">
              <Icon name="bell" size={18} />
            </span>
            {t('landing.stage.reminder')}
          </span>
          <span
            className="absolute bottom-16 right-0 inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-[1.05rem] font-bold text-ink shadow-lift sm:-right-4"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gold-soft text-gold-text">
              <Icon name="heart" size={18} />
            </span>
            {t('landing.stage.mood')}
          </span>
        </motion.div>

        <p className="m-0 mt-2 inline-flex items-center gap-2 text-[1.25rem] font-bold text-muted">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-gold" />
          {t('landing.chotu.hint')}
        </p>
      </motion.div>
    </div>
  );
}
