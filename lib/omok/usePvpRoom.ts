"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  OmokRoom,
  fetchRoom,
  finishGame,
  gridFromPvpMoves,
  heartbeat,
  leaveRoom,
  sendMove,
  subscribeRoom,
  colorOf,
} from "@/lib/omok/pvp";
import { BOARD_SIZE, Grid, Player, Point, Stone } from "@/lib/renju/types";
import { checkWin, createEmptyGrid, isBoardFull } from "@/lib/renju/board";
import { forbiddenPoints } from "@/lib/renju/forbidden";

const STALE_MS = 25_000; // 상대가 이 시간 이상 응답 없으면 끊김으로 간주
export const TURN_SECONDS = 30; // 수당 제한시간

export interface PvpView {
  loading: boolean;
  room: OmokRoom | null;
  myRole: "host" | "guest" | null;
  myColor: Player | null;
  grid: Grid;
  currentPlayer: Player;
  isMyTurn: boolean;
  forbidden: Point[];
  lastMove: Point | null;
  winLine: Point[];
  opponentNick: string | null;
  opponentJoined: boolean;
  opponentStale: boolean;
  secsLeft: number | null; // 현재 차례 남은 시간(초)
  play: (x: number, y: number) => void;
  resign: () => void;
  claimWin: () => void;
}

export function usePvpRoom(roomId: string): PvpView {
  const [room, setRoom] = useState<OmokRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // 1s ticker: staleness + 수당 카운트다운
  const finishedRef = useRef(false);

  // 초기 로드 + 실시간 구독
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let channel: ReturnType<typeof subscribeRoom> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUid(user?.id ?? null);
      const r = await fetchRoom(supabase, roomId);
      if (!active) return;
      setRoom(r);
      setLoading(false);
      channel = subscribeRoom(supabase, roomId, (next) => setRoom(next));
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId]);

  const status = room?.status;

  // 하트비트 + 끊김 감지 틱
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || status !== "playing") return;
    void heartbeat(supabase, roomId);
    const hb = setInterval(() => void heartbeat(supabase, roomId), 5000);
    const tk = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(hb);
      clearInterval(tk);
    };
  }, [roomId, status]);

  const myRole: "host" | "guest" | null =
    room && uid
      ? uid === room.host_id
        ? "host"
        : uid === room.guest_id
          ? "guest"
          : null
      : null;
  const myColor = myRole ? colorOf(myRole) : null;

  const moves = useMemo(() => room?.moves ?? [], [room]);
  const grid = useMemo(() => (room ? gridFromPvpMoves(moves) : createEmptyGrid()), [room, moves]);
  const moveCount = moves.length;
  const currentPlayer: Player = moveCount % 2 === 0 ? Stone.Black : Stone.White;
  const isMyTurn = status === "playing" && myColor !== null && currentPlayer === myColor;
  const lastMove: Point | null = moveCount
    ? { x: moves[moveCount - 1].x, y: moves[moveCount - 1].y }
    : null;

  const forbidden: Point[] = useMemo(
    () =>
      isMyTurn && myColor === Stone.Black
        ? forbiddenPoints(grid).map((f) => f.point)
        : [],
    [isMyTurn, myColor, grid],
  );

  // 승리 라인 (정확히 5로 끝났을 때)
  const winLine: Point[] = useMemo(() => {
    if (!room || (room.status !== "finished" && room.status !== "abandoned")) return [];
    if (!lastMove || moveCount === 0) return [];
    const mover: Player = (moveCount - 1) % 2 === 0 ? Stone.Black : Stone.White;
    const { win, line } = checkWin(grid, lastMove.x, lastMove.y, mover);
    return win ? line : [];
  }, [room, grid, lastMove, moveCount]);

  // 상대 정보 / 끊김
  const opponentNick = myRole === "host" ? (room?.guest_nick ?? null) : (room?.host_nick ?? null);
  const opponentJoined = !!room?.guest_id;
  const opponentSeen =
    myRole === "host" ? room?.guest_seen_at : room?.host_seen_at;
  const opponentStale =
    status === "playing" &&
    !!opponentSeen &&
    Date.now() - new Date(opponentSeen).getTime() > STALE_MS;

  // 수당 남은 시간 (양쪽 모두 room.updated_at = 마지막 수 시각 기준으로 동일 계산)
  void tick; // 1초 틱으로 재계산
  const secsLeft =
    status === "playing" && room
      ? Math.max(
          0,
          Math.ceil(TURN_SECONDS - (Date.now() - new Date(room.updated_at).getTime()) / 1000),
        )
      : null;

  // 승패 자동 판정 → 결과 기록 (양쪽이 호출, 서버 멱등)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || status !== "playing" || moveCount === 0 || finishedRef.current) return;
    const last = moves[moveCount - 1];
    const mover: Player = (moveCount - 1) % 2 === 0 ? Stone.Black : Stone.White;
    const g2 = gridFromPvpMoves(moves);
    const { win } = checkWin(g2, last.x, last.y, mover);
    if (win) {
      finishedRef.current = true;
      void finishGame(supabase, roomId, mover === Stone.Black ? "host" : "guest", "five");
    } else if (isBoardFull(g2)) {
      finishedRef.current = true;
      void finishGame(supabase, roomId, "draw", "draw");
    }
  }, [moveCount, status, roomId, moves]);

  // 시간패: 현재 차례가 30초를 넘기면 상대 승 (양쪽 동일 기준, 서버 멱등)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || status !== "playing" || !room || finishedRef.current) return;
    const elapsed = (Date.now() - new Date(room.updated_at).getTime()) / 1000;
    if (elapsed > TURN_SECONDS) {
      finishedRef.current = true;
      const loserRole = moveCount % 2 === 0 ? "host" : "guest"; // 흑(host)=짝수번째 차례
      void finishGame(supabase, roomId, loserRole === "host" ? "guest" : "host", "timeout");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, status, roomId, moveCount]);

  const play = (x: number, y: number) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !isMyTurn) return;
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    if (grid[y][x] !== Stone.Empty) return;
    if (myColor === Stone.Black && forbidden.some((p) => p.x === x && p.y === y)) return;
    void sendMove(supabase, roomId, x, y);
  };

  const resign = () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) void leaveRoom(supabase, roomId);
  };

  const claimWin = () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && myRole) void finishGame(supabase, roomId, myRole, "abandon");
  };

  return {
    loading,
    room,
    myRole,
    myColor,
    grid,
    currentPlayer,
    isMyTurn,
    forbidden,
    lastMove,
    winLine,
    opponentNick,
    opponentJoined,
    opponentStale,
    secsLeft,
    play,
    resign,
    claimWin,
  };
}
