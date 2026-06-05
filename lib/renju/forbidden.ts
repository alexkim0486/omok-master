// Renju forbidden-move detector (RIF rules).
//
// Forbidden moves apply ONLY to Black. White is never restricted.
// A Black move is forbidden if, after placing it, it creates ANY of:
//   1. OVERLINE  (장목): six or more black stones in a row.
//   2. DOUBLE-FOUR (사사 / 4-4): two or more distinct "fours".
//   3. DOUBLE-THREE (삼삼 / 3-3): two or more distinct "open threes".
//
// WIN PRECEDENCE: if the move makes an EXACT five anywhere, it is a win and is
// never forbidden — checked first.
//
// Coordinates: x = column 0..14, y = row 0..14, grid[y][x]. See types.ts.

import { BOARD_SIZE, DIRECTIONS, ForbiddenReason, Grid, Point, Stone } from "./types";
import { inBounds } from "./board";

// ---------------------------------------------------------------------------
// Recursion guard
// ---------------------------------------------------------------------------
// Open-three detection is recursive: a three is a genuine "open three" only if
// the empty point that would promote it to an open four is itself a LEGAL black
// move (placing there is not forbidden). That re-enters isForbidden, which can
// re-enter three detection, and so on.
//
// Standard Renju implementations bound this with a recursion depth limit. We
// cap the nesting depth: at the deepest level we conservatively *stop* treating
// double-three as forbidden (we still report overline / double-four, which are
// not recursive). MAX_DEPTH = 8 is far beyond any practical Renju position; a
// real recursive 3-3 chain on a 15x15 board never approaches it.
const MAX_DEPTH = 8;

// A small read-only view of one direction's stone values along a window.
type Cell = Stone | "off"; // "off" = off-board

// Window radius. We read offsets [-RADIUS .. +RADIUS] around the candidate.
// RADIUS = 5 (window length 11, center index 5) is enough to cover every
// pattern we classify: a broken four spans 5 cells, an open four spans 6 cells
// (_BBBB_), and we must also inspect the cell BEYOND each open-four bracket to
// reject overline-producing completions — that reaches offset ±5 from center.
const RADIUS = 5;
const CENTER = RADIUS; // index of the candidate within the window

/**
 * Read the stone values along direction (dx,dy) for offsets
 * [-RADIUS .. +RADIUS] around (x,y), treating (x,y) itself as Black (the
 * candidate / hypothetical stone). Off-board positions are marked "off".
 * Returns a window with the center (offset 0) at index CENTER.
 */
function readWindow(
  grid: Grid,
  x: number,
  y: number,
  dx: number,
  dy: number,
): Cell[] {
  const win: Cell[] = [];
  for (let i = -RADIUS; i <= RADIUS; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (i === 0) {
      win.push(Stone.Black); // the hypothetical move
    } else if (!inBounds(nx, ny)) {
      win.push("off");
    } else {
      win.push(grid[ny][nx]);
    }
  }
  return win;
}

// Per-direction classification results, summed across all 4 directions.
interface Shapes {
  hasFive: boolean; // exact five in this direction (win)
  overline: boolean; // 6+ in a row
  fours: number; // number of distinct fours created
  openThrees: number; // number of distinct open threes created
}

/**
 * Maximal run length of consecutive Black through the center of a window.
 * The window center (index 4) is Black by construction.
 */
function centerRunLength(win: Cell[]): number {
  let len = 1;
  for (let i = CENTER + 1; i < win.length && win[i] === Stone.Black; i++) len++;
  for (let i = CENTER - 1; i >= 0 && win[i] === Stone.Black; i--) len++;
  return len;
}

/**
 * Within a window, count "fours" contributed by the center stone in this
 * direction. A four is a 5-window of black stones with exactly one empty cell
 * such that filling that empty cell yields EXACTLY five consecutive black
 * stones (not an overline) — and the center stone is part of that five.
 *
 * COUNTING RULE (RIF): a "four" is a ROW of four stones, counted once per
 * distinct four-row — NOT once per completion point. The classic subtlety is
 * the STRAIGHT / OPEN FOUR `_BBBB_`, which has two completion points but is a
 * SINGLE four (so an open four alone is legal, never a double-four). Two fours
 * along one line is only possible when the two completions complete DIFFERENT
 * sets of four black stones (e.g. `BB_BB_BB` type shapes).
 *
 * Implementation: enumerate every empty cell c whose fill makes an exact five
 * through the center. For each, record the 4 OTHER black cells of that five
 * (the four-row that c completes). Collapse completions that share the same
 * four-row into one four. The number of distinct four-rows is the four count.
 */
