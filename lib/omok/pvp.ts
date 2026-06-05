"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { Grid, Stone } from "@/lib/renju/types";
import { createEmptyGrid } from "@/lib/renju/board";

export interface PvpMove {
  x: number;
  y: number;
}

export type RoomStatus = "waiting" | "playing" | "finished" | "abandoned";
export type RoomWinner = "host" | "guest" | "draw" | null;

export interface OmokRoom {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  host_nick: string | null;
  guest_nick: string | null;
  status: RoomStatus;
  moves: PvpMove[];
  winner: RoomWinner;
  reason: string | null;
  host_seen_at: string;
  guest_seen_at: string | null;
  updated_at: string; // 마지막 수/이벤트 시각 — 수당 제한시간 계산 기준
}

// ── RPC wrappers ──────────────────────────────────────────────────
export async function createRoom(
  supabase: SupabaseClient,
): Promise<{ id: string; code: string } | null> {
  const { data, error } = await supabase.rpc("omok_pvp_create");
  if (error || !data) return null;
  return data as { id: string; code: string };
}

export async function joinRoom(
  supabase: SupabaseClient,
  code: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("omok_pvp_join", { p_code: code });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function fetchRoom(
  supabase: SupabaseClient,
  id: string,
): Promise<OmokRoom | null> {
  const { data } = await supabase.from("omok_rooms").select("*").eq("id", id).maybeSingle();
  return (data as OmokRoom | null) ?? null;
}

export async function sendMove(
  supabase: SupabaseClient,
  roomId: string,
  x: number,
  y: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("omok_pvp_move", { p_room: roomId, p_x: x, p_y: y });
  return !error && data === true;
}

export async function finishGame(
  supabase: SupabaseClient,
  roomId: string,
  winner: Exclude<RoomWinner, null>,
  reason: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("omok_pvp_finish", {
    p_room: roomId,
    p_winner: winner,
    p_reason: reason,
  });
  return !error && data === true;
}

export async function heartbeat(supabase: SupabaseClient, roomId: string): Promise<void> {
  try {
    await supabase.rpc("omok_pvp_heartbeat", { p_room: roomId });
  } catch {
    /* best-effort */
  }
}

export async function leaveRoom(supabase: SupabaseClient, roomId: string): Promise<void> {
  try {
    await supabase.rpc("omok_pvp_leave", { p_room: roomId });
  } catch {
    /* best-effort */
  }
}

/** Subscribe to realtime UPDATEs on a room row. Returns the channel (unsubscribe on cleanup). */
export function subscribeRoom(
  supabase: SupabaseClient,
  roomId: string,
  onChange: (room: OmokRoom) => void,
): RealtimeChannel {
  return supabase
    .channel(`omok_room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "omok_rooms", filter: `id=eq.${roomId}` },
      (payload) => onChange(payload.new as OmokRoom),
    )
    .subscribe();
}

// ── Helpers ───────────────────────────────────────────────────────
/** Build a board grid from the ordered move list (host=Black plays first). */
export function gridFromPvpMoves(moves: PvpMove[]): Grid {
  const g = createEmptyGrid();
  moves.forEach((m, i) => {
    if (m.y >= 0 && m.x >= 0) g[m.y][m.x] = i % 2 === 0 ? Stone.Black : Stone.White;
  });
  return g;
}

/** host plays Black (선공), guest plays White. */
export function colorOf(role: "host" | "guest"): Stone.Black | Stone.White {
  return role === "host" ? Stone.Black : Stone.White;
}
