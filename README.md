# 렌주 마스터 (Renju Master)

세계 챔피언 오목 AI와 대국하는 **모바일 PWA** 게임입니다. 렌주룰(금수: 삼삼·사사·장목)을 적용했고, AI는 **Gomocup 2025 우승 엔진 [Rapfi](https://github.com/dhbloo/rapfi)** 를 WebAssembly로 브라우저에서 직접 구동합니다.

## 특징

- 🏆 **세계 최강 AI** — Gomocup 2025 일반/렌주 리그 우승 엔진(Rapfi)을 WASM으로 탑재. 신경망(NNUE) + 알파베타 탐색.
- 🧩 **표준 렌주룰** — 흑 금수(삼삼·사사·장목) 판정. 자체 TypeScript 판정기 + 21개 단위 테스트로 검증.
- 📱 **설치형 PWA** — 홈화면 설치, 오프라인 플레이(엔진 ~39MB는 최초 1회 다운로드 후 캐시).
- 🎚️ **난이도 4단계** — 쉬움/보통/어려움/최강(사고 시간 0.3s~8s).
- ⚫⚪ 흑(선공)/백(후공) 선택, 무르기, 승리/금수 표시.

## 기술 스택

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- **Rapfi** 엔진 (WebAssembly, single-thread + SIMD128) — Web Worker에서 구동
- 통신: Gomocup 프로토콜 (`START` / `INFO RULE 2` / `BOARD …,side DONE`)

> ⚠️ 이 머신에서는 Turbopack이 OOM으로 죽어, `dev`/`build` 모두 `--webpack` 플래그로 고정돼 있습니다.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (webpack)
npm run build        # 프로덕션 빌드 (webpack)
npm start            # 빌드 결과 서빙
npm test             # 렌주 금수 규칙 단위 테스트 (vitest)
```

브라우저 엔진 동작 검증(시스템 Chrome 사용):

```bash
npm run build && npm start &           # 서버 기동
PORT=3000 node test/engine-smoke.mjs   # 엔진 로드 + 착수 검증
PORT=3000 node test/app-flow.mjs       # 사람 착수 → AI 응수 통합 검증
```

## 배포

정적 자산(`public/engine/build/rapfi.data` ≈ 38MB 포함)만 서빙하면 되므로 Vercel/Netlify 등에 그대로 배포 가능합니다. **싱글스레드 엔진을 쓰기 때문에 `SharedArrayBuffer`(COOP/COEP 헤더)가 필요 없습니다.** 일부 호스트의 개별 파일 용량 제한(38MB)만 확인하세요.

## 프로젝트 구조

```
app/                 라우트·레이아웃·매니페스트(PWA)
components/
  GameBoard.tsx      캔버스 바둑판(터치·HiDPI·금수/승리 표시)
  GameScreen.tsx     메인 화면(보드+컨트롤+상태+로딩)
lib/
  renju/             types · board(승리판정) · forbidden(금수 판정 + 테스트)
  ai/                rapfiClient(엔진 클라이언트) · simpleAi(폴백)
  game/useGame.ts    게임 상태/턴/AI 구동 훅
public/engine/       engine-worker.js + build/(Rapfi wasm·data)
test/                브라우저 스모크/통합 테스트
```

## 라이선스 (중요)

이 앱은 **GPLv3** 엔진(Rapfi)을 재배포하므로, 전체가 **GPLv3** 로 배포됩니다([LICENSE](./LICENSE)). 배포 시 소스 코드를 함께 제공하거나 소스 위치를 명시해야 합니다. 엔진 원본 소스: <https://github.com/dhbloo/rapfi>. 자세한 고지는 [NOTICE](./NOTICE) 참고.
