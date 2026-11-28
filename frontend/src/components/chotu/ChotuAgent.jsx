/* Chotu: the check-in companion, drawn as a friendly medicine CAPSULE (teal cap with a gold "+",
   cream body, kind face). Specific to Sehat Saathi: "medicine on time" at a glance. Deliberately NOT a
   doctor (no coat, no stethoscope): Chotu is a helper, never medical advice.
   Pure SVG + CSS (no image files). One `state` prop: idle | listening | thinking | speaking | error.
   Animates transform/opacity only (styles/chotu.css). Colours come from theme tokens (--chotu-*),
   so dark mode works. Always render it inside <ChotuBoundary> so a failure can't break a screen. */
import { useId } from 'react';
import { t } from '../../i18n/useT';

const STATES = new Set(['idle', 'listening', 'thinking', 'speaking', 'error']);
const label = (s) => t(`chotu.state.${s}`);

// Capsule geometry (before the -12deg tilt): x 55..145, y 22..198, seam at y 102.
const CAPSULE = { x: 55, y: 22, w: 90, h: 176, r: 45, seam: 102 };

export default function ChotuAgent({ state = 'idle', size = 140, className = '' }) {
  const s = STATES.has(state) ? state : 'idle';
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clip = `chotu-clip-${uid}`;
  const shine = `chotu-shine-${uid}`;
  const { x, y, w, h, r, seam } = CAPSULE;
  const ring = { fill: 'none', stroke: 'var(--chotu-ring)', strokeWidth: 3 };
  const line = { stroke: 'var(--chotu-line)', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

  return (
    <span className={`chotu chotu--${s} ${className}`.trim()} role="img" aria-label={label(s)}>
      <svg viewBox="-20 -30 240 270" width={size} height={Math.round(size * 1.125)} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clip}>
            <rect x={x} y={y} width={w} height={h} rx={r} />
          </clipPath>
          <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
            <stop offset="0.5" style={{ stopColor: '#ffffff', stopOpacity: 0.16 }} />
            <stop offset="1" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        <ellipse className="chotu__shadow" cx="100" cy="232" rx="56" ry="8" style={{ fill: 'var(--chotu-shadow)' }} />
        <circle className="chotu__ring" cx="100" cy="110" r="112" style={ring} />
        <circle className="chotu__ring chotu__ring--2" cx="100" cy="110" r="112" style={ring} />

        <g className="chotu__float">
          {/* "thinking" dots */}
          <g style={{ fill: 'var(--chotu-cap)' }}>
            <circle className="chotu__dot" cx="150" cy="-2" r="6" />
            <circle className="chotu__dot chotu__dot--2" cx="168" cy="-12" r="6" />
            <circle className="chotu__dot chotu__dot--3" cx="186" cy="-22" r="6" />
          </g>

          <g className="chotu__body">
            <g transform="rotate(-12 100 110)">
              {/* arms (behind the body) */}
              <path className="chotu__arm" d="M57 120 q-24 8 -30 32" style={{ ...line, strokeWidth: 7 }} />
              <path className="chotu__arm chotu__arm--wave" d="M143 112 q26 -8 32 -34" style={{ ...line, strokeWidth: 7 }} />

              {/* capsule: cream body, teal cap */}
              <g clipPath={`url(#${clip})`}>
                <rect x={x} y={y} width={w} height={h} style={{ fill: 'var(--chotu-shell)' }} />
                <rect x={x} y={y} width={w} height={seam - y} style={{ fill: 'var(--chotu-cap)' }} />
                <rect x={x} y={y} width={w} height={h} fill={`url(#${shine})`} />
              </g>
              <rect x={x} y={y} width={w} height={h} rx={r} style={{ ...line, strokeWidth: 5 }} />
              <line x1={x} y1={seam} x2={x + w} y2={seam} style={{ ...line, strokeWidth: 4 }} />
              <path d="M76 46 q8 -12 22 -12" style={{ stroke: '#ffffff', strokeWidth: 7, strokeLinecap: 'round', fill: 'none', opacity: 0.55 }} />
              <path d="M113 52h11v10h10v11h-10v10h-11v-10h-10v-11h10z" style={{ fill: 'var(--chotu-plus)' }} />

              {/* face */}
              <g style={{ fill: 'var(--chotu-cheek)' }}>
                <ellipse cx="72" cy="150" rx="8" ry="4.5" opacity="0.85" />
                <ellipse cx="128" cy="150" rx="8" ry="4.5" opacity="0.85" />
              </g>
              <g className="chotu__eyes">
                <g className="chotu__eye">
                  <ellipse cx="84" cy="136" rx="6" ry="9" style={{ fill: 'var(--chotu-eye)' }} />
                  <circle cx="86" cy="132" r="2.2" fill="#ffffff" />
                </g>
                <g className="chotu__eye">
                  <ellipse cx="116" cy="136" rx="6" ry="9" style={{ fill: 'var(--chotu-eye)' }} />
                  <circle cx="118" cy="132" r="2.2" fill="#ffffff" />
                </g>
              </g>
              <path className="chotu__smile" d="M90 152 q10 10 20 0" style={{ stroke: 'var(--chotu-eye)', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' }} />
              <ellipse className="chotu__talk" cx="100" cy="155" rx="7" ry="6" style={{ fill: 'var(--chotu-eye)' }} />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
