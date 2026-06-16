"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_SIZE,
  Grid,
  Move,
  Player,
  Point,
  Stone,
  opponent,
} from "@/lib/renju/types";
import { checkWin, gridFromMoves, isBoardFull } from "@/lib/renju/board";
import { forbiddenPoints } from "@/lib/renju/forbidden";
import { RapfiEngine, sideToMove } from "@/lib/ai/rapfiClient";
import { chooseMove } from "@/lib/ai/simpleAi";

export type Difficulty = "easy" | "normal" | "hard" | "master";

interface DifficultyPreset {
  timeoutMs: number;
  strength: number; // 0..100
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: { timeoutMs: 300, strength: 40 },
  normal: { timeoutMs: 1000, strength: 70 },
  hard: { timeoutMs: 3000, strength: 100 },
  master: { timeoutMs: 8000, strength: 100 }, // 세계 최강
};

export type GameStatus =
  | { kind: "playing" }
  | { kind: "won"; winner: Player; line: Point[] }
  | { kind: "draw" };

export type EngineState = "loading" | "ready" | "fallback";

export interface GameView {
  grid: Grid;
  moves: Move[];
  currentPlayer: Player;
  humanColor: Player;
  status: GameStatus;
  thinking: boolean;
  forbidden: Point[];
  lastMove: Point | null;
  winLine: Point[];
  engineState: EngineState;
  loadingProgress: number;
  difficulty: Difficulty;
  // actions
  playAt: (x: number, y: number) => void;
  newGame: (humanColor?: Player, difficulty?: Difficulty) => void;
  undo: () => void;
  resign: () => void;
  setDifficulty: (d: Difficulty) => void;
  canUndo: boolean;
}

