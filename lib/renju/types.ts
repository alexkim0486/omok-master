// Core domain types for the Renju (오목/렌주) game.
// Coordinates: x = column (0..14, left→right), y = row (0..14, top→bottom).
// grid is indexed grid[y][x]. These conventions match the Gomocup protocol
// used by the Rapfi engine, where a move is sent/received as "x,y".

export const BOARD_SIZE = 15;

export enum Stone {
  Empty = 0,
  Black = 1, // first player; restricted by Renju forbidden-move rules
  White = 2, // second player; unrestricted
}

export type Player = Stone.Black | Stone.White;

export interface Point {
  x: number;
  y: number;
}

export interface Move extends Point {
  player: Player;
}

/** grid[y][x] holds a Stone value. */
export type Grid = Stone[][];

/** The four line directions used for win / pattern scanning. */
export const DIRECTIONS: ReadonlyArray<Readonly<[number, number]>> = [
  [1, 0], // horizontal —
  [0, 1], // vertical |
  [1, 1], // diagonal ＼
  [1, -1], // anti-diagonal ／
];

export type ForbiddenReason = "double-three" | "double-four" | "overline";

export type GameResult =
  | { kind: "ongoing" }
  | { kind: "win"; player: Player; line: Point[] }
  | { kind: "forbidden"; player: Stone.Black; point: Point; reason: ForbiddenReason }
  | { kind: "draw" };

export const opponent = (p: Player): Player =>
  p === Stone.Black ? Stone.White : Stone.Black;
