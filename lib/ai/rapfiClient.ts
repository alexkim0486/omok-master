/*
 * RapfiEngine — a typed client for the Rapfi Gomoku/Renju engine running in a
 * Web Worker (see public/engine/engine-worker.js). It speaks the Gomocup
 * protocol (with Rapfi's YX* extensions) and exposes a small async API.
 *
 * Strength is governed by per-move thinking time (INFO TIMEOUT_TURN). For
 * Renju we set INFO RULE 2 (renju with forbidden moves). The engine itself
 * enforces the rules; our local detector is only used for UI hints.
 */

import { BOARD_SIZE, Move, Point, Stone } from "@/lib/renju/types";

// Rapfi rule codes: 0 = freestyle, 1 = standard, 2 = renju (with forbidden).
export const RULE_FREESTYLE = 0;
export const RULE_STANDARD = 1;
export const RULE_RENJU = 2;

export interface ThinkInfo {
  depth?: number;
  seldepth?: number;
  nodes?: number;
  speed?: number;
  evalStr?: string;
  winrate?: number;
}

export interface ThinkOptions {
  /** Per-move thinking budget in milliseconds (difficulty / strength dial). */
  timeoutMs: number;
  /** Playing strength 0..100 (100 = full strength). */
  strength?: number;
  /** Engine rule; defaults to renju. */
  rule?: number;
  /** Optional live info callback while the engine searches. */
  onInfo?: (info: ThinkInfo) => void;
}

type WorkerOutMessage =
  | { type: "ready" }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "status"; status: string }
  | { type: "error"; error: string }
  | { type: "exit"; code: number };

export class RapfiEngine {
  private worker: Worker | null = null;
  private ready = false;
  private started = false;
  private readyResolvers: Array<() => void> = [];

  /** Called with a 0..1 fraction while the engine data file downloads. */
  onProgress?: (fraction: number) => void;

  private pending: {
    resolve: (p: Point) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    onInfo?: (info: ThinkInfo) => void;
  } | null = null;

  /** True once the engine wasm has loaded and is ready to accept commands. */
  get isReady(): boolean {
    return this.ready;
  }

  /** Load the engine. Resolves when the wasm is ready. */
  async init(base = "/engine/build/"): Promise<void> {
    if (this.ready) return;
    if (!this.worker) {
      this.worker = new Worker("/engine/engine-worker.js");
      this.worker.onmessage = (e: MessageEvent<WorkerOutMessage>) =>
        this.handleMessage(e.data);
      this.worker.onerror = (e) => this.failPending(new Error("worker error: " + e.message));
      this.worker.postMessage({ type: "init", base });
    }
    if (this.ready) return;
    await new Promise<void>((resolve) => this.readyResolvers.push(resolve));
  }

  private send(cmd: string) {
    this.worker?.postMessage({ type: "command", data: cmd });
  }

  private handleMessage(msg: WorkerOutMessage) {
    switch (msg.type) {
      case "ready":
        this.ready = true;
        this.readyResolvers.splice(0).forEach((r) => r());
        break;
      case "stdout":
        this.handleStdout(msg.line);
        break;
      case "stderr":
        // Engine diagnostics; useful during development.
        if (typeof console !== "undefined") console.debug("[rapfi]", msg.line);
        break;
      case "status":
        this.handleStatus(msg.status);
        break;
      case "error":
        this.failPending(new Error(msg.error));
        break;
      default:
        break;
    }
  }

  private handleStatus(status: string) {
    if (!this.onProgress) return;
    // Emscripten reports e.g. "Downloading data... (12345678/40306406)".
    const m = status.match(/\((\d+)\/(\d+)\)/);
    if (m) {
      const loaded = Number(m[1]);
      const total = Number(m[2]);
      if (total > 0) this.onProgress(Math.min(1, loaded / total));
    } else if (status === "" || /running/i.test(status)) {
      this.onProgress(1);
    }
  }