export function useGame(): GameView {
  const [moves, setMoves] = useState<Move[]>([]);
  const [humanColor, setHumanColor] = useState<Player>(Stone.Black);
  const [difficulty, setDifficultyState] = useState<Difficulty>("master");
  const [status, setStatus] = useState<GameStatus>({ kind: "playing" });
  const [thinking, setThinking] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [loadingProgress, setLoadingProgress] = useState(0);
  // 무르기는 한 게임당 1회만 허용.
  const [undoUsed, setUndoUsed] = useState(false);

  const engineRef = useRef<RapfiEngine | null>(null);
  // Increments on every new game so stale async AI results can be discarded.
  const gameIdRef = useRef(0);

  // --- engine lifecycle (client only) ---
  useEffect(() => {
    const engine = new RapfiEngine();
    engineRef.current = engine;
    engine.onProgress = (f) => setLoadingProgress(f);
    let cancelled = false;
    engine
      .init()
      .then(() => {
        if (!cancelled) {
          setEngineState("ready");
          setLoadingProgress(1);
        }
      })
      .catch(() => {
        if (!cancelled) setEngineState("fallback");
      });
    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const grid = useMemo<Grid>(() => gridFromMoves(moves), [moves]);
  const currentPlayer = sideToMove(moves.length);
  const aiColor = opponent(humanColor);
  const lastMove = moves.length ? { x: moves[moves.length - 1].x, y: moves[moves.length - 1].y } : null;
  const winLine = status.kind === "won" ? status.line : [];

  // Forbidden points are only meaningful for Black, and only worth showing
  // while it is the human Black player's turn to choose.
  const forbidden = useMemo<Point[]>(() => {
    if (status.kind !== "playing") return [];
    if (currentPlayer !== Stone.Black) return [];
    if (humanColor !== Stone.Black) return [];
    return forbiddenPoints(grid).map((f) => f.point);
  }, [grid, currentPlayer, humanColor, status.kind]);

  const forbiddenSet = useMemo(
    () => new Set(forbidden.map((p) => p.x + "," + p.y)),
    [forbidden],
  );

  // Apply a move and resolve win/draw. Returns nothing.
  const applyMove = useCallback((x: number, y: number, player: Player) => {
    setMoves((prev) => {
      const next = [...prev, { x, y, player }];
      const g = gridFromMoves(next);
      const { win, line } = checkWin(g, x, y, player);
      if (win) {
        setStatus({ kind: "won", winner: player, line });
      } else if (isBoardFull(g)) {
        setStatus({ kind: "draw" });
      }
      return next;
    });
  }, []);

  const playAt = useCallback(
    (x: number, y: number) => {
      if (status.kind !== "playing") return;
      if (thinking) return;
      if (currentPlayer !== humanColor) return;
      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
      if (grid[y][x] !== Stone.Empty) return;
      if (humanColor === Stone.Black && forbiddenSet.has(x + "," + y)) return; // 금수
      applyMove(x, y, humanColor);
    },
    [status.kind, thinking, currentPlayer, humanColor, grid, forbiddenSet, applyMove],
  );

  const newGame = useCallback(
    (color: Player = humanColor, diff: Difficulty = difficulty) => {
      gameIdRef.current += 1;
      engineRef.current?.restart();
      setHumanColor(color);
      setDifficultyState(diff);
      setStatus({ kind: "playing" });
      setThinking(false);
      setUndoUsed(false);
      setMoves([]);
    },
    [humanColor, difficulty],
  );

  const undo = useCallback(() => {
    if (thinking) return;
    if (undoUsed) return; // 한 게임당 1회만
    if (status.kind !== "playing" && status.kind !== "won" && status.kind !== "draw") return;
    gameIdRef.current += 1; // discard any in-flight AI result
    engineRef.current?.restart();
    setStatus({ kind: "playing" });
    setUndoUsed(true);
    setMoves((prev) => {
      // Remove back to the human's turn: drop trailing moves until the last
      // move is the AI's (so it becomes the human's turn) or the board is empty.
      const next = [...prev];
      // Drop one (the most recent). If it's now AI's turn, drop one more.
      if (next.length > 0) next.pop();
      const turn = sideToMove(next.length);
      if (turn !== humanColor && next.length > 0) next.pop();
      return next;
    });
  }, [thinking, undoUsed, status.kind, humanColor]);

  const resign = useCallback(() => {
    if (status.kind !== "playing") return;
    gameIdRef.current += 1; // discard any in-flight AI result
    setStatus({ kind: "won", winner: opponent(humanColor), line: [] });
  }, [status.kind, humanColor]);

  const setDifficulty = useCallback((d: Difficulty) => setDifficultyState(d), []);

  // --- AI turn driver ---
  useEffect(() => {
    if (status.kind !== "playing") return;
    if (currentPlayer !== aiColor) return;
    if (thinking) return;
    if (engineState === "loading") return; // wait for engine to finish loading

    const myGameId = gameIdRef.current;
    const preset = DIFFICULTY_PRESETS[difficulty];
    let cancelled = false;
    setThinking(true);

    const run = async () => {
      let point: Point | null = null;
      const engine = engineRef.current;
      try {
        if (moves.length === 0) {
          // AI opens the game (human chose White): always play center (천원).
          // Instant, and sidesteps the engine's opening protocol entirely, so
          // picking White never stalls or drops to the offline fallback.
          const c = (BOARD_SIZE - 1) / 2;
          point = { x: c, y: c };
        } else if (engineState === "ready" && engine) {
          const p = await engine.bestMove(moves, {
            timeoutMs: preset.timeoutMs,
            strength: preset.strength,
          });
          // Validate engine output; fall back if it is illegal.
          if (
            p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE &&
            grid[p.y][p.x] === Stone.Empty
          ) {
            point = p;
          }
        }
      } catch {
        // Engine errored — drop to the heuristic. Only flag the offline badge
        // for the CURRENT game: a new game / undo deliberately aborts an
        // in-flight think, and that must not look like an engine failure.
        if (!cancelled && gameIdRef.current === myGameId) setEngineState("fallback");
      }
      if (!point) point = chooseMove(grid, aiColor);

      if (cancelled || gameIdRef.current !== myGameId) return; // stale
      setThinking(false);
      if (point) applyMove(point.x, point.y, aiColor);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, status.kind, currentPlayer, aiColor, engineState, difficulty]);

  const canUndo =
    moves.length > 0 && !thinking && engineState !== "loading" && !undoUsed;

  return {
    grid,
    moves,
    currentPlayer,
    humanColor,
    status,
    thinking,
    forbidden,
    lastMove,
    winLine,
    engineState,
    loadingProgress,
    difficulty,
    playAt,
    newGame,
    undo,
    resign,
    setDifficulty,
    canUndo,
  };
}