function countFours(win: Cell[]): number {
  const fourRows = new Set<string>();
  for (let c = 0; c < win.length; c++) {
    if (win[c] !== Stone.Empty) continue;
    const test = win.slice();
    test[c] = Stone.Black;
    const bounds = fiveRunBounds(test, CENTER);
    if (!bounds) continue; // no exact five through center
    if (c < bounds[0] || c > bounds[1]) continue; // five must include c
    // The four-row is the five-run minus the completion cell c.
    const fourCells: number[] = [];
    for (let i = bounds[0]; i <= bounds[1]; i++) {
      if (i !== c) fourCells.push(i);
    }
    fourRows.add(fourCells.join(","));
  }
  return fourRows.size;
}

/**
 * If there is a maximal consecutive black run through `center` of length
 * exactly 5, return its [start,end] indices; otherwise null. A run of length
 * 6+ (overline) returns null (not an exact five).
 */
function fiveRunBounds(test: Cell[], center: number): [number, number] | null {
  if (test[center] !== Stone.Black) return null;
  let start = center;
  while (start - 1 >= 0 && test[start - 1] === Stone.Black) start--;
  let end = center;
  while (end + 1 < test.length && test[end + 1] === Stone.Black) end++;
  const len = end - start + 1;
  if (len === 5) return [start, end];
  return null;
}

/**
 * Count distinct "open threes" contributed by the center stone in this
 * direction. An open three is a three that can be promoted to an OPEN FOUR
 * (a four with two completion points — unstoppable) by adding one black stone
 * at some empty point P, where placing at P is itself a LEGAL black move.
 *
 * COUNTING RULE: like a four, a "three" is a ROW counted once per distinct
 * three-row — NOT once per promotion point. For example `__BBB__` can be
 * promoted to an open four by adding black on EITHER side, yet it is a SINGLE
 * open three. We therefore group promotion points by the three-row (the set of
 * black cells of the open four, excluding the just-added promotion stone P) and
 * count distinct three-rows.
 *
 * For each empty cell P: hypothetically place black at P, test whether the
 * resulting shape (this same direction) is an OPEN FOUR through the center. If
 * so — and if P is a LEGAL move (recursively not forbidden) — the underlying
 * three is a genuine open three. The legality check on P is what makes
 * double-three detection recursive.
 */
function countOpenThrees(
  grid: Grid,
  x: number,
  y: number,
  dx: number,
  dy: number,
  win: Cell[],
  depth: number,
): number {
  // win index i corresponds to board cell (x + dx*(i-CENTER), y + dy*(i-CENTER)).
  const threeRows = new Set<string>();
  for (let p = 0; p < win.length; p++) {
    if (win[p] !== Stone.Empty) continue;
    const test = win.slice();
    test[p] = Stone.Black;
    // After adding black at p, is there an OPEN FOUR through the center?
    const four = openFourBounds(test, CENTER);
    if (!four) continue;
    // P must be PART of that open four — otherwise the open four already existed
    // without P (e.g. the line is already a four), so P did not promote a three.
    if (p < four[0] || p > four[1]) continue;

    // Coordinates of P on the real board.
    const off = p - CENTER;
    const px = x + dx * off;
    const py = y + dy * off;
    if (!inBounds(px, py)) continue;
    if (grid[py][px] !== Stone.Empty) continue;

    // Recursive legality: placing black at P (in addition to the candidate at
    // (x,y)) must itself be a legal black move. We evaluate P on a grid that
    // already contains the candidate stone.
    let legal: boolean;
    if (depth + 1 > MAX_DEPTH) {
      // Depth-limit reached: conservatively treat P as legal so we do not
      // under-report (this branch is effectively unreachable in practice).
      legal = true;
    } else {
      const g2 = grid.map((row) => row.slice());
      g2[y][x] = Stone.Black; // candidate already placed
      legal = isForbiddenInner(g2, px, py, depth + 1) === null;
    }
    if (!legal) continue;

    // The three-row = the open four's black cells minus the promotion cell P.
    const threeCells: number[] = [];
    for (let i = four[0]; i <= four[1]; i++) {
      if (i !== p) threeCells.push(i);
    }
    threeRows.add(threeCells.join(","));
  }
  return threeRows.size;
}

