"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGame, DIFFICULTY_PRESETS, Difficulty } from "@/lib/game/useGame";
import { Stone, Player, Point } from "@/lib/renju/types";
import GameBoard from "@/components/GameBoard";
import RulesHelp from "@/components/RulesHelp";
import GuideHelp from "@/components/GuideHelp";
import { useAccount } from "@/lib/omok/useAccount";
import { getSupabaseBrowserClient, gongbuinUrl } from "@/lib/supabase/client";
import { SITE } from "@/lib/site";
import { spendRatedToken, spendPracticeToken, recordResult, updateNickname } from "@/lib/omok/account";
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
  Home,
  Coffee,
  Check,
  X,
  Flag,
  Users,
  Play,
  UserRound,
} from "lucide-react";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  master: "최강",
};

const STUDYCAFE = {
  name: SITE.nameWithCenter,
  address: SITE.address,
  phone: SITE.phone,
};

const TURN_SECONDS = 30; // 내 차례 수당 제한시간

export default function GameScreen() {
  const g = useGame();
  const [showRules, setShowRules] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // 오터치 방지: 첫 터치는 '미리보기', 같은 자리 한 번 더 터치하면 착수.
  const [confirmMode, setConfirmMode] = useState(true);
  const [pending, setPending] = useState<Point | null>(null);
  const loading = g.engineState === "loading";
  const turnIsHuman = g.currentPlayer === g.humanColor;

  // 첫 방문 시 사용 안내 자동 표시 + 저장된 착수 방식 불러오기.
  useEffect(() => {
    try {
      if (localStorage.getItem("omok_guide_seen") !== "1") setShowGuide(true);
      const cm = localStorage.getItem("omok_confirm_mode");
      if (cm !== null) setConfirmMode(cm === "1");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, []);

  // 보드가 바뀌면(착수/AI응수/무르기/새게임) 미리보기 해제.
  useEffect(() => {
    setPending(null);
  }, [g.moves]);

  const changeConfirmMode = (on: boolean) => {
    setConfirmMode(on);
    setPending(null);
    try {
      localStorage.setItem("omok_confirm_mode", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // 보드 터치 처리: 확인 후 두기면 1탭=미리보기, 같은 자리 2탭=착수.
  const handleBoardTap = (x: number, y: number) => {
    if (g.forbidden.some((p) => p.x === x && p.y === y)) return; // 금수 자리는 미리보기도 안 함
    if (!confirmMode) {
      g.playAt(x, y);
      return;
    }
    if (pending && pending.x === x && pending.y === y) {
      g.playAt(x, y);
      setPending(null);
      return;
    }
    setPending({ x, y });
  };

  const confirmPending = () => {
    if (!pending) return;
    g.playAt(pending.x, pending.y);
    setPending(null);
  };

  // 게임 종료 시 화면 중앙 결과 표시 (승/패/무). 새 게임 시작하면 다시 보이게 리셋.
  const [resultDismissed, setResultDismissed] = useState(false);
  useEffect(() => {
    if (g.status.kind === "playing") setResultDismissed(false);
  }, [g.status.kind]);

  // 기권: 실수 방지 2탭 (한 번 누르면 "정말?"으로, 다시 누르면 기권).
  const [resignArm, setResignArm] = useState(false);
  useEffect(() => {
    setResignArm(false);
  }, [g.moves, g.status.kind]);

  // 시작 화면: 접속 직후엔 '게임 시작' 버튼을 보여주고, 누르기 전엔 게임/타이머 정지.
  const [started, setStarted] = useState(false);
  const startGame = async () => {
    const ok = await startPaidGame();
    if (ok) setStarted(true);
  };

  // 수당 제한시간(30초): 내 차례에 카운트다운, 0이 되면 시간패(기권 처리).
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  useEffect(() => {
    const humanTurn =
      started &&
      g.status.kind === "playing" &&
      !g.thinking &&
      turnIsHuman &&
      g.engineState !== "loading";
    if (!humanTurn) {
      deadlineRef.current = null;
      setSecsLeft(null);
      return;
    }
    deadlineRef.current = Date.now() + TURN_SECONDS * 1000;
    setSecsLeft(TURN_SECONDS);
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecsLeft(left);
      if (left <= 0) {
        deadlineRef.current = null;
        clearInterval(id);
        g.resign(); // 시간패
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, g.status.kind, g.thinking, turnIsHuman, g.engineState, g.moves]);
  const closeGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem("omok_guide_seen", "1");
    } catch {
      /* ignore */
    }
  };
  const pct = Math.round(g.loadingProgress * 100);

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
      text: "어디에 둘까요?",
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
  const nickname = account?.nickname?.trim();
  const statusText =
    statusKind === "human-turn" && nickname ? `${nickname}님, 어디에 둘까요?` : sc.text;
  const ratedCtxRef = useRef<{ difficulty: Difficulty; color: Player } | null>(null);
  const recordedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ratedActive, setRatedActive] = useState(false); // 랭킹전 진행 중 표시
  const [nickEditOpen, setNickEditOpen] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [savingNick, setSavingNick] = useState(false);
  const tokens = account?.tokens ?? 0;
  const isAdmin = account?.role === "admin"; // 관리자는 토큰 없이 플레이
  // 토큰을 차감하는 일반 게임 대상: 로그인한 비관리자(백엔드 있음)
  const paidPlay = !isAdmin && !isGuest && !noSupabase;

  // 보드만 새로 까는 내부 함수 (토큰 처리 없음 — 설정 변경/관리자/게스트용).
  const practiceNewGame = (
    color: Player = g.humanColor,
    diff: Difficulty = g.difficulty,
  ) => {
    ratedCtxRef.current = null;
    recordedRef.current = false;
    setRatedActive(false);
    setNotice(null);
    g.newGame(color, diff);
  };

  // 일반 게임 시작 — 비관리자는 토큰 1 차감, 게스트는 로그인 유도. 시작되면 true.
  const startPaidGame = async (
    color: Player = g.humanColor,
    diff: Difficulty = g.difficulty,
  ): Promise<boolean> => {
    if (isAdmin || noSupabase) {
      practiceNewGame(color, diff);
      return true;
    }
    if (isGuest) {
      window.location.href = gongbuinUrl(); // 로그인하러 공부인으로
      return false;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      practiceNewGame(color, diff);
      return true;
    }
    // 연습은 토큰 1개로 3판 (남은 무료 크레딧 우선 사용)
    const hadCredits = (account?.practiceCredits ?? 0) > 0;
    setStarting(true);
    setNotice(null);
    const bal = await spendPracticeToken(supabase);
    setStarting(false);
    if (bal === null) {
      setNotice("토큰이 부족해요. 공부·출석·게시판으로 토큰을 모아보세요!");
      return false;
    }
    practiceNewGame(color, diff);
    setNotice(hadCredits ? "게임 시작! (무료 연습)" : "게임 시작! (토큰 1개로 3판)");
    void refresh();
    return true;
  };

  // Rated game — spend one token on the server, then start.
  const startRated = async () => {
    const supabase = getSupabaseBrowserClient();
    if (noSupabase || !supabase) {
      setNotice("연결 오류예요. 새로고침 후 다시 시도해주세요.");
      return;
    }
    setStarting(true);
    setNotice(null);
    // 세션 확인 — SSO가 안 넘어왔으면(로그인 풀림) 무반응 대신 명확히 안내
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStarting(false);
      setNotice("로그인이 필요해요. 공부인에서 로그인 후 오목으로 다시 들어와 주세요.");
      window.setTimeout(() => {
        window.location.href = gongbuinUrl();
      }, 1500);
      return;
    }
    const bal = await spendRatedToken(supabase);
    setStarting(false);
    if (bal === null) {
      setNotice(`토큰이 부족해요 (보유 ${tokens}개). 공부·출석·게시판으로 토큰을 모아보세요!`);
      return;
    }
    ratedCtxRef.current = { difficulty: g.difficulty, color: g.humanColor };
    recordedRef.current = false;
    setRatedActive(true);
    setStarted(true); // ★ 보드 활성화 — 이게 없어서 랭킹전 눌러도 못 두던 버그
    setNotice("랭킹전 시작! 이제 오목판에 돌을 놓으세요 · 결과가 순위에 반영돼요");
    g.newGame(g.humanColor, g.difficulty);
    void refresh();
  };

  // 닉네임 설정 (원하는 사람만) — profiles.nickname 저장, 랭킹에 반영
  const openNickEdit = () => {
    setNickInput(account?.nickname ?? "");
    setNickEditOpen(true);
  };
  const saveNick = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || savingNick) return;
    setSavingNick(true);
    const ok = await updateNickname(supabase, nickInput);
    setSavingNick(false);
    if (ok) {
      setNickEditOpen(false);
      void refresh();
    }
  };

  // Record a rated game's result when it ends (Elo + bonuses server-side).
  useEffect(() => {
    if (g.status.kind === "playing") return;
    const ctx = ratedCtxRef.current;
    if (!ctx || recordedRef.current) return;
    recordedRef.current = true;
    setRatedActive(false); // 랭킹전 종료 → 진행 중 표시 해제
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
      <header className="pt-1">
        {/* 1줄: 상호명(좌) + 공부인 홈·도움말(우) */}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[0.7rem] font-semibold tracking-wide text-amber-300/60">
            {STUDYCAFE.name}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={gongbuinUrl()}
              aria-label="홈으로"
              className="flex items-center gap-1 rounded-full bg-stone-800/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200/80 ring-1 ring-amber-200/10 transition active:scale-95 hover:bg-stone-700 hover:text-amber-100"
            >
              <Home className="h-3.5 w-3.5" />
              {SITE.shortName} 홈
            </a>
            <button
              onClick={() => setShowGuide(true)}
              aria-label="사용 안내"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-800/70 text-amber-200/80 ring-1 ring-amber-200/10 transition active:scale-95 hover:bg-stone-700 hover:text-amber-100"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* 2줄: 타이틀 + AI 배지 */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="game-title text-[1.5rem] font-black leading-none tracking-tight text-amber-100">
            오목 챔피언
          </h1>
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
            <span>{statusText}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {secsLeft != null && (
            <span
              className={
                "text-sm font-black tabular-nums " +
                (secsLeft <= 10 ? "text-rose-300 animate-pulse" : "text-amber-200/90")
              }
            >
              {secsLeft}s
            </span>
          )}
          <MoveCount count={g.moves.length} />
        </div>
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
              {SITE.shortName} 로그인하고 랭킹전 즐기기
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-100">
              <Coins className="h-4 w-4 text-amber-400" />
              토큰 <b className="tabular-nums">{tokens}</b>
              {(account?.practiceCredits ?? 0) > 0 && (
                <span className="text-[11px] font-medium text-emerald-300/80">
                  · 무료 연습 {account?.practiceCredits}판
                </span>
              )}
            </span>
          )}
          <div className="flex items-center gap-3">
            {!isGuest && (
              <button
                onClick={openNickEdit}
                aria-label="닉네임 설정"
                className="flex items-center gap-1 text-xs font-medium text-amber-200/60 transition hover:text-amber-100"
              >
                <UserRound className="h-3.5 w-3.5" />
                <span className="max-w-[5.5rem] truncate">{account?.nickname?.trim() || "닉네임"}</span>
              </button>
            )}
            <Link
              href="/versus"
              className="flex items-center gap-1 text-xs font-medium text-amber-200/60 transition hover:text-amber-100"
            >
              <Users className="h-3.5 w-3.5" />
              친구 대전
            </Link>
            <Link
              href="/ranking"
              className="flex items-center gap-1 text-xs font-medium text-amber-200/60 transition hover:text-amber-100"
            >
              <Crown className="h-3.5 w-3.5" />
              랭킹
            </Link>
          </div>
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
            !started ||
            g.thinking ||
            g.status.kind !== "playing" ||
            !turnIsHuman
          }
          preview={pending}
          previewColor={g.currentPlayer}
          onPlay={handleBoardTap}
        />
        {loading && <LoadingOverlay pct={pct} />}
        {!loading && !started && (
          <StartOverlay
            color={g.humanColor}
            difficulty={DIFFICULTY_LABELS[g.difficulty]}
            onStart={startGame}
            costLabel={
              paidPlay
                ? (account?.practiceCredits ?? 0) > 0
                  ? `무료 연습 ${account?.practiceCredits}판`
                  : "토큰 1개로 3판"
                : null
            }
            busy={starting}
          />
        )}
      </div>

      {/* 착수 확인 배너 (확인 후 두기 모드) */}
      {pending && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/12 px-3 py-2.5 ring-1 ring-amber-400/30">
          <span className="text-xs font-semibold text-amber-200">
            여기에 둘까요? <span className="text-amber-200/60">한 번 더 터치 = 착수</span>
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={confirmPending}
              className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-stone-950 transition active:scale-95 hover:bg-amber-400"
            >
              <Check className="h-3.5 w-3.5" />
              착수
            </button>
            <button
              onClick={() => setPending(null)}
              className="flex items-center gap-1 rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-amber-100/80 transition active:scale-95 hover:bg-stone-600"
            >
              <X className="h-3.5 w-3.5" />
              취소
            </button>
          </div>
        </div>
      )}

      {/* Primary actions */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          onClick={() => void startPaidGame()}
          disabled={starting}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-amber-500 px-2 py-3 text-[13px] font-bold text-stone-950 shadow-amber transition active:scale-95 hover:bg-amber-400 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />새 게임
        </button>
        <button
          onClick={g.undo}
          disabled={!g.canUndo}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-stone-800 px-2 py-3 text-[13px] font-semibold text-amber-100/80 ring-1 ring-amber-200/10 transition active:scale-95 enabled:hover:bg-stone-700 disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-4 w-4" />무르기
        </button>
        <button
          onClick={() => {
            if (g.status.kind !== "playing") return;
            if (resignArm) {
              g.resign();
              setResignArm(false);
            } else {
              setResignArm(true);
            }
          }}
          disabled={g.status.kind !== "playing" || g.moves.length === 0}
          className={
            "flex items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[13px] font-semibold ring-1 transition active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed " +
            (resignArm
              ? "bg-rose-600 text-white ring-rose-400/40 hover:bg-rose-500"
              : "bg-stone-800 text-rose-300/80 ring-rose-400/15 enabled:hover:bg-stone-700")
          }
        >
          <Flag className="h-4 w-4" />
          {resignArm ? "정말?" : "기권"}
        </button>
      </div>

      {/* Rated game (랭킹전) — costs 1 token, affects Elo & rewards */}
      {!noSupabase && (
        <div className="flex flex-col gap-1.5">
          {ratedActive && g.status.kind === "playing" ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/15 px-4 py-3.5 text-sm font-bold text-amber-300 ring-1 ring-amber-400/30">
              <Crown className="h-4 w-4" />
              랭킹전 진행 중 · 결과가 순위에 반영돼요
            </div>
          ) : (
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
          )}
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
          onChange={(v) =>
            started ? void startPaidGame(v as Player) : practiceNewGame(v as Player)
          }
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
          onChange={(v) =>
            started
              ? void startPaidGame(g.humanColor, v as Difficulty)
              : practiceNewGame(g.humanColor, v as Difficulty)
          }
        />
        <div className="h-px bg-amber-200/8" />
        <Segmented
          label="착수"
          value={confirmMode ? "confirm" : "instant"}
          options={[
            { value: "confirm", label: "확인 후" },
            { value: "instant", label: "바로" },
          ]}
          onChange={(v) => changeConfirmMode(v === "confirm")}
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

      {isGameOver && !resultDismissed && (
        <ResultOverlay
          kind={
            g.status.kind === "draw"
              ? "draw"
              : g.status.kind === "won" && g.status.winner === g.humanColor
                ? "win"
                : "lose"
          }
          onClose={() => setResultDismissed(true)}
          onNewGame={() => {
            setResultDismissed(true);
            void startPaidGame();
          }}
        />
      )}

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

      {nickEditOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 px-6 backdrop-blur-sm"
          onClick={() => !savingNick && setNickEditOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-stone-900 p-5 shadow-xl ring-1 ring-amber-200/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2 text-amber-100">
              <UserRound className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold">닉네임 설정</h2>
            </div>
            <p className="mb-3 text-[11px] text-amber-200/50">
              랭킹에 표시될 이름이에요. 비워두면 이메일 앞부분으로 표시됩니다.
            </p>
            <input
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveNick();
              }}
              maxLength={20}
              placeholder="닉네임 (최대 20자)"
              autoFocus
              className="w-full rounded-xl bg-stone-800 px-3 py-2.5 text-sm text-amber-100 outline-none ring-1 ring-amber-200/10 placeholder:text-amber-200/30 focus:ring-amber-400/40"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setNickEditOpen(false)}
                className="flex-1 rounded-xl bg-stone-800 py-2.5 text-sm font-bold text-amber-200/70"
              >
                취소
              </button>
              <button
                onClick={saveNick}
                disabled={savingNick}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 py-2.5 text-sm font-bold text-stone-950 disabled:opacity-50"
              >
                {savingNick ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Start overlay (게임 시작 버튼) ───────────────────────────── */
function StartOverlay({
  color,
  difficulty,
  onStart,
  costLabel,
  busy,
}: {
  color: Player;
  difficulty: string;
  onStart: () => void;
  costLabel?: string | null;
  busy?: boolean;
}) {
  return (
    <div className="loading-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-3xl bg-stone-950/80 px-6 backdrop-blur-sm">
      <p className="text-sm font-medium text-amber-200/70">
        {color === Stone.Black ? "흑 (선공)" : "백 (후공)"} · 난이도 {difficulty}
      </p>
      <button
        onClick={onStart}
        disabled={busy}
        className="result-pop flex items-center gap-2 rounded-2xl bg-amber-500 px-8 py-4 text-lg font-black text-stone-950 shadow-amber transition active:scale-95 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6 fill-stone-950" />}
        게임 시작{costLabel ? ` · ${costLabel}` : ""}
      </button>
      <p className="text-xs text-amber-200/50">
        {costLabel ? "공부·출석·게시판으로 토큰을 모을 수 있어요" : "아래에서 돌·난이도를 먼저 골라도 돼요"}
      </p>
    </div>
  );
}

/* ── Result overlay (center WIN / LOSE / DRAW) ────────────────── */
function ResultOverlay({
  kind,
  onClose,
  onNewGame,
}: {
  kind: "win" | "lose" | "draw";
  onClose: () => void;
  onNewGame: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cfg = {
    win: { word: "WIN", ko: "당신 승리!", color: "text-amber-300", ring: "ring-amber-400/30", icon: <Trophy className="h-8 w-8" /> },
    lose: { word: "LOSE", ko: "AI 승리", color: "text-rose-300", ring: "ring-rose-400/30", icon: <Zap className="h-8 w-8" /> },
    draw: { word: "DRAW", ko: "무승부", color: "text-stone-200", ring: "ring-stone-400/30", icon: <Handshake className="h-8 w-8" /> },
  }[kind];

  return (
    <div
      className="loading-overlay fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 px-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={cfg.ko}
    >
      <div
        className={
          "result-pop flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl bg-stone-900/95 px-6 py-8 text-center ring-1 " +
          cfg.ring
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className={"flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-800/80 " + cfg.color}>
          {cfg.icon}
        </div>
        <div>
          <p className={"text-5xl font-black leading-none tracking-tight " + cfg.color}>{cfg.word}</p>
          <p className="mt-2 text-sm font-semibold text-amber-100/80">{cfg.ko}</p>
        </div>
        <div className="flex w-full flex-col gap-2 pt-1">
          <button
            onClick={onNewGame}
            className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-950 shadow-amber transition active:scale-95 hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            다시 하기
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl bg-stone-800 px-4 py-2.5 text-xs font-semibold text-amber-100/70 ring-1 ring-amber-200/10 transition active:scale-95 hover:bg-stone-700"
          >
            결과 보기 (닫기)
          </button>
        </div>
      </div>
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
