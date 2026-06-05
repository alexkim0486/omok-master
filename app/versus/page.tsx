"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Plus,
  LogIn,
  Loader2,
  Copy,
  Check,
  Flag,
  Trophy,
  Zap,
  Handshake,
  WifiOff,
} from "lucide-react";
import { getSupabaseBrowserClient, gongbuinUrl } from "@/lib/supabase/client";
import { useAccount } from "@/lib/omok/useAccount";
import { createRoom, joinRoom } from "@/lib/omok/pvp";
import { usePvpRoom } from "@/lib/omok/usePvpRoom";
import { Stone } from "@/lib/renju/types";
import GameBoard from "@/components/GameBoard";

export default function VersusPage() {
  const { isGuest, noSupabase, loading } = useAccount();
  const [roomId, setRoomId] = useState<string | null>(null);

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
          <Users className="h-5 w-5 text-amber-400" />
          <h1 className="game-title text-xl font-black tracking-tight text-amber-100">
            친구 대전
          </h1>
        </div>
      </header>

      {noSupabase || (!loading && isGuest) ? (
        <GuestGate />
      ) : roomId ? (
        <Room roomId={roomId} onLeave={() => setRoomId(null)} />
      ) : (
        <Lobby onEnter={setRoomId} />
      )}
    </div>
  );
}

function GuestGate() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-800/50 p-8 text-center ring-1 ring-amber-200/10">
      <Users className="h-10 w-10 text-amber-300/70" />
      <p className="text-sm text-amber-100/80">
        친구 대전은 <b className="text-amber-200">로그인</b>이 필요해요.
        <br />
        공부인 계정으로 로그인하면 친구와 실시간 오목을 둘 수 있어요.
      </p>
      <a
        href={gongbuinUrl()}
        className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 transition active:scale-95 hover:bg-amber-400"
      >
        <LogIn className="h-4 w-4" />
        공부인 로그인하러 가기
      </a>
    </div>
  );
}

function Lobby({ onEnter }: { onEnter: (id: string) => void }) {
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy("create");
    setError(null);
    const r = await createRoom(supabase);
    setBusy(null);
    if (r) onEnter(r.id);
    else setError("방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  };

  const handleJoin = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("코드를 정확히 입력해 주세요.");
      return;
    }
    setBusy("join");
    setError(null);
    const id = await joinRoom(supabase, c);
    setBusy(null);
    if (id) onEnter(id);
    else setError("그런 방이 없어요. 코드를 확인하거나, 이미 시작된 방일 수 있어요.");
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handleCreate}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-4 text-sm font-bold text-stone-950 shadow-amber transition active:scale-95 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy === "create" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
        방 만들기 (코드 받기)
      </button>

      <div className="flex items-center gap-3 text-xs text-amber-200/40">
        <div className="h-px flex-1 bg-amber-200/10" />
        또는
        <div className="h-px flex-1 bg-amber-200/10" />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-stone-800/50 p-4 ring-1 ring-amber-200/10">
        <label className="text-xs font-semibold text-amber-200/70">친구 방 코드 입력</label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="예: AB3KP"
            className="flex-1 rounded-xl bg-stone-900/70 px-4 py-3 text-center text-lg font-bold uppercase tracking-[0.3em] text-amber-100 placeholder:tracking-normal placeholder:text-amber-200/30 ring-1 ring-amber-200/10 outline-none focus:ring-amber-400/40"
          />
          <button
            onClick={handleJoin}
            disabled={busy !== null}
            className="rounded-xl bg-stone-700 px-5 text-sm font-bold text-amber-100 transition active:scale-95 hover:bg-stone-600 disabled:opacity-50"
          >
            {busy === "join" ? <Loader2 className="h-5 w-5 animate-spin" /> : "입장"}
          </button>
        </div>
      </div>

      {error && <p className="text-center text-xs text-rose-300">{error}</p>}

      <p className="px-2 text-center text-[11px] leading-relaxed text-amber-200/40">
        같은 공부인 계정 친구끼리 코드를 공유해 실시간으로 오목을 둬요. 방을 만든 사람이 흑(선공)이에요.
      </p>
    </div>
  );
}

