# 배포 가이드 — 오목 챔피언 × 공부인 연동

두 앱을 같은 루트 도메인의 **서브도메인**으로 배포해 **재로그인 없는 SSO**를 완성합니다.

```
        같은 루트 도메인 (예: gongbuin.kr)
  ┌──────────────────────┬──────────────────────┐
  app.gongbuin.kr        omok.gongbuin.kr
  (공부인 = 로그인 창구)   (오목앱 = 별도 PWA)
        └──── 인증 쿠키 공유 (도메인 .gongbuin.kr) ────┘
              같은 Supabase 프로젝트 / 같은 계정
```

> **핵심 전제**: 두 앱이 **같은 루트 도메인의 서브도메인**이어야 쿠키 SSO가 됩니다.
> (예: `app.gongbuin.kr` ↔ `omok.gongbuin.kr`) 서로 다른 도메인이면 이 방식의 SSO는 불가.

---

## STEP A. 오목앱 배포 (Vercel 예시)

오목앱(`C:\Users\khw19\renju-master`)을 배포합니다.

1. **Git에 올리기**: renju-master를 GitHub 등에 push.
   - ⚠️ Rapfi가 **GPLv3**라 이 앱 소스는 공개 의무가 있습니다(저장소 public + LICENSE 포함). 이미 LICENSE/NOTICE 포함됨.
   - `public/engine/build/rapfi.data`(38MB)도 커밋돼야 합니다(정적 자산). `.gitignore`에 안 걸렸는지 확인.
2. **Vercel 프로젝트 생성** → 저장소 연결. 프레임워크 자동 감지(Next.js).
   - 빌드 명령은 `package.json`의 `next build --webpack` 그대로 사용(Turbopack 회피).
3. **환경변수 설정** (Vercel → Settings → Environment Variables):
   | 변수 | 값 |
   |------|-----|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://aelrxnfbajdxtxzlseiu.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (공부인과 동일한 anon key) |
   | `NEXT_PUBLIC_GONGBUIN_URL` | `https://app.gongbuin.kr` (공부인 주소) |
   | `NEXT_PUBLIC_COOKIE_DOMAIN` | `.gongbuin.kr` (루트 도메인, 앞에 점) |
4. **커스텀 도메인** 연결: `omok.gongbuin.kr` (DNS CNAME → Vercel).
5. 배포 후 `https://omok.gongbuin.kr` 접속 → 엔진 로딩(최초 39MB) 후 게임 동작 확인.

> 📌 단일스레드 엔진이라 **COOP/COEP 헤더 불필요** — 추가 설정 없이 동작합니다.
> 📌 Netlify로 해도 동일(빌드 `npm run build`, publish `.next`, 같은 env). 38MB 정적 파일 허용 확인.

---

## STEP B. 공부인 설정 + 재배포

공부인(`C:\Users\khw19\Projects\gongbuin`)에 환경변수 2개를 추가하고 재배포합니다.

1. **환경변수 추가** (공부인 호스팅 대시보드):
   | 변수 | 값 |
   |------|-----|
   | `NEXT_PUBLIC_OMOK_URL` | `https://omok.gongbuin.kr` |
   | `NEXT_PUBLIC_COOKIE_DOMAIN` | `.gongbuin.kr` |
2. **공부인 재배포** — 이번에 들어간 변경이 반영됩니다:
   - 홈 "오목 휴게소" 진입 카드
   - 토큰 적립(학습·출석·게시판)
   - SSO 쿠키 도메인(로그인 세션을 서브도메인과 공유)
3. 공부인이 **같은 루트 도메인**(예: `app.gongbuin.kr` 또는 `gongbuin.kr`)인지 확인.

> ⚠️ `NEXT_PUBLIC_COOKIE_DOMAIN`은 **양쪽 앱에 동일하게** 설정해야 합니다. 한쪽만 설정하면 SSO가 안 됩니다.

---

## STEP C. 배포 후 점검 (체크리스트)

1. [ ] 공부인에 **로그인** → 홈에 "오목 휴게소" 카드 + **보유 토큰** 표시
2. [ ] 카드 클릭 → 오목앱이 열리고 **재로그인 없이** 토큰 칩이 보임(SSO 성공)
3. [ ] **연습 게임** — 무료로 바로 플레이
4. [ ] **랭킹전 시작** → 토큰 1 차감 → 한 판 → 종료 시 레이팅 반영, `/ranking`에 순위 표시
5. [ ] 공부인에서 **출석 체크/게시판 글** → 오목앱 토큰 잔액 증가 확인
6. [ ] 공부인에서 **25분 집중 학습 종료** → 토큰 +1 확인

빠른 DB 확인(공부인 Supabase SQL Editor):
```sql
-- 특정 학생의 토큰 적립/사용 내역
select reason, delta, created_at from public.omok_token_ledger
  where user_id = '<학생 uuid>' order by created_at desc limit 20;
-- 랭킹
select nickname, rating, games, wins from public.omok_ratings order by rating desc limit 10;
```

---

## 문제 해결

| 증상 | 원인 / 해결 |
|------|------|
| 오목앱에서 매번 다시 로그인하라고 함 | 두 앱이 **같은 루트 도메인의 서브도메인**이 아님 / `NEXT_PUBLIC_COOKIE_DOMAIN`이 양쪽에 동일하지 않음 / 한쪽이 http, 다른 쪽 https |
| 카드 링크가 `#`로 안 움직임 | 공부인에 `NEXT_PUBLIC_OMOK_URL` 미설정 → 설정 후 재배포 |
| 토큰이 안 쌓임 | 공부인 재배포 안 됨(적립 코드 미반영) / 학생이 로그인 안 됨 / 0018 미적용 |
| 랭킹에 이름이 "플레이어"로만 | 0019 미적용 → `0019_omok_ranking_names.sql` 실행 |
| 토큰 부족으로 랭킹전 불가 | 정상 — 공부·출석·게시판으로 토큰을 모아야 함 |

## 라이선스 (잊지 말기)
오목앱은 **GPLv3**(Rapfi 엔진 포함). 배포 시 소스 공개 의무 — 저장소를 public으로 두고 LICENSE/NOTICE를 포함하세요. 공부인 앱은 GPL과 무관(별도 앱, 링크로만 연결).
