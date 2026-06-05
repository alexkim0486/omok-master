import {
  BOARD_SIZE,
  DIRECTIONS,
  Grid,
  Move,
  Point,
  Stone,
  Player,
} from "./types";

export function createEmptyGrid(): Grid {
  return Array.from({ length: BOARD_SIZE }, () =>
    new Array<Stone>(BOARD_SIZE).fill(Stone.Empty),
  );
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function stoneAt(grid: Grid, x: number, y: number): Stone {
  return inBounds(x, y) ? grid[y][x] : Stone.Empty;
}

export function isEmpty(grid: Grid, x: number, y: number): boolean {
  return inBounds(x, y) && grid[y][x] === Stone.Empty;
}

/** Rebuild a grid from an ordered move list (Black plays first). */
export function gridFromMoves(moves: Move[]): Grid {
  const grid = createEmptyGrid();
  for (const m of moves) grid[m.y][m.x] = m.player;
  return grid;
}

/**
 * Length of the maximal run of `player` stones through (x,y) along (dx,dy),
 * together with the endpoints of that run. Assumes (x,y) already holds the
 * player's stone (or is being evaluated as if it does).
 */
export function lineRun(
  grid: Grid,
  x: number,
  y: number,
  dx: number,
  dy: number,
  player: Player,
): { length: number; cells: Point[] } {
  const cells: Point[] = [{ x, y }];

  // forward
  for (let i = 1; ; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (inBounds(nx, ny) && grid[ny][nx] === player) cells.push({ x: nx, y: ny });
    else break;
  }
  // backward
  for (let i = 1; ; i++) {
    const nx = x - dx * i;
    const ny = y - dy * i;
    if (inBounds(nx, ny) && grid[ny][nx] === player) cells.unshift({ x: nx, y: ny });
    else break;
  }

  return { length: cells.length, cells };
}

/**
 * Determine whether the move at (x,y) by `player` wins the game.
 * Renju rule: White wins with five OR MORE in a row. Black wins ONLY with
 * exactly five — an overline (six or more) is not a win for Black (it is a
 * forbidden move handled separately).
 */
export function checkWin(
  grid: Grid,
  x: number,
  y: number,
  player: Player,
): { win: boolean; line: Point[] } {
  for (const [dx, dy] of DIRECTIONS) {
    const { length, cells } = lineRun(grid, x, y, dx, dy, player);
    if (player === Stone.White) {
      if (length >= 5) return { win: true, line: cells };
    } else {
      // Black: exactly five wins; overline is not a win.
      if (length === 5) return { win: true, line: cells };
    }
  }
  return { win: false, line: [] };
}

/** True if every cell is occupied (board full → draw). */
export function isBoardFull(grid: Grid): boolean {
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (grid[y][x] === Stone.Empty) return false;
  return true;
}

export const centerPoint: Point = {
  x: (BOARD_SIZE - 1) / 2,
  y: (BOARD_SIZE - 1) / 2,
};
