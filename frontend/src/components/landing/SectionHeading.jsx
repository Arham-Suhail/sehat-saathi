/* Shared section heading: small gold eyebrow + serif title (display fonts only in headings, CLAUDE.md). */
export default function SectionHeading({ id, eyebrow, title, align = 'center', children }) {
  const center = align === 'center';
  return (
    <div className={`mb-8 flex flex-col gap-2 ${center ? 'items-center text-center' : 'items-center text-center md:items-start md:text-start'}`}>
      <p className="m-0 inline-flex items-center gap-2 text-[1.25rem] font-bold uppercase tracking-[0.06em] text-gold-text">
        <span aria-hidden="true" className="h-[3px] w-6 rounded-full bg-gold" />
        {eyebrow}
      </p>
      <h2 id={id} className="m-0 font-serif text-[clamp(1.9rem,5.5vw,2.75rem)] font-semibold leading-tight text-ink [text-wrap:balance]">
        {title}
      </h2>
      {children}
    </div>
  );
}
