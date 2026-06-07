import type { SupabaseClient } from "@supabase/supabase-js";

export interface OmokAccount {
  userId: string;
  nickname: string | null;
  tokens: number;
  role: string;
}

/** Current logged-in account + token balance, or null if guest. */
export async function fetchAccount(
  supabase: SupabaseClient,
): Promise<OmokAccount | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("nickname, omok_tokens, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    nickname: (data?.nickname as string | null) ?? null,
    tokens: Number(data?.omok_tokens ?? 0),
    role: (data?.role as string | null) ?? "user",
  };
}

/**
 * Spend one token to start a rated game. Returns the new balance, or null if
 * the user has no tokens (or is not logged in). Atomic on the server.
 */
export async function spendRatedToken(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("omok_spend_rated");
  if (error || data === null || data === undefined) return null;
  return Number(data);
}

export type OmokResult = "win" | "loss" | "draw";

export interface RecordResultInput {
  rated: boolean;
  difficulty: string | null;
  myColor: number; // 1 = black, 2 = white
  result: OmokResult;
  moves?: unknown;
}

/** Record a finished game; updates Elo and grants bonuses server-side. */
export async function recordResult(
  supabase: SupabaseClient,
  input: RecordResultInput,
): Promise<{ match_id: string; rating_delta: number } | null> {
  const { data, error } = await supabase.rpc("omok_record_result", {
    p_mode: "ai",
    p_rated: input.rated,
    p_difficulty: input.difficulty,
    p_color: input.myColor,
    p_result: input.result,
    p_moves: input.moves ?? null,
  });
  if (error || !data) return null;
  return data as { match_id: string; rating_delta: number };
}

export interface RankEntry {
  userId: string;
  nickname: string | null;
  rating: number;
  wins: number;
  games: number;
  bestStreak: number;
}

/** Public ranking by Elo. omok_ratings is readable by everyone. */
export async function fetchRanking(
  supabase: SupabaseClient,
  limit = 50,
): Promise<RankEntry[]> {
  const { data, error } = await supabase
    .from("omok_ratings")
    .select("user_id, nickname, rating, wins, games, best_streak")
    .order("rating", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.user_id as string,
    nickname: (r.nickname as string | null) ?? null,
    rating: Number(r.rating),
    wins: Number(r.wins),
    games: Number(r.games),
    bestStreak: Number(r.best_streak),
  }));
}
