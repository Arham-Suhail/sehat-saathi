/* Inspired by Aceternity "Aurora Background" + "Grid and Dot Backgrounds", rebuilt for a warm palette.
   Soft radial glows (theme.css --glow-* colours) drift via transform only; no filter: blur, so it stays
   smooth on low-end Android. On phones only two smaller glows are drawn. The dot grid sits behind the
   hero only. Purely decorative (aria-hidden). */
export default function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110svh] overflow-hidden">
      <div
        className="absolute -left-1/3 -top-1/4 h-[60vmax] w-[60vmax] rounded-full animate-aurora-a sm:h-[80vmax] sm:w-[80vmax]"
        style={{ background: 'radial-gradient(closest-side, var(--glow-gold), transparent)' }}
      />
      <div
        className="absolute -right-1/3 top-0 h-[55vmax] w-[55vmax] rounded-full animate-aurora-b sm:h-[70vmax] sm:w-[70vmax]"
        style={{ background: 'radial-gradient(closest-side, var(--glow-teal), transparent)' }}
      />
      <div
        className="absolute -bottom-1/3 left-1/4 hidden h-[65vmax] w-[65vmax] rounded-full animate-aurora-c sm:block"
        style={{ background: 'radial-gradient(closest-side, var(--glow-peach), transparent)' }}
      />
      {/* Dot grid, faded towards the edges and the bottom */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--dot) 1.2px, transparent 1.2px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, black 40%, transparent 100%)',
        }}
      />
    </div>
  );
}
