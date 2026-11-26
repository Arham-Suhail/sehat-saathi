/* Inspired by Aceternity "Aurora Background" + "Grid and Dot Backgrounds", rebuilt for a warm palette.
   Soft radial glows (theme.css --glow-* colours) drift via transform only; no filter: blur, so it stays
   smooth on low-end Android. Purely decorative (aria-hidden). */
export default function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-1/4 -top-1/4 h-[80vmax] w-[80vmax] rounded-full animate-aurora-a"
        style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
      />
      <div
        className="absolute -right-1/3 top-0 h-[70vmax] w-[70vmax] rounded-full animate-aurora-b"
        style={{ background: 'radial-gradient(closest-side, var(--glow-teal), transparent)' }}
      />
      <div
        className="absolute -bottom-1/3 left-1/4 h-[65vmax] w-[65vmax] rounded-full animate-aurora-c"
        style={{ background: 'radial-gradient(closest-side, var(--glow-peach), transparent)' }}
      />
      {/* Dot grid, faded towards the edges */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--dot) 1.2px, transparent 1.2px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black 40%, transparent 100%)',
        }}
      />
    </div>
  );
}
