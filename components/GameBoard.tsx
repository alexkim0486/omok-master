"use client";

import { useRef, useEffect, useCallback } from "react";
import { Grid, Point, Stone, BOARD_SIZE } from "@/lib/renju/types";

export interface GameBoardProps {
  grid: Grid;               // grid[y][x]; render stones from this
  lastMove?: Point | null;  // draw a small marker on this intersection
  winLine?: Point[];        // highlight these intersections (winning five)
  forbidden?: Point[];      // mark these empty intersections with a red ✕ (Black forbidden points)
  disabled?: boolean;       // when true, ignore user input (AI thinking / game over)
  onPlay: (x: number, y: number) => void; // called with the intersection the user tapped
}

const MARGIN_RATIO = 0.045; // fraction of canvas width used as margin on each side

// Wood goban design tokens
const WOOD_BASE    = "#d9a441";
const WOOD_LIGHT   = "#ecc987";
const WOOD_SHADOW  = "#b07d2c";
const WOOD_DARK    = "#8c5e1a";
const GRID_COLOR   = "#6b4f25";

/** Convert grid coordinates to pixel center. */
function gridToPixel(
  gx: number,
  gy: number,
  margin: number,
  spacing: number
): { px: number; py: number } {
  return {
    px: margin + gx * spacing,
    py: margin + gy * spacing,
  };
}

/** Convert pixel to nearest grid coordinate. Returns null if outside board. */
function pixelToGrid(
  px: number,
  py: number,
  margin: number,
  spacing: number
): { gx: number; gy: number } | null {
  const gxRaw = (px - margin) / spacing;
  const gyRaw = (py - margin) / spacing;
  const gx = Math.round(gxRaw);
  const gy = Math.round(gyRaw);
  if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE) return null;
  if (Math.abs(gxRaw - gx) > 0.5 || Math.abs(gyRaw - gy) > 0.5) return null;
  return { gx, gy };
}

/** Draw the wooden board background: base gradient, grain strokes, inner vignette. */
function drawBoard(ctx: CanvasRenderingContext2D, size: number) {
  // Base wood colour — warm radial: lighter centre, darker edges
  const baseGrad = ctx.createRadialGradient(
    size * 0.42, size * 0.38, size * 0.05,
    size * 0.5,  size * 0.5,  size * 0.78
  );
  baseGrad.addColorStop(0,   WOOD_LIGHT);
  baseGrad.addColorStop(0.45, WOOD_BASE);
  baseGrad.addColorStop(1,   WOOD_SHADOW);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Secondary diagonal warm overlay — simulates grain direction
  const grainOvl = ctx.createLinearGradient(0, 0, size, size * 0.7);
  grainOvl.addColorStop(0,   "rgba(255,220,130,0.13)");
  grainOvl.addColorStop(0.35,"rgba(200,140, 40,0.06)");
  grainOvl.addColorStop(0.7, "rgba(255,200, 90,0.10)");
  grainOvl.addColorStop(1,   "rgba(140, 80, 10,0.08)");
  ctx.fillStyle = grainOvl;
  ctx.fillRect(0, 0, size, size);

  // Subtle procedural grain: ~30 very thin diagonal translucent strokes
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = "#3a2000";
  ctx.lineWidth = 1;
  const grainCount = 28;
  for (let i = 0; i < grainCount; i++) {
    const t = i / grainCount;
    const x = t * size * 1.6 - size * 0.3;
    const wave = Math.sin(t * Math.PI * 6) * size * 0.015;
    ctx.beginPath();
    ctx.moveTo(x + wave,          -size * 0.05);
    ctx.lineTo(x - size * 0.18 + wave, size * 1.05);
    ctx.stroke();
  }
  ctx.restore();

  // Inner vignette: subtle dark edge shadow pressing inward
  const vignetteGrad = ctx.createRadialGradient(
    size * 0.5, size * 0.5, size * 0.28,
    size * 0.5, size * 0.5, size * 0.72
  );
  vignetteGrad.addColorStop(0,   "rgba(0,0,0,0)");
  vignetteGrad.addColorStop(0.7, "rgba(0,0,0,0)");
  vignetteGrad.addColorStop(1,   "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, size, size);
}

/** Draw engraved grid lines with a subtle dual-pass (shadow beneath, light above). */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  margin: number,
  spacing: number
) {
  const { px: x0 } = gridToPixel(0, 0, margin, spacing);
  const { px: xN } = gridToPixel(BOARD_SIZE - 1, 0, margin, spacing);
  const { py: y0 } = gridToPixel(0, 0, margin, spacing);
  const { py: yN } = gridToPixel(0, BOARD_SIZE - 1, margin, spacing);

  // Pass 1: shadow groove — shift 0.5px down-right, slightly darker
  ctx.save();
  ctx.strokeStyle = "rgba(60,30,0,0.35)";
  ctx.lineWidth = Math.max(0.6, spacing * 0.045);
  ctx.translate(0.5, 0.5);
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { px } = gridToPixel(i, 0, margin, spacing);
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, yN); ctx.stroke();
    const { py } = gridToPixel(0, i, margin, spacing);
    ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(xN, py); ctx.stroke();
  }
  ctx.restore();

  // Pass 2: main line — crisp warm-dark
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = Math.max(0.5, spacing * 0.038);
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { px } = gridToPixel(i, 0, margin, spacing);
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, yN); ctx.stroke();
    const { py } = gridToPixel(0, i, margin, spacing);
    ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(xN, py); ctx.stroke();
  }
  ctx.restore();
}

