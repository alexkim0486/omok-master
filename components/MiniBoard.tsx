"use client";

import { useId } from "react";

export interface MiniStone {
  x: number;
  y: number;
  color: "black" | "white";
}

export interface MiniBoardProps {
  cols: number;
  rows: number;
  stones: MiniStone[];
  /** The point Black is about to play. */
  target?: { x: number; y: number };
  /** How to mark the target: forbidden (red ✕) or a winning move (green ✓). */
  targetKind?: "forbidden" | "win";
  className?: string;
}

/**
 * A small, self-contained SVG goban used in the rules help screen to
 * illustrate forbidden-move patterns. Visual language matches the main board
 * (warm wood, glossy stones, red ✕ for forbidden).
 */
export default function MiniBoard({
  cols,
  rows,
  stones,
  target,
  targetKind = "forbidden",
  className,
}: MiniBoardProps) {
  const uid = useId();
  const cell = 34;
  const pad = 22;
  const w = pad * 2 + (cols - 1) * cell;
  const h = pad * 2 + (rows - 1) * cell;
  const r = cell * 0.42;
  const cx = (x: number) => pad + x * cell;
  const cy = (y: number) => pad + y * cell;

  const wood = `${uid}-wood`;
  const black = `${uid}-black`;
  const white = `${uid}-white`;
  const shadow = `${uid}-shadow`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <radialGradient id={wood} cx="42%" cy="38%" r="85%">
          <stop offset="0%" stopColor="#ecc987" />
          <stop offset="100%" stopColor="#b9842f" />
        </radialGradient>
        <radialGradient id={black} cx="36%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#4a4a4a" />
          <stop offset="55%" stopColor="#1c1c1c" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id={white} cx="36%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6cfc0" />
        </radialGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Wood surface */}
      <rect x="0" y="0" width={w} height={h} rx="10" fill={`url(#${wood})`} />
      <rect
        x="1"
        y="1"
        width={w - 2}
        height={h - 2}
        rx="9"
        fill="none"
        stroke="rgba(255,210,120,0.18)"
        strokeWidth="1"
      />

      {/* Grid */}
      <g stroke="#6b4f25" strokeWidth="1.1" shapeRendering="crispEdges">
        {Array.from({ length: rows }, (_, y) => (
          <line key={`h${y}`} x1={cx(0)} y1={cy(y)} x2={cx(cols - 1)} y2={cy(y)} />
        ))}
        {Array.from({ length: cols }, (_, x) => (
          <line key={`v${x}`} x1={cx(x)} y1={cy(0)} x2={cx(x)} y2={cy(rows - 1)} />
        ))}
      </g>

      {/* Stones */}
      {stones.map((s, i) => (
        <circle
          key={i}
          cx={cx(s.x)}
          cy={cy(s.y)}
          r={r}
          fill={`url(#${s.color === "black" ? black : white})`}
          stroke={s.color === "white" ? "rgba(150,120,70,0.35)" : "none"}
          strokeWidth="1"
          filter={`url(#${shadow})`}
        />
      ))}

      {/* Target: faint black stone + colored ring + ✕ (forbidden) or ✓ (win) */}
      {target &&
        (() => {
          const color = targetKind === "win" ? "#34d399" : "#f43f5e";
          return (
            <g>
              <circle
                cx={cx(target.x)}
                cy={cy(target.y)}
                r={r}
                fill={`url(#${black})`}
                opacity="0.45"
              />
              <circle
                cx={cx(target.x)}
                cy={cy(target.y)}
                r={r + 2}
                fill="none"
                stroke={color}
                strokeWidth="2"
              />
              <g
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                transform={`translate(${cx(target.x)},${cy(target.y)})`}
              >
                {targetKind === "win" ? (
                  <polyline
                    points={`${-r * 0.5},${0} ${-r * 0.12},${r * 0.4} ${r * 0.55},${-r * 0.45}`}
                  />
                ) : (
                  <>
                    <line x1={-r * 0.55} y1={-r * 0.55} x2={r * 0.55} y2={r * 0.55} />
                    <line x1={-r * 0.55} y1={r * 0.55} x2={r * 0.55} y2={-r * 0.55} />
                  </>
                )}
              </g>
            </g>
          );
        })()}
    </svg>
  );
}
