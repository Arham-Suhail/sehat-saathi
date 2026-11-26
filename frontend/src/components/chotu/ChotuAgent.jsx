/* Chotu: the check-in companion. Pure SVG + CSS (no image files), drawn after the user's reference
   images: a pastel, iridescent little ghost with two oval eyes and a wavy hem.
   One `state` prop: idle | listening | thinking | speaking | error. Animates transform/opacity only
   (styles/chotu.css). Labelled for screen readers; never shows medical content.
   Always render it inside <ChotuBoundary> so a failure can't break the check-in. */
import { useId } from 'react';
import { t } from '../../i18n/useT';

const STATES = new Set(['idle', 'listening', 'thinking', 'speaking', 'error']);
const label = (s) => t(`chotu.state.${s}`);

// Egg-shaped body (narrow top, widest just below the middle) with four pointed, dripping hem tips.
const BODY =
  'M100 12C144 12 178 52 184 108C186 132 184 160 180 180C178 196 172 208 162 214C160 202 152 192 140 192' +
  'C128 192 122 204 116 216C112 202 104 190 95 190C86 190 80 202 74 214C70 202 64 192 55 192' +
  'C46 192 40 200 36 206C26 198 20 186 20 174C16 152 14 130 16 108C22 52 56 12 100 12Z';

const TINTS = [
  ['green', 30, 30, 'var(--chotu-green)'],
  ['blue', 175, 45, 'var(--chotu-blue)'],
  ['pink', 20, 185, 'var(--chotu-pink)'],
  ['yellow', 185, 175, 'var(--chotu-yellow)'],
];

export default function ChotuAgent({ state = 'idle', size = 140, className = '' }) {
  const s = STATES.has(state) ? state : 'idle';
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const g = (name) => `chotu-${name}-${uid}`;
  const ring = { fill: 'none', stroke: 'var(--chotu-ring)', strokeWidth: 3 };
  return (
    <span className={`chotu chotu--${s} ${className}`.trim()} role="img" aria-label={label(s)}>
      <svg viewBox="-20 -30 240 270" width={size} height={Math.round(size * 1.125)} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={g('clip')}>
            <path d={BODY} />
          </clipPath>
          {TINTS.map(([name, cx, cy, color]) => (
            <radialGradient key={name} id={g(name)} cx={cx} cy={cy} r="105" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.95 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </radialGradient>
          ))}
          <radialGradient id={g('glow')} cx="98" cy="105" r="70" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--chotu-body)', stopOpacity: 0.95 }} />
            <stop offset="1" style={{ stopColor: 'var(--chotu-body)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        <ellipse className="chotu__shadow" cx="100" cy="234" rx="62" ry="8" style={{ fill: 'var(--chotu-shadow)' }} />
        <circle className="chotu__ring" cx="100" cy="110" r="112" style={ring} />
        <circle className="chotu__ring chotu__ring--2" cx="100" cy="110" r="112" style={ring} />

        <g className="chotu__float">
          <g style={{ fill: 'var(--accent)' }}>
            <circle className="chotu__dot" cx="140" cy="2" r="6" />
            <circle className="chotu__dot chotu__dot--2" cx="158" cy="-8" r="6" />
            <circle className="chotu__dot chotu__dot--3" cx="176" cy="-18" r="6" />
          </g>
          <g className="chotu__body">
            <g clipPath={`url(#${g('clip')})`}>
              <rect width="200" height="220" style={{ fill: 'var(--chotu-body)' }} />
              {TINTS.map(([name]) => (
                <rect key={name} width="200" height="220" fill={`url(#${g(name)})`} />
              ))}
              <rect width="200" height="220" fill={`url(#${g('glow')})`} />
            </g>
            <g className="chotu__eyes" style={{ fill: 'var(--chotu-eye)' }}>
              <ellipse className="chotu__eye" cx="76" cy="96" rx="8.5" ry="13" />
              <ellipse className="chotu__eye" cx="124" cy="93" rx="8.5" ry="13" />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