/** Draw refined hoshi star-point dots. */
function drawHoshi(
  ctx: CanvasRenderingContext2D,
  margin: number,
  spacing: number
) {
  const hoshi: [number, number][] = [
    [7, 7],
    [3, 3], [11, 3],
    [3, 11], [11, 11],
  ];
  const r = spacing * 0.095;
  for (const [hx, hy] of hoshi) {
    const { px, py } = gridToPixel(hx, hy, margin, spacing);
    // tiny ambient shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0.5;
    ctx.shadowOffsetY = 0.5;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = WOOD_DARK;
    ctx.fill();
    ctx.restore();
    // thin bright rim on top-left
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,220,130,0.25)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw a single stone at (px,py) with 3D gloss + contact shadow. scale 0→1 for animation. */
function drawStone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  stoneRadius: number,
  stone: Stone.Black | Stone.White,
  scale = 1
) {
  const r = stoneRadius * scale;
  if (r <= 0) return;

  ctx.save();
  if (scale < 1) {
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);
  }

  // Contact shadow — soft, slightly offset
  ctx.save();
  ctx.shadowColor  = "rgba(0,0,0,0.55)";
  ctx.shadowBlur   = stoneRadius * 0.55;
  ctx.shadowOffsetX = stoneRadius * 0.07;
  ctx.shadowOffsetY = stoneRadius * 0.12;

  // Main stone body — radial gradient from top-left specular to deep base
  const specX = px - r * 0.32;
  const specY = py - r * 0.30;

  const bodyGrad = ctx.createRadialGradient(
    specX, specY, r * 0.04,
    px, py, r * 1.02
  );

  if (stone === Stone.Black) {
    bodyGrad.addColorStop(0,    "#4a4a4a");
    bodyGrad.addColorStop(0.22, "#252525");
    bodyGrad.addColorStop(0.55, "#141414");
    bodyGrad.addColorStop(1,    "#000000");
  } else {
    bodyGrad.addColorStop(0,    "#ffffff");
    bodyGrad.addColorStop(0.30, "#fbfbf7");
    bodyGrad.addColorStop(0.68, "#e8e2d8");
    bodyGrad.addColorStop(1,    "#d6cfc0");
  }

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.restore(); // shadow off

  // White stone: warm faint rim to separate it from the board
  if (stone === Stone.White) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(160,130,80,0.32)";
    ctx.lineWidth = Math.max(0.5, r * 0.055);
    ctx.stroke();
  }

  // Specular highlight — small bright ellipse at top-left
  const hlGrad = ctx.createRadialGradient(
    px - r * 0.30, py - r * 0.28, 0,
    px - r * 0.20, py - r * 0.20, r * 0.42
  );
  if (stone === Stone.Black) {
    hlGrad.addColorStop(0,   "rgba(255,255,255,0.72)");
    hlGrad.addColorStop(0.45,"rgba(255,255,255,0.18)");
    hlGrad.addColorStop(1,   "rgba(255,255,255,0)");
  } else {
    hlGrad.addColorStop(0,   "rgba(255,255,255,0.90)");
    hlGrad.addColorStop(0.40,"rgba(255,255,255,0.30)");
    hlGrad.addColorStop(1,   "rgba(255,255,255,0)");
  }
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = hlGrad;
  ctx.fill();

  ctx.restore(); // scale
}

