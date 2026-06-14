import type { SupabaseClient } from "@supabase/supabase-js";

export interface OmokAccount {
  userId: string;
  nickname: string | null;
  tokens: number;
  role: string;
  /** 남은 무료 연습판 (토큰 1개 = 연습 3판) */
  practiceCredits: number;
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
    .select("nickname, omok_tokens, role, omok_practice_credits")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    nickname: (data?.nickname as string | null) ?? null,
    tokens: Number(data?.omok_tokens ?? 0),
    role: (data?.role as string | null) ?? "user",
    practiceCredits: Number(data?.omok_practice_credits ?? 0),
  };
}

/**
 * 내 닉네임 저장 (profiles.nickname). 공부인 프로필과 동일한 닉네임.
 * 0033 트리거가 omok_ratings 도 동기화 → 랭킹에 즉시 반영(미적용 시 다음 경기부터).
 * 빈 값으로 저장하면 null → 랭킹은 이메일 앞부분으로 폴백.
 */
export async function updateNickname(
  supabase: SupabaseClient,
  nickname: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const trimmed = nickname.trim().slice(0, 20);
  const { error } = await supabase
    .from("profiles")
    .update({ nickname: trimmed || null })
    .eq("id", user.id);
  if (error) {
    console.error("닉네임 저장 실패:", error.message);
    return false;
  }
  return true;
}

/**
 * Spend for one practice game: 토큰 1개로 연습 3판.
 * 남은 무료 크레딧이 있으면 차감 없이 사용, 없으면 토큰 1 차감 후 3판 충전.
 * Returns the new token balance, or null if no tokens (or guest).
 */
export async function spendPracticeToken(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("omok_spend_practice");
  if (error || data === null || data === undefined) return null;
  return Number(data);
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
