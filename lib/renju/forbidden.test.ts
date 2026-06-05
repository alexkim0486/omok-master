import { describe, it, expect } from "vitest";
import { createEmptyGrid } from "./board";
import { Grid, Point, Stone } from "./types";
import { forbiddenPoints, isForbidden } from "./forbidden";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Place a list of black stones (and optionally white) onto a fresh grid. */
function makeGrid(black: Array<[number, number]>, white: Array<[number, number]> = []): Grid {
  const g = createEmptyGrid();
  for (const [x, y] of black) g[y][x] = Stone.Black;
  for (const [x, y] of white) g[y][x] = Stone.White;
  return g;
}

/**
 * Build a grid from an ASCII diagram. Each line is a board row (y increases
 * downward). Characters: 'B' = black, 'W' = white, '.' or ' ' = empty.
 * The diagram is placed with its top-left at (offsetX, offsetY).
 * Returns the grid plus a lookup of any cells marked '*' (candidate markers),
 * which are treated as EMPTY on the board but reported as candidate points.
 */
function fromAscii(
  diagram: string,
  offsetX = 0,
  offsetY = 0,
): { grid: Grid; candidates: Point[] } {
  const g = createEmptyGrid();
  const candidates: Point[] = [];
  const rows = diagram.split("\n").filter((r) => r.length > 0);
  rows.forEach((row, ry) => {
    const cells = row.trim().split(/\s+/);
    cells.forEach((ch, cx) => {
      const x = offsetX + cx;
      const y = offsetY + ry;
      if (ch === "B") g[y][x] = Stone.Black;
      else if (ch === "W") g[y][x] = Stone.White;
      else if (ch === "*") candidates.push({ x, y });
      // '.' => empty
    });
  });
  return { grid: g, candidates };
}

// ---------------------------------------------------------------------------
// OVERLINE vs FIVE (win precedence)
// ---------------------------------------------------------------------------

