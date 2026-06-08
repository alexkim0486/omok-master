"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Crown, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchRanking, RankEntry } from "@/lib/omok/account";

export default function RankingPage() {
  const [rows, setRows] = useState<RankEntry[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRows([]);
      return;
    }
    fetchRanking(supabase, 30)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-safe-5">
      <header className="flex items-center gap-3 pt-1">
        <Link
          href="/"
          aria-label="뒤로"
          className="rounded-full bg-stone-800/70 p-2 text-amber-200/80 ring-1 ring-amber-200/10 transition hover:bg-stone-700 hover:text-amber-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-400" />
          <h1 className="game-title text-xl font-black tracking-tight text-amber-100">
            랭킹전 순위 TOP 30
          </h1>
        </div>
      </header>

      <div className="flex flex-col gap-1.5 rounded-2xl bg-stone-800/40 p-2 ring-1 ring-amber-200/8">
        {rows === null && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-amber-200/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중…
          </div>
        )}
        {rows !== null && rows.length === 0 && (
          <div className="py-10 text-center text-sm text-amber-200/50">
            아직 랭킹전 기록이 없어요.
            <br />첫 번째 챔피언이 되어보세요!
          </div>
        )}
        {rows?.map((r, i) => (
          <div
            key={r.userId}
            className={
              "flex items-center gap-3 rounded-xl px-3 py-2.5 " +
              (i < 3 ? "bg-amber-500/8 ring-1 ring-amber-400/15" : "")
            }
          >
            <span
              className={
                "w-7 text-center text-sm font-black tabular-nums " +
                (i === 0
                  ? "text-amber-300"
                  : i === 1
                    ? "text-stone-300"
                    : i === 2
                      ? "text-amber-600"
                      : "text-amber-200/40")
              }
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-amber-100">
                {r.nickname || "플레이어"}
              </p>
              <p className="text-[11px] text-amber-200/45">
                {r.wins}승 · 최고 {r.bestStreak}연승
              </p>
            </div>
            <span className="rounded-lg bg-stone-900/50 px-2.5 py-1 text-sm font-bold tabular-nums text-amber-300">
              {r.rating}
            </span>
          </div>
        ))}
      </div>

      <p className="px-2 text-center text-[11px] leading-relaxed text-amber-200/40">
        레이팅은 Elo 방식이에요. 난이도가 높을수록 이겼을 때 더 많이 오릅니다.
        토큰으로 시작하는 <b className="text-amber-200/60">랭킹전</b>만 순위에 반영돼요.
      </p>
    </div>
  );
}
