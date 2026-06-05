/*
 * A lightweight heuristic fallback AI. It is NOT the championship engine — it
 * is only used when the Rapfi wasm fails to load (or for a deliberately weak
 * mode), so the app is always playable. It scores each candidate move by a
 * simple offensive/defensive pattern heuristic and picks the best.
 */

import {
  BOARD_SIZE,
  DIRECTIONS,
  Grid,
  Player,
  Point,
  Stone,
  opponent,
} from "@/lib/renju/types";
import { inBounds } from "@/lib/renju/board";

// Value of an open-ended run of length n for one direction.
function runValue(count: number, openEnds: number): number {
  if (count >= 5) return 10_000_000; // five
  if (count === 4) return openEnds >= 2 ? 1_000_000 : openEnds === 1 ? 100_000 : 0;
  if (count === 3) return openEnds >= 2 ? 50_000 : openEnds === 1 ? 1_000 : 0;
  if (count === 2) return openEnds >= 2 ? 500 : openEnds === 1 ? 100 : 0;
  if (count === 1) return openEnds >= 2 ? 50 : 10;
  return 0;
}

// Evaluate placing `who` at (x,y): sum the line value over all 4 directions.
function placementScore(grid: Grid, x: number, y: number, who: Player): number {
  let total = 0;
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1; // the stone we are placing
    let openEnds = 0;

    // forward
    let fx = x + dx;
    let fy = y + dy;
    while (inBounds(fx, fy) && grid[fy][fx] === who) {
      count++;
      fx += dx;
      fy += dy;
    }
    if (inBounds(fx, fy) && grid[fy][fx] === Stone.Empty) openEnds++;

    // backward
    let bx = x - dx;
    let by = y - dy;
    while (inBounds(bx, by) && grid[by][bx] === who) {
      count++;
      bx -= dx;
      by -= dy;
    }
    if (inBounds(bx, by) && grid[by][bx] === Stone.Empty) openEnds++;

    total += runValue(count, openEnds);
  }
  return total;
}

function hasNeighbor(grid: Grid, x: number, y: number, radius = 2): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && grid[ny][nx] !== Stone.Empty) return true;
    }
  }
  return false;
}

/** Choose a move for `player`. Returns null only if the board is full. */
export function chooseMove(grid: Grid, player: Player): Point | null {
  const center = (BOARD_SIZE - 1) / 2;
  let best: Point | null = null;
  let bestScore = -1;
  let anyEmpty = false;
  const foe = opponent(player);

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (grid[y][x] !== Stone.Empty) continue;
      anyEmpty = true;
      if (!hasNeighbor(grid, x, y)) continue;

      // Offense + weighted defense (block opponent threats).
      const offense = placementScore(grid, x, y, player);
      const defense = placementScore(grid, x, y, foe);
      // Slight bias toward the center to break ties.
      const centerBias = -(Math.abs(x - center) + Math.abs(y - center));
      const score = offense + 0.9 * defense + centerBias * 0.01;

      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }

  if (best) return best;
  // No stone-adjacent cell (e.g., empty board): play the center.
  if (anyEmpty) return { x: center, y: center };
  return null;
}