function Room({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const v = usePvpRoom(roomId);
  const [copied, setCopied] = useState(false);
  const [resignArm, setResignArm] = useState(false);

  if (v.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-amber-200/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중…
      </div>
    );
  }
  if (!v.room) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-sm text-amber-200/60">방을 찾을 수 없어요.</p>
        <button onClick={onLeave} className="rounded-xl bg-stone-700 px-5 py-2.5 text-sm font-semibold text-amber-100">
          돌아가기
        </button>
      </div>
    );
  }

  const room = v.room;
  const over = room.status === "finished" || room.status === "abandoned";

  // 대기 화면 (호스트가 친구를 기다림)
  if (room.status === "waiting") {
    const copy = () => {
      try {
        navigator.clipboard.writeText(room.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    };
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-stone-800/50 p-7 text-center ring-1 ring-amber-200/10">
        <p className="text-sm text-amber-100/80">친구에게 이 코드를 알려주세요</p>
        <div className="flex items-center gap-3">
          <span className="select-all rounded-2xl bg-stone-900/70 px-6 py-4 text-4xl font-black tracking-[0.25em] text-amber-300 ring-1 ring-amber-400/20">
            {room.code}
          </span>
          <button
            onClick={copy}
            aria-label="코드 복사"
            className="rounded-xl bg-stone-700 p-3 text-amber-100 transition hover:bg-stone-600"
          >
            {copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-200/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          친구가 입장하길 기다리는 중…
        </div>
        <button
          onClick={() => {
            v.resign();
            onLeave();
          }}
          className="text-xs text-amber-200/50 underline underline-offset-2 hover:text-amber-100"
        >
          취소하고 나가기
        </button>
      </div>
    );
  }

  // 진행/종료 화면
  const myResult =
    over && room.winner
      ? room.winner === "draw"
        ? "draw"
        : room.winner === v.myRole
          ? "win"
          : "lose"
      : null;

  const turnText = over
    ? "게임 종료"
    : v.isMyTurn
      ? "내 차례 — 어디에 둘까요?"
      : `${v.opponentNick || "상대"} 차례…`;

  return (
    <div className="flex flex-col gap-3">
      {/* 상태바 */}
      <div className="flex items-center justify-between rounded-2xl bg-stone-800/60 px-4 py-3 ring-1 ring-amber-200/10">
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <span
            className={
              "inline-block h-3.5 w-3.5 rounded-full ring-1 " +
              (v.myColor === Stone.Black ? "bg-stone-950 ring-stone-500" : "bg-stone-100 ring-stone-300")
            }
          />
          나 ({v.myColor === Stone.Black ? "흑" : "백"})
        </span>
        <div className="flex items-center gap-3">
          {v.secsLeft != null && !over && (
            <span
              className={
                "text-sm font-black tabular-nums " +
                (v.secsLeft <= 10 ? "text-rose-300 animate-pulse" : "text-amber-200")
              }
            >
              {v.secsLeft}s
            </span>
          )}
          <span className="text-xs text-amber-200/60">{turnText}</span>
        </div>
      </div>

      {/* 상대 끊김 안내 */}
      {v.opponentStale && !over && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 ring-1 ring-rose-400/25">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
            <WifiOff className="h-3.5 w-3.5" />
            상대 연결이 끊긴 것 같아요
          </span>
          <button
            onClick={v.claimWin}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95 hover:bg-rose-500"
          >
            부전승 받기
          </button>
        </div>
      )}

      {/* 보드 */}
      <div className="relative rounded-3xl ring-1 ring-amber-200/8 shadow-board">
        <GameBoard
          grid={v.grid}
          lastMove={v.lastMove}
          winLine={v.winLine}
          forbidden={v.forbidden}
          disabled={!v.isMyTurn || over}
          onPlay={v.play}
        />
        {myResult && <PvpResult kind={myResult} reason={room.reason} onLeave={onLeave} />}
      </div>

      {/* 액션 */}
      {!over ? (
        <button
          onClick={() => {
            if (resignArm) {
              v.resign();
            } else {
              setResignArm(true);
              setTimeout(() => setResignArm(false), 3000);
            }
          }}
          className={
            "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 transition active:scale-95 " +
            (resignArm
              ? "bg-rose-600 text-white ring-rose-400/40"
              : "bg-stone-800 text-rose-300/80 ring-rose-400/15 hover:bg-stone-700")
          }
        >
          <Flag className="h-4 w-4" />
          {resignArm ? "정말 기권할까요? (다시 탭)" : "기권하기"}
        </button>
      ) : (
        <button
          onClick={onLeave}
          className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-bold text-stone-950 transition active:scale-95 hover:bg-amber-400"
        >
          <Users className="h-4 w-4" />
          로비로 (다시 대전)
        </button>
      )}
    </div>
  );
}

function PvpResult({
  kind,
  reason,
  onLeave,
}: {
  kind: "win" | "lose" | "draw";
  reason: string | null;
  onLeave: () => void;
}) {
  const cfg = {
    win: { word: "WIN", ko: "승리!", color: "text-amber-300", ring: "ring-amber-400/30", icon: <Trophy className="h-8 w-8" /> },
    lose: { word: "LOSE", ko: "패배", color: "text-rose-300", ring: "ring-rose-400/30", icon: <Zap className="h-8 w-8" /> },
    draw: { word: "DRAW", ko: "무승부", color: "text-stone-200", ring: "ring-stone-400/30", icon: <Handshake className="h-8 w-8" /> },
  }[kind];
  const sub =
    reason === "abandon"
      ? kind === "win"
        ? "상대가 나가서 부전승"
        : "연결 종료"
      : reason === "resign"
        ? kind === "win"
          ? "상대 기권"
          : "기권"
        : reason === "timeout"
          ? kind === "win"
            ? "상대 시간 초과"
            : "시간패"
          : "";

  return (
    <div className="loading-overlay absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-stone-950/80 px-6 backdrop-blur-sm">
      <div className={"result-pop flex w-full max-w-[15rem] flex-col items-center gap-3 rounded-3xl bg-stone-900/95 px-6 py-7 text-center ring-1 " + cfg.ring}>
        <div className={"flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-800/80 " + cfg.color}>
          {cfg.icon}
        </div>
        <div>
          <p className={"text-4xl font-black tracking-tight " + cfg.color}>{cfg.word}</p>
          <p className="mt-1 text-sm font-semibold text-amber-100/80">{cfg.ko}</p>
          {sub && <p className="mt-0.5 text-xs text-amber-200/50">{sub}</p>}
        </div>
        <button
          onClick={onLeave}
          className="mt-1 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-stone-950 transition active:scale-95 hover:bg-amber-400"
        >
          확인
        </button>
      </div>
    </div>
  );
}
