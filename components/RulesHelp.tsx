"use client";

import { useEffect } from "react";
import { X, Ban, Info } from "lucide-react";
import MiniBoard, { MiniStone } from "@/components/MiniBoard";

// ── Forbidden-pattern diagrams (x = column, y = row, 0-indexed) ──
const DOUBLE_THREE: MiniStone[] = [
  { x: 3, y: 1, color: "black" },
  { x: 3, y: 2, color: "black" },
  { x: 1, y: 3, color: "black" },
  { x: 2, y: 3, color: "black" },
];
const DOUBLE_FOUR: MiniStone[] = [
  { x: 4, y: 1, color: "black" },
  { x: 4, y: 2, color: "black" },
  { x: 4, y: 3, color: "black" },
  { x: 1, y: 4, color: "black" },
  { x: 2, y: 4, color: "black" },
  { x: 3, y: 4, color: "black" },
];
const OVERLINE: MiniStone[] = [
  { x: 1, y: 1, color: "black" },
  { x: 2, y: 1, color: "black" },
  { x: 3, y: 1, color: "black" },
  { x: 5, y: 1, color: "black" },
  { x: 6, y: 1, color: "black" },
];

// ── 띈(비약) 형태: 한 칸 떨어져 있어도 금수 ──
// 띈 삼삼: 가로 ●●_● + 세로 ●●_● (각각 빈칸 채우면 열린4) → 금수
const JUMP_THREE: MiniStone[] = [
  { x: 1, y: 2, color: "black" },
  { x: 4, y: 2, color: "black" }, // 가로 ● Ⓧ _ ●
  { x: 2, y: 1, color: "black" },
  { x: 2, y: 4, color: "black" }, // 세로 ● Ⓧ _ ●
];
// 띈 사사: 가로 ●●●_● + 세로 ●●●_● → 금수
const JUMP_FOUR: MiniStone[] = [
  { x: 1, y: 3, color: "black" },
  { x: 2, y: 3, color: "black" },
  { x: 5, y: 3, color: "black" }, // 가로 ● ● Ⓧ _ ●
  { x: 3, y: 1, color: "black" },
  { x: 3, y: 2, color: "black" },
  { x: 3, y: 5, color: "black" }, // 세로 ● ● Ⓧ _ ●
];
// 띈 5목: ● ● Ⓧ ● ● → 정확히 5 = 승리(금수 아님)
const GAP_FIVE: MiniStone[] = [
  { x: 1, y: 1, color: "black" },
  { x: 2, y: 1, color: "black" },
  { x: 4, y: 1, color: "black" },
  { x: 5, y: 1, color: "black" },
];
// 띈 장목: ● ● ● Ⓧ ● ● → 6목 = 금수
const GAP_OVERLINE: MiniStone[] = [
  { x: 1, y: 1, color: "black" },
  { x: 2, y: 1, color: "black" },
  { x: 3, y: 1, color: "black" },
  { x: 5, y: 1, color: "black" },
  { x: 6, y: 1, color: "black" },
];

