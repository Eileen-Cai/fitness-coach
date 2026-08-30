/**
 * The progress instrument: a 270° gauge with tick marks, one spot of accent.
 * Deliberately reads like a dial/scale, not a generic donut chart.
 */

const R = 40;
const C = 2 * Math.PI * R;
const SWEEP = 0.75; // 270° of the circle
const ARC = C * SWEEP;
const START_DEG = 135; // gap centred at the bottom

const TICKS = Array.from({ length: 11 }, (_, i) => {
  const deg = START_DEG + (i / 10) * 270;
  const rad = (deg * Math.PI) / 180;
  const inner = i % 5 === 0 ? 43.5 : 45.5;
  return {
    x1: 50 + inner * Math.cos(rad),
    y1: 50 + inner * Math.sin(rad),
    x2: 50 + 49 * Math.cos(rad),
    y2: 50 + 49 * Math.sin(rad),
    major: i % 5 === 0,
  };
});

export function LevelRing({
  level,
  fraction,
  caption,
  size = 132,
}: {
  level: number;
  fraction: number;
  caption: string;
  size?: number;
}) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="var(--line-strong)"
              strokeWidth={t.major ? 1.4 : 1}
              strokeLinecap="round"
            />
          ))}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--line)"
            strokeWidth="5"
            strokeDasharray={`${ARC} ${C}`}
            transform="rotate(135 50 50)"
          />
          <circle
            className="ring-fill"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="5"
            strokeLinecap="butt"
            strokeDasharray={C}
            strokeDashoffset={C - f * ARC}
            transform="rotate(135 50 50)"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-ink-faint">
            Level
          </span>
          <span className="font-mono text-[1.9rem] leading-none text-ink tabular-nums">
            {level}
          </span>
        </div>
      </div>
      <p className="mt-2 font-mono text-[0.7rem] text-ink-faint">{caption}</p>
    </div>
  );
}
