"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGame, DIFFICULTY_PRESETS, Difficulty } from "@/lib/game/useGame";
import { Stone, Player } from "@/lib/renju/types";
import GameBoard from "@/components/GameBoard";
import RulesHelp from "@/components/RulesHelp";
import GuideHelp from "@/components/GuideHelp";
import { useAccount } from "@/lib/omok/useAccount";
import { getSupabaseBrowserClient, gongbuinUrl } from "@/lib/supabase/client";
import { spendRatedToken, recordResult } from "@/lib/omok/account";
import {
  RotateCcw,
  Plus,
  BrainCircuit,
  Loader2,
  Trophy,
  Handshake,
  Zap,
  Wifi,
  WifiOff,
  Coins,
  Crown,
  LogIn,
  HelpCircle,
  Coffee,
} from "lucide-react";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  master: "최강",
};

// 공부인스터디카페 화정센터 정보
const STUDYCAFE = {
  name: "공부인스터디카페 화정센터",
  address: "광주 서구 군분로179번길 14 3층",
  phone: "010-4199-4170",
};

export default function GameScreen() {
  const g = useGame();
  const [showRules, setShowRules] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const loading = g.engineState === "loading";

  // 첫 방문 시 사용 안내를 자동으로 한 번 보여준다.
  useEffect(() => {
    try {
      if (localStorage.getItem("omok_guide_seen") !== "1") setShowGuide(true);
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, []);
  const closeGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem("omok_guide_seen", "1");
    } catch {
      /* ignore */
    }
  };
  const pct = Math.round(g.loadingProgress * 100);

  const turnIsHuman = g.currentPlayer === g.humanColor;

  type StatusKind = "won-human" | "won-ai" | "draw" | "thinking" | "human-turn" | "ai-turn";
  let statusKind: StatusKind;
  if (g.status.kind === "won") {
    statusKind = g.status.winner === g.humanColor ? "won-human" : "won-ai";
  } else if (g.status.kind === "draw") {
    statusKind = "draw";
  } else if (g.thinking) {
    statusKind = "thinking";
  } else {
    statusKind = turnIsHuman ? "human-turn" : "ai-turn";
  }

  const statusConfig: Record<StatusKind, { text: string; icon: React.ReactNode; accent: string }> = {
    "won-human": {
      text: "당신 승리!",
      icon: <Trophy className="h-4 w-4 flex-shrink-0" />,
      accent: "text-amber-300 bg-amber-500/10 ring-amber-400/20",
    },
    "won-ai": {
      text: "AI 승리",
      icon: <Zap className="h-4 w-4 flex-shrink-0" />,
      accent: "text-rose-300 bg-rose-500/10 ring-rose-400/20",
    },
    draw: {
      text: "무승부",
      icon: <Handshake className="h-4 w-4 flex-shrink-0" />,
      accent: "text-stone-300 bg-stone-500/10 ring-stone-400/20",
    },
    thinking: {
      text: "AI가 생각 중…",
      icon: <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />,
      accent: "text-sky-300 bg-sky-500/10 ring-sky-400/20",
    },
    "human-turn": {
      text: "당신 차례",
      icon: null,
      accent: "text-amber-100 bg-stone-800/60 ring-amber-200/10",
    },
    "ai-turn": {
      text: "AI 차례",
      icon: <BrainCircuit className="h-4 w-4 flex-shrink-0" />,
      accent: "text-sky-200 bg-sky-500/10 ring-sky-400/15",
    },
  };

  const sc = statusConfig[statusKind];
  const isGameOver = g.status.kind !== "playing";

  // ── Account / token economy (공부인 연동) ──
  const { account, isGuest, noSupabase, refresh } = useAccount();
  const ratedCtxRef = useRef<{ difficulty: Difficulty; color: Player } | null>(null);
  const recordedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const tokens = account?.tokens ?? 0;

  // Practice (free) game — clears any rated context.
  const practiceNewGame = (
    color: Player = g.humanColor,
    diff: Difficulty = g.difficulty,
  ) => {
    ratedCtxRef.current = null;
    recordedRef.current = false;
    setNotice(null);
    g.newGame(color, diff);
  };

  // Rated game — spend one token on the server, then start.
  const startRated = async () => {
    if (noSupabase) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isGuest) {
      window.location.href = gongbuinUrl(); // 로그인하러 공부인으로
      return;
    }
    setStarting(true);
    setNotice(null);
    const bal = await spendRatedToken(supabase);
    setStarting(false);
    if (bal === null) {
      setNotice("토큰이 부족해요. 공부·출석·게시판으로 토큰을 모아보세요!");
      return;
    }
    ratedCtxRef.current = { difficulty: g.difficulty, color: g.humanColor };
    recordedRef.current = false;
    setNotice("랭킹전 시작! (토큰 -1)");
    g.newGame(g.humanColor, g.difficulty);
    void refresh();
  };

  // Record a rated game's result when it ends (Elo + bonuses server-side).
  useEffect(() => {
    if (g.status.kind === "playing") return;
    const ctx = ratedCtxRef.current;
    if (!ctx || recordedRef.current) return;
    recordedRef.current = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const result: "win" | "loss" | "draw" =
      g.status.kind === "won"
        ? g.status.winner === ctx.color
          ? "win"
          : "loss"
        : "draw";
    void recordResult(supabase, {
      rated: true,
      difficulty: ctx.difficulty,
      myColor: ctx.color,
      result,
    }).then((r) => {
      void refresh();
      if (r) {
        const sign = r.rating_delta >= 0 ? "+" : "";
        const label = result === "win" ? "승리" : result === "loss" ? "패배" : "무승부";
        setNotice(`랭킹전 ${label} · 레이팅 ${sign}${r.rating_delta}`);
      }
    });
  }, [g.status, refresh]);

  return (
    <div className="game-screen mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-safe-5">
      {/* Header */}
      <header className="flex items-start justify-between pt-1">
        <div className="flex flex-col gap-0.5">
          <p className="text-[0.7rem] font-semibold tracking-wide text-amber-300/60">
            {STUDYCAFE.name}
          </p>
          <h1 className="game-title text-[1.5rem] font-black leading-none tracking-tight text-amber-100">
            오목 챔피언
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            aria-label="사용 안내"
            className="flex items-center gap-1 rounded-full bg-stone-800/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200/80 ring-1 ring-amber-200/10 transition active:scale-95 hover:bg-stone-700 hover:text-amber-100"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            도움말
          </button>
          <EngineBadge state={g.engineState} pct={pct} />
        </div>
      </header>

      {/* Status bar */}
      <div
        className={
          "status-card flex items-center justify-between rounded-2xl px-4 py-3 ring-1 transition-all duration-300 " +
          sc.accent
        }
      >
        <div className="flex items-center gap-2.5">
          <ColorDot color={g.currentPlayer} won={isGameOver} />
          <span className="flex items-center gap-2 text-sm font-semibold leading-none">
            {sc.icon}
            <span>{sc.text}</span>
          </span>
        </div>
        <MoveCount count={g.moves.length} />
      </div>

      {/* Account / token bar */}
      {!noSupabase && (
        <div className="flex items-center justify-between rounded-xl bg-stone-800/40 px-4 py-2.5 ring-1 ring-amber-200/8">
          {isGuest ? (
            <a
              href={gongbuinUrl()}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-200/80 transition hover:text-amber-100"
            >
              <LogIn className="h-3.5 w-3.5" />
              공부인 로그인하고 랭킹전 즐기기
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-100">
              <Coins className="h-4 w-4 text-amber-400" />
              토큰 <b className="tabular-nums">{tokens}</b>
            </span>
          )}
          <Link
            href="/ranking"
            className="flex items-center gap-1 text-xs font-medium text-amber-200/60 transition hover:text-amber-100"
          >
            <Crown className="h-3.5 w-3.5" />
            랭킹
          </Link>
        </div>
      )}

      {/* Board container */}
      <div className="board-wrapper relative rounded-3xl ring-1 ring-amber-200/8 shadow-board">
        <GameBoard
          grid={g.grid}
          lastMove={g.lastMove}
          winLine={g.winLine}
          forbidden={g.forbidden}
          disabled={
            loading ||
            g.thinking ||
            g.status.kind !== "playing" ||
            !turnIsHuman
          }
          onPlay={g.playAt}
        />
        {loading && <LoadingOverlay pct={pct} />}
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => practiceNewGame()}
          className="action-btn-primary flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-bold text-stone-950 shadow-amber transition-all duration-150 active:scale-95 hover:bg-amber-400 hover:shadow-amber-lg"
        >
          <Plus className="h-4 w-4" />
          {noSupabase ? "새 게임" : "연습 게임"}
        </button>
        <button
          onClick={g.undo}
          disabled={!g.canUndo}
          className="action-btn-secondary flex items-center justify-center gap-2 rounded-2xl bg-stone-800 px-4 py-3.5 text-sm font-semibold text-amber-100/80 ring-1 ring-amber-200/10 shadow-sm transition-all duration-150 active:scale-95 enabled:hover:bg-stone-700 enabled:hover:text-amber-100 disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-4 w-4" />
          무르기
        </button>
      </div>

      {/* Rated game (랭킹전) — costs 1 token, affects Elo & rewards */}
      {!noSupabase && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={startRated}
            disabled={starting}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3.5 text-sm font-bold text-stone-950 shadow-amber transition active:scale-95 hover:to-amber-400 disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Crown className="h-4 w-4" />
            )}
            {isGuest ? "로그인하고 랭킹전" : "랭킹전 시작 · 토큰 1"}
          </button>
          {notice && (
            <p className="text-center text-xs font-medium text-amber-200/75">{notice}</p>
          )}
        </div>
      )}

      {/* Settings */}
      <section className="flex flex-col gap-3.5 rounded-2xl bg-stone-800/50 p-4 ring-1 ring-amber-200/8 backdrop-blur-sm">
        <Segmented
          label="내 돌"
          value={g.humanColor}
          options={[
            { value: Stone.Black, label: "● 흑 선공" },
            { value: Stone.White, label: "○ 백 후공" },
          ]}
          onChange={(v) => practiceNewGame(v as Player)}
        />
        <div className="h-px bg-amber-200/8" />
        <Segmented
          label="난이도"
          value={g.difficulty}
          options={(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map(
            (d) => ({
              value: d,
              label: DIFFICULTY_LABELS[d],
            })
          )}
          onChange={(v) => practiceNewGame(g.humanColor, v as Difficulty)}
        />
      </section>

      {/* 휴식 안내 (지속 표시) */}
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center justify-center gap-1.5 text-center text-[11px] text-emerald-300/55 transition hover:text-emerald-300"
      >
        <Coffee className="h-3 w-3" />
        공부 사이 짧은 휴식으로 즐겨요 · 사용 안내
      </button>

      {/* Footer */}
      <footer className="mt-auto flex flex-col items-center gap-1 pb-safe pt-3 text-center">
        <p className="text-xs font-bold tracking-wide text-amber-100/80">
          {STUDYCAFE.name}
        </p>
        <p className="text-[11px] leading-relaxed text-amber-200/50">
          {STUDYCAFE.address}
        </p>
        <a
          href={`tel:${STUDYCAFE.phone.replace(/[^0-9+]/g, "")}`}
          className="text-[11px] font-medium text-amber-200/70 underline decoration-amber-200/25 underline-offset-2 transition-colors hover:text-amber-100"
        >
          문의 {STUDYCAFE.phone}
        </a>
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-200/25 tracking-wide">
          AI:{" "}
          <a
            href="https://github.com/dhbloo/rapfi"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-amber-200/15 underline-offset-2 hover:text-amber-200/40"
          >
            Rapfi
          </a>{" "}
          (GPLv3) · Gomocup 2025 챔피언
        </p>
      </footer>

      {showGuide && (
        <GuideHelp
          onClose={closeGuide}
          onOpenRules={() => {
            closeGuide();
            setShowRules(true);
          }}
        />
      )}
      {showRules && <RulesHelp onClose={() => setShowRules(false)} />}
    </div>
  );
}