export default function RulesHelp({ onClose }: { onClose: () => void }) {
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
      aria-label="렌주룰 도움말"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-stone-900 ring-1 ring-amber-200/15 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200/10 px-5 py-4">
          <h2 className="text-lg font-bold text-amber-100">렌주룰 — 금수 안내</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1.5 text-amber-200/60 transition hover:bg-stone-800 hover:text-amber-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* Basics */}
          <section className="rounded-2xl bg-stone-800/50 p-4 ring-1 ring-amber-200/10">
            <div className="mb-2 flex items-center gap-2 text-amber-200">
              <Info className="h-4 w-4" />
              <span className="text-sm font-semibold">기본 규칙</span>
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-amber-100/80">
              <li>
                <b className="text-amber-100">⚫ 흑(선공)</b>은 정확히{" "}
                <b className="text-amber-100">5개</b>로만 이깁니다. 아래 3가지 모양은{" "}
                <b className="text-rose-300">금수(두면 패배)</b>.
              </li>
              <li>
                <b className="text-amber-100">⚪ 백(후공)</b>은 제한이{" "}
                <b className="text-amber-100">없습니다</b>. 5개 이상이면 무조건 승리.
              </li>
              <li>
                <b className="text-amber-100">⭐ 예외</b>: 그 자리가 동시에 ‘정확히 5목’을
                완성하면 이기는 수가 최우선(금수여도 승리).
              </li>
            </ul>
            <p className="mt-3 text-xs text-amber-200/50">
              금수는 먼저 두는 흑이 너무 유리해서 주는 핸디캡이에요. 흑 차례엔 금수 자리에
              자동으로 <span className="text-rose-300">빨간 ✕</span>가 표시되고 둘 수 없습니다.
            </p>
          </section>

          {/* ① 삼삼 */}
          <RuleCard
            no="①"
            title="삼삼 (3·3)"
            desc="한 수로 ‘열린 3’을 두 방향에 동시에 만들면 금수. (열린 3 = 막지 않으면 곧 막을 수 없는 4가 되는 위협)"
          >
            <MiniBoard cols={6} rows={5} stones={DOUBLE_THREE} target={{ x: 3, y: 3 }} />
            <Legend>
              ✕ 자리에 두면 <b>가로 열린3</b> + <b>세로 열린3</b> = 삼삼
            </Legend>
          </RuleCard>

          {/* ② 사사 */}
          <RuleCard
            no="②"
            title="사사 (4·4)"
            desc="한 수로 ‘4’(한 칸만 더 두면 5)를 두 개 동시에 만들면 금수."
          >
            <MiniBoard cols={6} rows={5} stones={DOUBLE_FOUR} target={{ x: 4, y: 4 }} />
            <Legend>
              ✕ 자리에 두면 <b>가로 4</b> + <b>세로 4</b> = 사사
            </Legend>
          </RuleCard>

          {/* ③ 장목 */}
          <RuleCard
            no="③"
            title="장목 (6목 이상)"
            desc="흑이 6개 이상 일렬로 만들면 금수. 흑은 ‘정확히 5’로만 이겨야 합니다."
          >
            <MiniBoard cols={8} rows={3} stones={OVERLINE} target={{ x: 4, y: 1 }} />
            <Legend>
              ✕ 자리에 두면 ● 6개 연속 = 장목 (백은 6목이어도 그냥 승리)
            </Legend>
          </RuleCard>

          {/* 띈(비약) 형태 안내 */}
          <div className="rounded-2xl bg-amber-500/8 p-4 ring-1 ring-amber-400/20">
            <p className="text-[13px] leading-relaxed text-amber-100/85">
              <b className="text-amber-200">한 칸 띄어 있어도</b> 금수예요. 빈칸(`_`)을
              채우면 완성되니까, 붙어 있을 때와 똑같이 칩니다. (예: <b>● ● _ ●</b>)
            </p>
          </div>

          {/* 띈 삼삼 */}
          <RuleCard
            no="③-1"
            title="띈 삼삼 (3·3)"
            desc="떨어진 열린3 두 개를 동시에 만들어도 삼삼 금수. (가로 ●●_● + 세로 ●●_●)"
          >
            <MiniBoard cols={6} rows={6} stones={JUMP_THREE} target={{ x: 2, y: 2 }} />
            <Legend>
              ✕ 자리에 두면 가로·세로로 <b>띈 열린3</b> 두 개 = 삼삼
            </Legend>
          </RuleCard>

          {/* 띈 사사 */}
          <RuleCard
            no="③-2"
            title="띈 사사 (4·4)"
            desc="떨어진 4 두 개를 동시에 만들어도 사사 금수. (가로 ●●●_● + 세로 ●●●_●)"
          >
            <MiniBoard cols={7} rows={7} stones={JUMP_FOUR} target={{ x: 3, y: 3 }} />
            <Legend>
              ✕ 자리에 두면 가로·세로로 <b>띈 4</b> 두 개 = 사사
            </Legend>
          </RuleCard>

          {/* 5목 vs 장목 — "5"에 대한 오해 정리 */}
          <section className="rounded-2xl bg-stone-800/40 p-4 ring-1 ring-amber-200/10">
            <h3 className="mb-1 text-sm font-bold text-amber-100">
              “5”는 금수가 아니에요 (5목 vs 장목)
            </h3>
            <p className="mb-3 text-[13px] leading-relaxed text-amber-100/70">
              5목은 <b className="text-emerald-300">이기는 것(목표)</b>이에요. 띄어 있어도
              정확히 5개면 승리! 하지만 <b className="text-rose-300">6개 이상(장목)</b>은 흑에게
              금수랍니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MiniBoard cols={7} rows={3} stones={GAP_FIVE} target={{ x: 3, y: 1 }} targetKind="win" />
                <p className="mt-1.5 text-center text-[11px] text-emerald-300/80">
                  ● ● ✓ ● ● → 정확히 5목 = 승리
                </p>
              </div>
              <div>
                <MiniBoard cols={8} rows={3} stones={GAP_OVERLINE} target={{ x: 4, y: 1 }} />
                <p className="mt-1.5 text-center text-[11px] text-rose-300/80">
                  ● ● ● ✕ ● ● → 6목 장목 = 금수
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-amber-200/10 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-950 transition active:scale-[0.98] hover:bg-amber-400"
          >
            이해했어요
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  no,
  title,
  desc,
  children,
}: {
  no: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-stone-800/40 p-4 ring-1 ring-amber-200/10">
      <div className="mb-1 flex items-center gap-2">
        <Ban className="h-4 w-4 text-rose-400" />
        <h3 className="text-sm font-bold text-amber-100">
          <span className="text-rose-300">{no}</span> {title}
        </h3>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-amber-100/70">{desc}</p>
      <div className="mx-auto max-w-[280px]">{children}</div>
    </section>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 text-center text-xs leading-relaxed text-amber-200/60">
      {children}
    </p>
  );
}
