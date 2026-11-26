/* Simple stroke icons in currentColor, so they follow theme.css. Always decorative (aria-hidden). */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </>
  ),
  alarm: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.5V13l2.4 1.6M4.5 5.5 7 3.5M19.5 5.5 17 3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  chat: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7.5L7 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="16.5" cy="9" r="2.2" />
      <path d="M3.5 19c.4-3.2 2.2-5 4.5-5s4.1 1.8 4.5 5M12.8 19c.3-2.6 1.7-4 3.7-4s3.4 1.4 3.7 4" />
    </>
  ),
  elder: (
    <>
      <circle cx="11" cy="6" r="2.6" />
      <path d="M7.5 21v-6.5L9 10h4l2 3.5h2.5M9 21l2-5M17.5 13.5V21" />
    </>
  ),
  doctor: (
    <>
      <path d="M6 3.5v5a4 4 0 0 0 8 0v-5" />
      <path d="M10 12.5v2a4.5 4.5 0 0 0 9 0V13" />
      <circle cx="19" cy="11" r="2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.5 12S6.5 6 12 6s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M4.5 19.5 19.5 4.5" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />
      <path d="M8.5 12.5h2l1-2 1.5 4 1-2h1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
};

export default function Icon({ name, size = 28, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className={className} {...stroke}>
      {PATHS[name]}
    </svg>
  );
}