/**
 * If there is an OPEN FOUR through `center` in this window, return the [start,
 * end] indices of its four black cells; otherwise null. An open four is a run
 * of exactly four consecutive black stones with BOTH bracketing cells empty
 * (two ways to make five — cannot be blocked by one stone), where neither
 * completion produces an overline.
 *
 * Shape: _ B B B B _  (with the center among the four B's).
 */
function openFourBounds(test: Cell[], center: number): [number, number] | null {
  if (test[center] !== Stone.Black) return null;
  let start = center;
  while (start - 1 >= 0 && test[start - 1] === Stone.Black) start--;
  let end = center;
  while (end + 1 < test.length && test[end + 1] === Stone.Black) end++;
  const len = end - start + 1;
  if (len !== 4) return null;
  const before = start - 1;
  const after = end + 1;
  if (before < 0 || after >= test.length) return null;
  if (test[before] !== Stone.Empty || test[after] !== Stone.Empty) return null;
  // Filling either bracket must yield an EXACT five (not an overline). The run
  // is exactly four with both brackets empty, so filling one bracket gives five;
  // ensure the cell beyond each bracket is not black (else that side overlines).
  const beyondBefore = before - 1;
  const beyondAfter = after + 1;
  const beforeOk = beyondBefore < 0 || test[beyondBefore] !== Stone.Black;
  const afterOk = beyondAfter >= test.length || test[beyondAfter] !== Stone.Black;
  // A true open four requires BOTH completions to produce a clean five. If one
  // side would overline, that side is not a real completion, making it a simple
  // four (not an open four).
  if (!beforeOk || !afterOk) return null;
  return [start, end];
}

/**
 * Analyze all four directions for the candidate at (x,y), which is assumed to
 * already be placed as Black on `grid`. Returns aggregated shape counts.
 */
function analyze(grid: Grid, x: number, y: number, depth: number): Shapes {
  const result: Shapes = {
    hasFive: false,
    overline: false,
    fours: 0,
    openThrees: 0,
  };

  for (const [dx, dy] of DIRECTIONS) {
    const win = readWindow(grid, x, y, dx, dy);
    const runLen = centerRunLength(win);

    if (runLen === 5) result.hasFive = true;
    if (runLen >= 6) result.overline = true;

    // Count fours and open threes in this direction.
    result.fours += countFours(win);
    result.openThrees += countOpenThrees(grid, x, y, dx, dy, win, depth);
  }

  return result;
}

/**
 * Internal forbidden check operating on a grid where (x,y) is currently EMPTY.
 * `depth` tracks recursion for open-three legality.
 */
function isForbiddenInner(
  grid: Grid,
  x: number,
  y: number,
  depth: number,
): ForbiddenReason | null {
  if (!inBounds(x, y)) return null;
  if (grid[y][x] !== Stone.Empty) return null; // not a placeable empty cell

  // Place the candidate black stone on a copy.
  const g = grid.map((row) => row.slice());
  g[y][x] = Stone.Black;

  const shapes = analyze(g, x, y, depth);

  // WIN PRECEDENCE: exact five anywhere ⇒ legal (it wins), regardless of any
  // overline / double-four / double-three elsewhere.
  if (shapes.hasFive) return null;

  // Overline: six or more in a row (only reachable when there is no exact five).
  if (shapes.overline) return "overline";

  // Double-four: two or more distinct fours.
  if (shapes.fours >= 2) return "double-four";

  // Double-three: two or more distinct open threes.
  if (shapes.openThrees >= 2) return "double-three";

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate placing a BLACK stone at (x,y) on `grid` (which must have (x,y)
 * empty). Returns the forbidden reason, or null if the move is legal for Black.
 */
export function isForbidden(
  grid: Grid,
  x: number,
  y: number,
): ForbiddenReason | null {
  return isForbiddenInner(grid, x, y, 0);
}

/**
 * Scan all empty cells and return every point that is forbidden for Black,
 * with its reason.
 */
export function forbiddenPoints(
  grid: Grid,
): Array<{ point: Point; reason: ForbiddenReason }> {
  const out: Array<{ point: Point; reason: ForbiddenReason }> = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (grid[y][x] !== Stone.Empty) continue;
      const reason = isForbidden(grid, x, y);
      if (reason) out.push({ point: { x, y }, reason });
    }
  }
  return out;
}