/* ── Engine Badge ─────────────────────────────────────────────── */
function EngineBadge({ state, pct }: { state: string; pct: number }) {
  if (state === "ready") {
    return (
      <span className="engine-badge-ready flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-emerald animate-pulse-slow" />
        세계 최강 AI
      </span>
    );
  }
  if (state === "fallback") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-400/25">
        <WifiOff className="h-3 w-3" />
        오프라인 AI
      </span>
    );
  }
  // loading state — circular progress ring
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-stone-800/70 px-3 py-1.5 text-[11px] font-medium text-stone-300 ring-1 ring-stone-600/40">
      <LoadingRing pct={pct} size={14} />
      {pct}%
    </span>
  );
}

/* ── Circular loading ring for badge ─────────────────────────── */
function LoadingRing({ pct, size }: { pct: number; size: number }) {
  const r = (size - 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity={0.2}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#fbbf24"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        className="transition-all duration-300"
      />
    </svg>
  );
}

/* ── Color dot ────────────────────────────────────────────────── */
function ColorDot({ color, won }: { color: Player; won?: boolean }) {
  const isBlack = color === Stone.Black;
  return (
    <span
      className={
        "inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ring-1 shadow-sm transition-transform duration-200 " +
        (won ? "scale-110 " : "") +
        (isBlack
          ? "bg-stone-950 ring-stone-500 shadow-stone-950"
          : "bg-stone-100 ring-stone-300 shadow-stone-100/20")
      }
      aria-label={isBlack ? "흑돌" : "백돌"}
    />
  );
}