  private handleStdout(line: string) {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    const spaceIdx = trimmed.indexOf(" ");

    // A bare "x,y" line with no spaces is the engine's chosen move.
    if (spaceIdx === -1) {
      if (trimmed === "OK") return;
      if (trimmed === "SWAP") return;
      const parts = trimmed.split(",");
      if (parts.length === 2) {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (Number.isInteger(x) && Number.isInteger(y)) this.resolveMove({ x, y });
      }
      return;
    }

    const head = trimmed.slice(0, spaceIdx);
    const tail = trimmed.slice(spaceIdx + 1);

    if (head === "INFO") {
      this.parseInfo(tail);
    } else if (head === "ERROR") {
      this.failPending(new Error("engine error: " + tail));
    }
    // MESSAGE / FORBID / DEBUG and other lines are ignored: rules and hints are
    // computed locally by lib/renju/forbidden.ts.
  }

  private parseInfo(tail: string) {
    if (!this.pending?.onInfo) return;
    const i = tail.indexOf(" ");
    if (i === -1) return;
    const key = tail.slice(0, i);
    const value = tail.slice(i + 1);
    const info: ThinkInfo = {};
    switch (key) {
      case "DEPTH":
        info.depth = Number(value);
        break;
      case "SELDEPTH":
        info.seldepth = Number(value);
        break;
      case "NODES":
      case "TOTALNODES":
        info.nodes = Number(value);
        break;
      case "SPEED":
        info.speed = Number(value);
        break;
      case "EVAL":
        info.evalStr = value;
        break;
      case "WINRATE":
        info.winrate = parseFloat(value);
        break;
      default:
        return;
    }
    this.pending.onInfo(info);
  }

  private resolveMove(p: Point) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const { resolve } = this.pending;
    this.pending = null;
    resolve(p);
  }

  private failPending(err: Error) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const { reject } = this.pending;
      this.pending = null;
      reject(err);
    }
    // Reject any still-waiting init callers too.
    if (!this.ready) {
      this.readyResolvers.splice(0).forEach((r) => r());
    }
  }

  /**
   * Ask the engine for the best move given the ordered move list (Black first).
   * Returns the engine's chosen point. Throws if the engine is not ready or
   * fails to respond in time.
   */
  async bestMove(moves: Move[], opts: ThinkOptions): Promise<Point> {
    if (!this.ready || !this.worker) throw new Error("engine not ready");
    if (this.pending) throw new Error("engine is already thinking");

    const rule = opts.rule ?? RULE_RENJU;
    const strength = Math.max(0, Math.min(100, opts.strength ?? 100));

    // Per-think configuration (mirrors gomoku-calculator's order).
    this.send("INFO RULE " + rule);
    this.send("INFO TIMEOUT_TURN " + Math.max(50, Math.round(opts.timeoutMs)));
    this.send("INFO TIMEOUT_MATCH " + 2147483647);
    this.send("INFO TIME_LEFT " + 2147483647);
    this.send("INFO STRENGTH " + strength);

    if (!this.started) {
      this.send("START " + BOARD_SIZE);
      this.started = true;
    }

    const move = new Promise<Point>((resolve, reject) => {
      const timer = setTimeout(
        () => this.failPending(new Error("engine timed out")),
        Math.round(opts.timeoutMs) + 8000,
      );
      this.pending = { resolve, reject, timer, onInfo: opts.onInfo };
    });

    if (moves.length === 0) {
      // Empty board: let the engine make the opening move (it plays Black).
      this.send("BEGIN");
    } else {
      // Encode the full position. "own" side (to move) = 1, opponent = 2.
      let side = moves.length % 2 === 0 ? 1 : 2;
      let cmd = "BOARD";
      for (const m of moves) {
        cmd += " " + m.x + "," + m.y + "," + side;
        side = 3 - side;
      }
      cmd += " DONE";
      this.send(cmd);
    }

    return move;
  }

  /** Tell the engine to begin a fresh game on the next think. */
  restart() {
    if (this.ready) this.send("RESTART");
    this.started = false;
  }

  /** Stop an in-flight search (best-effort). */
  stop() {
    if (this.ready) this.send("YXSTOP");
  }

  dispose() {
    if (this.pending) this.failPending(new Error("engine disposed"));
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.started = false;
  }
}

/** Helper: derive whose turn it is from the move count (Black moves first). */
export function sideToMove(moveCount: number): Stone.Black | Stone.White {
  return moveCount % 2 === 0 ? Stone.Black : Stone.White;
}