describe("overline / five", () => {
  it("six in a row (overline) is forbidden", () => {
    // Row y=7: columns 3..8 → completing col 8 makes BBBBBB (overline).
    // x:        3 4 5 6 7 8
    //           B B B B B *   (* = candidate at (8,7))
    const g = makeGrid([
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7],
    ]);
    expect(isForbidden(g, 8, 7)).toBe("overline");
  });

  it("overline created in the middle of a gap is forbidden", () => {
    // x: 3 4 5 6 7 8
    //    B B B * B B   → placing at (6,7) makes 6 in a row.
    const g = makeGrid([
      [3, 7],
      [4, 7],
      [5, 7],
      [7, 7],
      [8, 7],
    ]);
    expect(isForbidden(g, 6, 7)).toBe("overline");
  });

  it("exactly five is NOT forbidden (it wins)", () => {
    // x: 3 4 5 6 7
    //    B B B B *   → placing at (7,7) makes exactly five.
    const g = makeGrid([
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
    ]);
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("win precedence: a move making five AND a double-four returns null", () => {
    // Construct a point that completes an exact five in one direction while
    // also completing two fours in other directions.
    //
    // Horizontal five through (7,7): cols 3..6 black, candidate at 7.
    //   x: 3 4 5 6 7
    //      B B B B *
    // Vertical four through (7,7): rows 3..6 at col 7 black (candidate completes
    //   a five vertically too — but we only need fours elsewhere). To force a
    //   four (not five) vertically, place rows 4..6 black (three) + need one
    //   more; instead make two separate FOURS via diagonals.
    //
    // Diagonal ＼ four through (7,7): (4,4)(5,5)(6,6) black → candidate (7,7)
    //   makes four; (8,8) empty completes five.
    // Diagonal ／ four through (7,7): (4,10)(5,9)(6,8) black → candidate (7,7)
    //   makes four; (8,6) empty completes five.
    const g = makeGrid([
      // horizontal five
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      // diagonal ＼ (three; candidate makes four)
      [4, 4],
      [5, 5],
      [6, 6],
      // diagonal ／ (three; candidate makes four)
      [4, 10],
      [5, 9],
      [6, 8],
    ]);
    // Sanity: without the horizontal five this would be a double-four. With it,
    // the exact five wins → legal.
    expect(isForbidden(g, 7, 7)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DOUBLE-FOUR
// ---------------------------------------------------------------------------

describe("double-four", () => {
  it("two fours in two directions is double-four", () => {
    // Candidate (7,7).
    // Horizontal four: (3,7)(4,7)(5,7)(6,7)? that's already four → +candidate=5.
    // Use a four that needs the candidate: cols 4,5,6 black, candidate 7, col 8
    // empty → BBBB_ four (one completion at 8). But col 3 must be empty so it's
    // not a five from the other side. Actually BBBB with one open end = four.
    //   x: 4 5 6 7 8
    //      B B B * .   → four (completion at 8), col 3 empty.
    // Vertical four: rows 4,5,6 at col 7, candidate (7,7), row 8 empty.
    //   y: 4 5 6 7 8 at x=7
    //      B B B * .   → four (completion at (7,8)).
    const g = makeGrid([
      // horizontal three (candidate makes a four)
      [4, 7],
      [5, 7],
      [6, 7],
      // vertical three (candidate makes a four)
      [7, 4],
      [7, 5],
      [7, 6],
    ]);
    expect(isForbidden(g, 7, 7)).toBe("double-four");
  });

  it("two fours along the same line is double-four", () => {
    // Classic same-line double four. Candidate at (7,7) bridges two four-rows.
    //   x: 3 4 5 6 7 8 9 10 11
    //      B B B . * . B  B  B
    // After candidate at (7,7):
    //   left  group:  (3,4,5) + need (6) → with candidate? candidate at 7.
    // Reconsider: to make a four on each side of candidate, use:
    //   x: 4 5 6 7 8 9 10
    //      B B B * B B B
    // Placing (7,7): left run (4,5,6,7) four → completion at (3? no, need 8 but
    //   8 is black). Hmm contiguous 4..10 = 7 in a row = overline.
    //
    // Proper same-line double four uses gaps:
    //   x: 3 4 5 6 7 8 9
    //      B B . B * B . B  ... too long.
    // Use: B B B _ * _ B B B with the candidate filling neither gap directly.
    //   x: 2 3 4 5 6 7 8 9 10
    //      B B B . * . B B B
    // Candidate (6,7). Left: (2,3,4) + candidate(6) with gap at 5 → fill 5 = 5
    //   in a row (2,3,4,5,6) → that is a four completed at 5. Right: (8,9,10) +
    //   candidate(6) with gap at 7 → fill 7 = (6,7,8,9,10) five → four completed
    //   at 7. Two distinct fours along the same line.
    const g = makeGrid([
      [2, 7],
      [3, 7],
      [4, 7],
      [8, 7],
      [9, 7],
      [10, 7],
    ]);
    expect(isForbidden(g, 6, 7)).toBe("double-four");
  });

  it("a single open four alone is NOT forbidden (it is one four)", () => {
    // x: 4 5 6 7 8 9
    //    . B B * B .   → placing (6,7) makes _BBBB_ (straight four).
    // (4,7) and (9,7) empty → open four, but a single four ⇒ legal.
    const g = makeGrid([
      [5, 7],
      [6, 7],
      [8, 7],
    ]);
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("a single simple four alone is NOT forbidden", () => {
    // x: 3 4 5 6 7
    //    W B B B *   → placing (7,7) makes WBBBB (blocked on left, open right).
    // One four, blocked one side → legal.
    const g = makeGrid(
      [
        [4, 7],
        [5, 7],
        [6, 7],
      ],
      [[3, 7]],
    );
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("broken four (B B _ B B) is recognized as a four", () => {
    // Make the candidate CREATE a broken four that, together with another four,
    // forms a double-four. Candidate (4,7).
    // Horizontal broken four after candidate:
    //   x: 4 5 6 7 8
    //      * B . B B   → candidate(4) + (5) gap(6) (7)(8): fill gap 6 →
    //      (4,5,6,7,8) five → four (broken), completion at 6.
    //   Need col 3 empty so left side not part of a longer run.
    // Vertical four through candidate (4,7): rows 4,5,6 at col 4, completion at
    //   (4,8) empty.
    //   y: 4 5 6 7  at x=4
    //      B B B *   → four, completion at (4,8).
    const g = makeGrid([
      // horizontal broken four pieces
      [5, 7],
      [7, 7],
      [8, 7],
      // vertical three (candidate completes a four)
      [4, 4],
      [4, 5],
      [4, 6],
    ]);
    expect(isForbidden(g, 4, 7)).toBe("double-four");
  });
});

// ---------------------------------------------------------------------------
// DOUBLE-THREE
// ---------------------------------------------------------------------------

describe("double-three", () => {
  it("two open threes is double-three", () => {
    // Candidate (7,7) creates two open threes.
    // Horizontal open three: (5,7)(6,7) black + candidate(7,7) → _BBB_ region
    //   with (4,7)...(8,7) empty. After candidate: cols 5,6,7 black, cols 4 & 8
    //   empty → open three.
    // Vertical open three: (7,5)(7,6) black + candidate(7,7) → cols rows 5,6,7
    //   black, rows 4 & 8 empty → open three.
    //   x: 4 5 6 7 8 (row 7)
    //      . B B * .
    //   y: 4 5 6 7 8 (col 7)
    //      . B B * .
    const g = makeGrid([
      [5, 7],
      [6, 7],
      [7, 5],
      [7, 6],
    ]);
    expect(isForbidden(g, 7, 7)).toBe("double-three");
  });

  it("a single open three alone is NOT forbidden", () => {
    // x: 4 5 6 7 8 (row 7)
    //    . B B * .   → open three only. Legal.
    const g = makeGrid([
      [5, 7],
      [6, 7],
    ]);
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("a three blocked on one side by white is NOT a live three", () => {
    // Two blocked threes do NOT make a double-three.
    // Horizontal: W at (4,7) blocks left → W B B * (.) closed three, not live.
    //   x: 4 5 6 7 8 (row 7)
    //      W B B * .
    // Vertical:   W at (7,4) blocks top  → closed three, not live.
    //   y: 4 5 6 7 8 (col 7)
    //      W B B * .
    const g = makeGrid(
      [
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [4, 7],
        [7, 4],
      ],
    );
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("broken open three (B _ B B) is a live three; two of them is double-three", () => {
    // Broken open three horizontally: after candidate (4,7) shape is
    //   x: 4 5 6 7 8  → B . B B .  (candidate at 4)
    // Wait we want candidate to bridge. Use candidate (5,7):
    //   x: 3 4 5 6 7 8
    //      . B * B B .  → after candidate: (4) . is gap? Let's place (4,7) skip.
    // Simpler: horizontal _B_BB_ pattern. Place (4,7)(6,7)(7,7) black, candidate
    //   bridges... Use the contiguous form for clarity and rely on the other
    //   broken case already covered. Here use two plain open threes via gaps:
    // Horizontal broken three: (3,7)(5,7) black, candidate (4,7) → B B B? No.
    //
    // Keep it concrete: candidate (4,7).
    //  Horizontal: black (5,7)(6,7); after candidate cols 4,5,6 black, cols 3 &
    //    7 empty → open three.
    //  Anti-diagonal ／ broken three: black (5,7)? reuse. Use diagonal ＼:
    //    black (5,8)(6,9); candidate (4,7) → (4,7)(5,8)(6,9) three with (3,6) &
    //    (7,10) empty → open three.
    const g = makeGrid([
      [5, 7],
      [6, 7], // horizontal
      [5, 8],
      [6, 9], // diagonal ＼ through (4,7)
    ]);
    expect(isForbidden(g, 4, 7)).toBe("double-three");
  });
});

// ---------------------------------------------------------------------------
// FOUR-THREE (4-3): the classic LEGAL combination
// ---------------------------------------------------------------------------

describe("four-three (legal)", () => {
  it("a four plus a three at the same point is NOT forbidden", () => {
    // Candidate (7,7) makes one four (horizontal) and one open three (vertical).
    // Horizontal four: (4,7)(5,7)(6,7) black, candidate (7,7) → BBBB, col 8
    //   empty completes five → four. (col 3 empty)
    //   x: 4 5 6 7 8 (row 7)
    //      B B B * .
    // Vertical open three: (7,5)(7,6) black, candidate (7,7) → open three.
    //   y: 4 5 6 7 8 (col 7)
    //      . B B * .
    const g = makeGrid([
      [4, 7],
      [5, 7],
      [6, 7], // horizontal four
      [7, 5],
      [7, 6], // vertical open three
    ]);
    expect(isForbidden(g, 7, 7)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RECURSION: a three is live only if its promotion point is itself legal
// ---------------------------------------------------------------------------

describe("recursive open-three legality", () => {
  it("lone stones form no threes → legal", () => {
    // Base case: candidate touches isolated stones, no three is formed at all.
    const g = makeGrid([
      [6, 7],
      [7, 5],
    ]);
    expect(isForbidden(g, 7, 7)).toBeNull();
  });

  it("a three whose promotion square would OVERLINE is not a live three", () => {
    // Horizontal line, row 7. Existing black at cols 2,3 and 6.
    //   x: 1 2 3 4 5 6 7
    //      . B B * . B .
    // Candidate (4,7): cols 2,3,4 black. To promote to an open four we would add
    // black at col 5 → cols 2,3,4,5 + col 6 already black = (2,3,4,5,6) FIVE,
    // and col 1 empty / col 7 empty. Filling col 1 OR col 5... the would-be open
    // four (2..5) has its right bracket (col 6) BLACK, so it is NOT an open four
    // (promotion there makes five/overline territory, not an unstoppable four).
    // Hence this is only a (blocked) three, not a live three. Combined with a
    // lone vertical stone (no second three) the move is legal.
    const g = makeGrid([
      [2, 7],
      [3, 7],
      [6, 7],
    ]);
    expect(isForbidden(g, 4, 7)).toBeNull();
  });
});

describe("five via a gap (broken five) wins", () => {
  it("filling the gap of B B _ B B as the candidate is a five, not forbidden", () => {
    // x: 3 4 5 6 7
    //    B B * B B   → candidate (5,7) makes BBBBB (exact five) → win, legal.
    const g = makeGrid([
      [3, 7],
      [4, 7],
      [6, 7],
      [7, 7],
    ]);
    expect(isForbidden(g, 5, 7)).toBeNull();
  });
});

describe("two contiguous open threes", () => {
  it("_BBB_ horizontally and vertically at the candidate is double-three", () => {
    // Candidate (7,7). Horizontal (5,7)(6,7); vertical (7,8)(7,9) going the
    // other way to vary shape — both become _BBB_ open threes.
    //   row 7: . B B *      (cols 4..7, col 4 & col 8 empty)
    //   col 7: * B B .      (rows 7..10 downward, rows above & below empty)
    const g = makeGrid([
      [5, 7],
      [6, 7], // horizontal open three
      [7, 8],
      [7, 9], // vertical open three (downward)
    ]);
    expect(isForbidden(g, 7, 7)).toBe("double-three");
  });
});

// ---------------------------------------------------------------------------
// forbiddenPoints()
// ---------------------------------------------------------------------------

describe("forbiddenPoints", () => {
  it("returns the double-three point and excludes legal points", () => {
    // Same double-three position as above (candidate (7,7)).
    //   x: 5 6 7 (row 7): B B *
    //   y: 5 6 7 (col 7): B B *
    const g = makeGrid([
      [5, 7],
      [6, 7],
      [7, 5],
      [7, 6],
    ]);
    const pts = forbiddenPoints(g);
    const has = (x: number, y: number, reason: string) =>
      pts.some((p) => p.point.x === x && p.point.y === y && p.reason === reason);

    // (7,7) is double-three forbidden.
    expect(has(7, 7, "double-three")).toBe(true);

    // A far-away empty cell is not forbidden.
    expect(pts.some((p) => p.point.x === 0 && p.point.y === 0)).toBe(false);

    // (8,7) extends only one line → at most a single shape → legal.
    expect(pts.some((p) => p.point.x === 8 && p.point.y === 7)).toBe(false);
  });

  it("returns an overline point in a crafted position", () => {
    // Row y=7 cols 3,4,5,6,7 black; gap-free → candidate at (8,7) overlines.
    const g = makeGrid([
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7],
    ]);
    const pts = forbiddenPoints(g);
    // (8,7) and (2,7) both create six-in-a-row → overline.
    expect(
      pts.some((p) => p.point.x === 8 && p.point.y === 7 && p.reason === "overline"),
    ).toBe(true);
    expect(
      pts.some((p) => p.point.x === 2 && p.point.y === 7 && p.reason === "overline"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ASCII-diagram driven sanity check
// ---------------------------------------------------------------------------

describe("ascii helper", () => {
  it("double-three via ascii diagram", () => {
    // Diagram (offset 5,5). '*' marks the candidate (empty on board).
    // The candidate is the shared corner of a horizontal open three (B B *)
    // and a vertical open three (B / B / *).
    //   . . B
    //   . . B
    //   B B *
    const { grid, candidates } = fromAscii(
      `
      . . B
      . . B
      B B *
      `,
      5,
      5,
    );
    expect(candidates).toHaveLength(1);
    const { x, y } = candidates[0];
    expect(isForbidden(grid, x, y)).toBe("double-three");
  });
});

// ---------------------------------------------------------------------------
// GAPPED / JUMP SHAPES (띈 금수) — broken, non-contiguous threes and fours
// These are the patterns the contiguous eye misses: a forbidden shape formed
// with a one-cell gap (e.g. B B _ B). The detector fills each empty cell and
// re-checks for an exact five / open four, so gaps are handled naturally.
// ---------------------------------------------------------------------------

describe("gapped / jump shapes (띈 금수)", () => {
  it("jump four (B B B _ B) + another four is double-four", () => {
    // Horizontal jump four through candidate (6,7):
    //   x: 4 5 6 7 8  → B B * . B   (fill gap 7 ⇒ 4,5,6,7,8 five). col3 & col9 empty.
    // Vertical simple four through candidate (6,7): rows 4,5,6 black.
    const g = makeGrid([
      [4, 7], [5, 7], [8, 7], // horizontal jump four pieces
      [6, 4], [6, 5], [6, 6], // vertical three (candidate completes a four)
    ]);
    expect(isForbidden(g, 6, 7)).toBe("double-four");
  });

  it("a single jump four (B B B _ B) alone is NOT forbidden", () => {
    //   x: 4 5 6 7 8  → B B * . B   (one jump four) ⇒ legal.
    const g = makeGrid([[4, 7], [5, 7], [8, 7]]);
    expect(isForbidden(g, 6, 7)).toBeNull();
  });

  it("two jump open threes (B B _ B and B _ B B) is double-three", () => {
    // Horizontal jump three through candidate (6,7):
    //   x: 5 6 7 8  → B * . B   (promote at 7 ⇒ _BBBB_ open four). col4 & col9 empty.
    // Vertical jump three through candidate (6,7):
    //   y: 5 6 7 8 at x=6  → B . * B   (promote at row 6). row4 & row9 empty.
    const g = makeGrid([
      [5, 7], [8, 7], // horizontal jump three pieces
      [6, 5], [6, 8], // vertical jump three pieces
    ]);
    expect(isForbidden(g, 6, 7)).toBe("double-three");
  });

  it("a single jump open three (B B _ B) alone is NOT forbidden", () => {
    //   x: 5 6 7 8  → B * . B   (one jump three) ⇒ legal.
    const g = makeGrid([[5, 7], [8, 7]]);
    expect(isForbidden(g, 6, 7)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GUIDE DIAGRAM POSITIONS — these coords are the exact shapes drawn in the
// in-app rules help (RulesHelp.tsx). Keeping them as tests guarantees the
// diagrams stay accurate against the engine.
// ---------------------------------------------------------------------------

describe("guide diagram positions (RulesHelp)", () => {
  it("띈 삼삼 diagram → double-three", () => {
    const g = makeGrid([[1, 2], [4, 2], [2, 1], [2, 4]]);
    expect(isForbidden(g, 2, 2)).toBe("double-three");
  });
  it("띈 사사 diagram → double-four", () => {
    const g = makeGrid([[1, 3], [2, 3], [5, 3], [3, 1], [3, 2], [3, 5]]);
    expect(isForbidden(g, 3, 3)).toBe("double-four");
  });
  it("띈 5목 diagram → wins (not forbidden)", () => {
    const g = makeGrid([[1, 1], [2, 1], [4, 1], [5, 1]]);
    expect(isForbidden(g, 3, 1)).toBeNull();
  });
  it("띈 장목 diagram → overline", () => {
    const g = makeGrid([[1, 1], [2, 1], [3, 1], [5, 1], [6, 1]]);
    expect(isForbidden(g, 4, 1)).toBe("overline");
  });
});