/* ── Move count ───────────────────────────────────────────────── */
function MoveCount({ count }: { count: number }) {
  return (
    <span className="tabular-nums text-xs font-medium text-amber-200/50">
      <span className="text-sm font-bold text-amber-200/70">{count}</span>수
    </span>
  );
}

/* ── Loading overlay ──────────────────────────────────────────── */
function LoadingOverlay({ pct }: { pct: number }) {
  return (
    <div
      className="loading-overlay absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-3xl bg-stone-950/88 backdrop-blur-md"
      role="status"
      aria-label="AI 엔진 불러오는 중"
    >
      {/* Animated brain icon with halo ring */}
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-amber-400/6 animate-halo-pulse" />
        <div className="absolute h-14 w-14 rounded-full bg-amber-400/10 animate-halo-pulse" style={{ animationDelay: "0.4s" }} />
        <BrainCircuit className="relative h-10 w-10 text-amber-400 drop-shadow-amber animate-float" />
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-amber-100">
          세계 챔피언 엔진 준비 중
        </p>
        <p className="text-[11px] text-amber-200/50">약 39MB · 최초 1회</p>
      </div>

      {/* Sleek linear progress */}
      <div className="flex w-56 flex-col items-center gap-2">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-stone-700/80">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/20 animate-shimmer"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-amber-300/70">
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* ── Segmented control ────────────────────────────────────────── */
interface SegOption {
  value: string | number;
  label: string;
}
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: SegOption[];
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs font-medium tracking-wide text-amber-200/55 uppercase">
        {label}
      </span>
      <div className="flex gap-0.5 rounded-xl bg-stone-900/70 p-1 ring-1 ring-amber-200/8">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 " +
              (o.value === value
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-amber-100/50 hover:text-amber-100/80 active:scale-95")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
