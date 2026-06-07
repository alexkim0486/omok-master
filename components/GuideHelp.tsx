"use client";

import { useEffect } from "react";
import {
  X,
  Coffee,
  Target,
  Swords,
  Coins,
  Gauge,
  RotateCcw,
  ChevronRight,
} from "lucide-react";

/**
 * 사용 설명서 + "공부 우선, 오목은 휴식" 안내문. 처음 방문 시 자동으로 한 번
 * 뜨고, 이후엔 헤더의 "도움말"에서 다시 열 수 있다.
 */
export default function GuideHelp({
  onClose,
  onOpenRules,
}: {
  onClose: () => void;
  onOpenRules: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="loading-overlay fixed inset-0 z-50 flex items-end justify-center bg-stone-950/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="오목 챔피언 사용 안내"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-stone-900 ring-1 ring-amber-200/15 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200/10 px-5 py-4">
          <h2 className="text-lg font-bold text-amber-100">오목 챔피언 사용 안내</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1.5 text-amber-200/60 transition hover:bg-stone-800 hover:text-amber-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          {/* 휴식 안내문 (가장 눈에 띄게) */}
          <section className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/25">
            <div className="mb-1.5 flex items-center gap-2 text-emerald-300">
              <Coffee className="h-5 w-5" />
              <span className="text-sm font-bold">공부 사이의 짧은 휴식이에요</span>
            </div>
            <p className="text-[13px] leading-relaxed text-emerald-100/85">
              오목은 공부하다가 머리를 식히는 <b className="text-emerald-200">휴식</b>용 게임이에요.
              공부에 방해되지 않는 선에서 <b className="text-emerald-200">한두 판만</b> 가볍게 두고,
              다시 책상으로 돌아가 집중해요. 토큰도 공부를 열심히 해야 쌓이니까,
              <b className="text-emerald-200"> 공부가 먼저, 오목은 보너스</b>랍니다. 🌿
            </p>
          </section>

          {/* 게임 방법 */}
          <GuideCard icon={<Target className="h-4 w-4 text-amber-300" />} title="게임 방법">
            <ul className="ml-1 list-disc space-y-1 pl-4 marker:text-amber-400/50">
              <li>바둑판을 <b>터치</b>해 돌을 놓아요.</li>
              <li>가로·세로·대각선으로 <b>돌 5개</b>를 먼저 이으면 승리!</li>
              <li><b>흑(선공)</b> 또는 <b>백(후공)</b>을 고를 수 있어요.</li>
              <li>
                흑은 금수(삼삼·사사·장목) 규칙이 있어요 — <span className="text-rose-300">빨간 ✕</span>
                자리엔 둘 수 없어요.
              </li>
            </ul>
            <button
              onClick={onOpenRules}
              className="mt-2 flex w-full items-center justify-between rounded-xl bg-stone-800/70 px-3 py-2.5 text-xs font-semibold text-amber-200/90 ring-1 ring-amber-200/10 transition hover:bg-stone-700"
            >
              렌주룰(금수) 그림으로 자세히 보기
              <ChevronRight className="h-4 w-4" />
            </button>
          </GuideCard>

          {/* 연습 vs 랭킹전 */}
          <GuideCard icon={<Swords className="h-4 w-4 text-amber-300" />} title="연습 게임 vs 랭킹전">
            <ul className="ml-1 list-disc space-y-1 pl-4 marker:text-amber-400/50">
              <li><b>연습 게임</b> — 토큰 1개로 3판. 부담 없이 연습해요. (관리자는 무료)</li>
              <li>
                <b>랭킹전</b> — 토큰 1개로 시작. 이기면 레이팅이 오르고 순위에 반영돼요.
              </li>
            </ul>
          </GuideCard>

          {/* 토큰 모으기 */}
          <GuideCard icon={<Coins className="h-4 w-4 text-amber-300" />} title="토큰은 공부로 모아요">
            <ul className="ml-1 list-disc space-y-1 pl-4 marker:text-amber-400/50">
              <li>집중 공부 <b>25분 = 토큰 1개</b> (하루 최대 8개)</li>
              <li>출석 체크 <b>+1</b></li>
              <li>게시판 글·댓글 <b>+1</b> (합쳐서 하루 3개까지)</li>
            </ul>
            <p className="mt-1.5 text-xs text-amber-200/60">
              공부를 열심히 할수록 오목도 더 즐길 수 있어요!
            </p>
          </GuideCard>

          {/* 난이도 */}
          <GuideCard icon={<Gauge className="h-4 w-4 text-amber-300" />} title="난이도">
            <p>
              쉬움 · 보통 · 어려움 · <b>최강</b> 중에 골라요. <b>최강</b>은 세계 대회 우승
              엔진이라 거의 못 이겨요 — 도전해 보세요!
            </p>
          </GuideCard>

          {/* 무르기 */}
          <GuideCard icon={<RotateCcw className="h-4 w-4 text-amber-300" />} title="무르기">
            <p>실수했을 때 한 수 되돌릴 수 있어요. (연습에서 부담 없이!)</p>
          </GuideCard>
        </div>

        {/* Footer */}
        <div className="border-t border-amber-200/10 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-950 transition active:scale-[0.98] hover:bg-amber-400"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}

function GuideCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-stone-800/40 p-4 ring-1 ring-amber-200/10">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-amber-100">{title}</h3>
      </div>
      <div className="text-[13px] leading-relaxed text-amber-100/75">{children}</div>
    </section>
  );
}