/** Draw glowing gold win-line sweep connecting the five stones. */
function drawWinLine(
  ctx: CanvasRenderingContext2D,
  winLine: Point[],
  margin: number,
  spacing: number,
  stoneRadius: number
) {
  if (winLine.length < 2) return;
  const sorted = [...winLine].sort((a, b) =>
    a.x !== b.x ? a.x - b.x : a.y - b.y
  );
  const { px: sx, py: sy } = gridToPixel(sorted[0].x, sorted[0].y, margin, spacing);
  const last = sorted[sorted.length - 1];
  const { px: ex, py: ey } = gridToPixel(last.x, last.y, margin, spacing);

  ctx.save();
  // Outer glow pass
  ctx.strokeStyle = "rgba(245,196,81,0.22)";
  ctx.lineWidth = stoneRadius * 2.2;
  ctx.lineCap = "round";
  ctx.shadowColor = "#f5c451";
  ctx.shadowBlur = stoneRadius * 1.8;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Core sweep — gradient along the line
  const lineLen = Math.hypot(ex - sx, ey - sy);
  if (lineLen > 0) {
    const linGrad = ctx.createLinearGradient(sx, sy, ex, ey);
    linGrad.addColorStop(0,   "rgba(255,240,130,0.72)");
    linGrad.addColorStop(0.5, "rgba(245,196, 81,0.88)");
    linGrad.addColorStop(1,   "rgba(255,240,130,0.72)");
    ctx.strokeStyle = linGrad;
    ctx.lineWidth = stoneRadius * 0.55;
    ctx.shadowColor = "#f5c451";
    ctx.shadowBlur = stoneRadius * 1.0;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw last-move marker: elegant thin amber ring on the stone. */
function drawLastMoveMarker(
  ctx: CanvasRenderingContext2D,
  lastMove: Point,
  grid: Grid,
  margin: number,
  spacing: number,
  stoneRadius: number,
  pulseT = 0 // 0..1 for optional pulse phase
) {
  const { px, py } = gridToPixel(lastMove.x, lastMove.y, margin, spacing);
  const stone = grid[lastMove.y]?.[lastMove.x];
  if (stone === Stone.Empty || stone === undefined) return;

  const pulse = 1 + Math.sin(pulseT * Math.PI * 2) * 0.06;
  const ringR = stoneRadius * 0.36 * pulse;

  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, ringR, 0, Math.PI * 2);
  if (stone === Stone.Black) {
    ctx.fillStyle = "rgba(245,196,81,0.90)";
  } else {
    ctx.fillStyle = "rgba(30,20,0,0.72)";
  }
  ctx.fill();
  ctx.restore();
}

/** Draw forbidden-move markers: muted crimson ✕ on empty intersections. */
function drawForbidden(
  ctx: CanvasRenderingContext2D,
  forbidden: Point[],
  grid: Grid,
  margin: number,
  spacing: number,
  stoneRadius: number
) {
  if (forbidden.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  const arm = stoneRadius * 0.46;
  const lw = Math.max(1, spacing * 0.08);

  for (const pt of forbidden) {
    if (grid[pt.y]?.[pt.x] !== Stone.Empty) continue;
    const { px, py } = gridToPixel(pt.x, pt.y, margin, spacing);

    // Subtle shadow for engraved look
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = lw + 1;
    ctx.translate(0.5, 0.8);
    ctx.beginPath();
    ctx.moveTo(px - arm, py - arm); ctx.lineTo(px + arm, py + arm);
    ctx.moveTo(px + arm, py - arm); ctx.lineTo(px - arm, py + arm);
    ctx.stroke();
    ctx.restore();

    // Main crimson ✕
    ctx.strokeStyle = "rgba(212,86,79,0.85)";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(px - arm, py - arm); ctx.lineTo(px + arm, py + arm);
    ctx.moveTo(px + arm, py - arm); ctx.lineTo(px - arm, py + arm);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a ghost stone preview on hover (desktop). */
function drawGhostStone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  stoneRadius: number,
  stone: Stone.Black | Stone.White
) {
  ctx.save();
  ctx.globalAlpha = 0.38;
  drawStone(ctx, px, py, stoneRadius, stone, 1);
  ctx.restore();
}

// ─── Animation state (module-level, per-instance via ref) ────────────────────
interface AnimEntry {
  gx: number;
  gy: number;
  start: number;   // performance.now() timestamp
  duration: number;
}

export default function GameBoard({
  grid,
  lastMove,
  winLine,
  forbidden,
  disabled = false,
  onPlay,
}: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const sizeRef      = useRef<number>(0);

  // Previous grid snapshot to detect newly placed stone
  const prevGridRef  = useRef<Grid | null>(null);
  // Active scale-in animation for the newest stone
  const animRef      = useRef<AnimEntry | null>(null);
  const rafRef       = useRef<number | null>(null);

  // Hover state for ghost preview
  const hoverRef     = useRef<{ gx: number; gy: number } | null>(null);

  // Reduced-motion preference
  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Detect which player would play next (for ghost colour)
  // Count placed stones to determine whose turn it is
  const countStones = useCallback((): { black: number; white: number } => {
    let black = 0, white = 0;
    for (let gy = 0; gy < BOARD_SIZE; gy++) {
      for (let gx = 0; gx < BOARD_SIZE; gx++) {
        const s = grid[gy]?.[gx];
        if (s === Stone.Black) black++;
        else if (s === Stone.White) white++;
      }
    }
    return { black, white };
  }, [grid]);

  // ── Core draw function ──────────────────────────────────────────────────────
  const draw = useCallback(
    (canvas: HTMLCanvasElement, cssSize: number, animScale?: number) => {
      const dpr    = window.devicePixelRatio || 1;
      const pxSize = Math.round(cssSize * dpr);

      if (canvas.width !== pxSize || canvas.height !== pxSize) {
        canvas.width  = pxSize;
        canvas.height = pxSize;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      const margin       = cssSize * MARGIN_RATIO + cssSize / (BOARD_SIZE - 1) / 2;
      const boardDrawSize = cssSize - 2 * margin;
      const spacing      = boardDrawSize / (BOARD_SIZE - 1);
      const stoneRadius  = spacing * 0.43;

      // ── Board surface ──────────────────────────────────────────────────────
      drawBoard(ctx, cssSize);

      // ── Grid ────────────────────────────────────────────────────────────────
      drawGrid(ctx, margin, spacing);

      // ── Hoshi ───────────────────────────────────────────────────────────────
      drawHoshi(ctx, margin, spacing);

      // ── Win-line (below stones so stones sit on top) ────────────────────────
      if (winLine && winLine.length >= 2) {
        drawWinLine(ctx, winLine, margin, spacing, stoneRadius);
      }

      // ── Stones ──────────────────────────────────────────────────────────────
      const anim = animRef.current;
      for (let gy = 0; gy < BOARD_SIZE; gy++) {
        for (let gx = 0; gx < BOARD_SIZE; gx++) {
          const stone = grid[gy]?.[gx];
          if (stone === Stone.Empty || stone === undefined) continue;
          const { px, py } = gridToPixel(gx, gy, margin, spacing);

          let scale = 1;
          if (
            anim &&
            anim.gx === gx &&
            anim.gy === gy &&
            animScale !== undefined
          ) {
            scale = animScale;
          }

          drawStone(ctx, px, py, stoneRadius, stone as Stone.Black | Stone.White, scale);
        }
      }

      // ── Last-move marker ────────────────────────────────────────────────────
      if (lastMove) {
        drawLastMoveMarker(ctx, lastMove, grid, margin, spacing, stoneRadius);
      }

      // ── Forbidden markers ───────────────────────────────────────────────────
      if (forbidden && forbidden.length > 0) {
        drawForbidden(ctx, forbidden, grid, margin, spacing, stoneRadius);
      }

      // ── Ghost stone preview (hover, desktop only) ────────────────────────────
      const hover = hoverRef.current;
      if (hover && !disabled) {
        const { px, py } = gridToPixel(hover.gx, hover.gy, margin, spacing);
        const { black, white } = countStones();
        const nextPlayer = black <= white ? Stone.Black : Stone.White;
        drawGhostStone(ctx, px, py, stoneRadius, nextPlayer as Stone.Black | Stone.White);
      }

      ctx.restore();
    },
    [grid, lastMove, winLine, forbidden, disabled, countStones]
  );

  // ── Animation loop ───────────────────────────────────────────────────────────
  const startAnimation = useCallback(
    (gx: number, gy: number) => {
      if (reducedMotion) return;
      const duration = 150; // ms
      animRef.current = { gx, gy, start: performance.now(), duration };

      const tick = () => {
        const canvas = canvasRef.current;
        if (!canvas || !animRef.current) return;
        const elapsed = performance.now() - animRef.current.start;
        const t       = Math.min(elapsed / animRef.current.duration, 1);
        // Ease out: fast at start, slows to 1
        const eased = 1 - Math.pow(1 - t, 3);
        draw(canvas, sizeRef.current, eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          animRef.current = null;
          rafRef.current  = null;
          draw(canvas, sizeRef.current, 1);
        }
      };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    },
    [draw, reducedMotion]
  );

  // ── Detect newly placed stone ────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevGridRef.current;
    if (prev) {
      // Find the new stone
      for (let gy = 0; gy < BOARD_SIZE; gy++) {
        for (let gx = 0; gx < BOARD_SIZE; gx++) {
          const newS = grid[gy]?.[gx];
          const oldS = prev[gy]?.[gx];
          if (
            (newS === Stone.Black || newS === Stone.White) &&
            (oldS === Stone.Empty || oldS === undefined)
          ) {
            startAnimation(gx, gy);
            prevGridRef.current = grid;
            return;
          }
        }
      }
    }
    prevGridRef.current = grid;
  }, [grid, startAnimation]);

  // ── Resize observer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const size = entry.contentRect.width;
        if (size > 0) {
          sizeRef.current = size;
          canvas.style.width  = `${size}px`;
          canvas.style.height = `${size}px`;
          draw(canvas, size);
        }
      }
    });

    observer.observe(container);

    const initialSize = container.getBoundingClientRect().width;
    if (initialSize > 0) {
      sizeRef.current = initialSize;
      canvas.style.width  = `${initialSize}px`;
      canvas.style.height = `${initialSize}px`;
      draw(canvas, initialSize);
    }

    return () => observer.disconnect();
  }, [draw]);

  // ── Redraw on prop changes ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sizeRef.current === 0) return;
    // Only redraw without animation if no animation is in progress
    if (!animRef.current) {
      draw(canvas, sizeRef.current);
    }
  }, [draw]);

  // ── Cleanup RAF on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Pointer event handler ────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas || sizeRef.current === 0) return;

      const rect    = canvas.getBoundingClientRect();
      const cssSize = sizeRef.current;
      const px      = ((e.clientX - rect.left) / rect.width) * cssSize;
      const py      = ((e.clientY - rect.top)  / rect.height) * cssSize;

      const margin       = cssSize * MARGIN_RATIO + cssSize / (BOARD_SIZE - 1) / 2;
      const boardDrawSize = cssSize - 2 * margin;
      const spacing      = boardDrawSize / (BOARD_SIZE - 1);

      const hit = pixelToGrid(px, py, margin, spacing);
      if (!hit) return;

      const { gx, gy } = hit;
      if (grid[gy]?.[gx] !== Stone.Empty) return;

      onPlay(gx, gy);
    },
    [disabled, grid, onPlay]
  );

  // ── Hover handler (ghost preview, desktop) ────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      // Only react to mouse/pen (not touch, which has pointerType === "touch")
      if (e.pointerType === "touch") return;

      const canvas = canvasRef.current;
      if (!canvas || sizeRef.current === 0) return;

      const rect    = canvas.getBoundingClientRect();
      const cssSize = sizeRef.current;
      const px      = ((e.clientX - rect.left) / rect.width) * cssSize;
      const py      = ((e.clientY - rect.top)  / rect.height) * cssSize;

      const margin       = cssSize * MARGIN_RATIO + cssSize / (BOARD_SIZE - 1) / 2;
      const boardDrawSize = cssSize - 2 * margin;
      const spacing      = boardDrawSize / (BOARD_SIZE - 1);

      const hit = pixelToGrid(px, py, margin, spacing);
      const prev = hoverRef.current;

      if (!hit) {
        if (prev !== null) {
          hoverRef.current = null;
          if (!animRef.current) draw(canvas, cssSize);
        }
        return;
      }

      const { gx, gy } = hit;
      // Only hover on empty intersections
      if (grid[gy]?.[gx] !== Stone.Empty) {
        if (prev !== null) {
          hoverRef.current = null;
          if (!animRef.current) draw(canvas, cssSize);
        }
        return;
      }

      if (!prev || prev.gx !== gx || prev.gy !== gy) {
        hoverRef.current = { gx, gy };
        if (!animRef.current) draw(canvas, cssSize);
      }
    },
    [disabled, grid, draw]
  );

  const handlePointerLeave = useCallback(() => {
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      const canvas = canvasRef.current;
      if (canvas && sizeRef.current > 0 && !animRef.current) {
        draw(canvas, sizeRef.current);
      }
    }
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full aspect-square select-none"
      style={{
        touchAction: "none",
        borderRadius: "6px",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,210,100,0.12)",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          display: "block",
          touchAction: "none",
          cursor: disabled ? "default" : "crosshair",
          borderRadius: "6px",
        }}
      />
    </div>
  );
}
