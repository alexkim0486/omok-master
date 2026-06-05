# 렌주 마스터 × 공부인(gongbuin) 연동 — Phase 1 설계 문서

> 목적: 학생앱 **gongbuin**의 학습·출석·게시판 활동으로 **플레이 토큰**을 적립하고,
> 별도 PWA인 **렌주 마스터(오목)**에서 그 토큰으로 랭킹전을 즐기게 하는 리텐션 루프를 만든다.
> 방식은 **별도 앱 + 링크 연동**(Rapfi GPL 격리) + **Supabase 단일계정 공유(SSO)**.

- 오목앱(렌주 마스터): 독립 배포 PWA, 엔진 Rapfi(GPLv3) → **GPL은 이 앱에만 격리**
- 학생앱(gongbuin): Supabase 프로젝트 `aelrxnfbajdxtxzlseiu`, 단일계정
- 핵심 원칙: **gongbuin 기존 테이블은 건드리지 않고**, 신규 마이그레이션으로만 추가한다.

---

## 0. 전체 그림

```
            ┌──────────────── gongbuin (학생앱) ────────────────┐
  학습(focus) ─┐                                                  │
  출석(stamp) ─┼─▶ [토큰 적립 RPC]  ──▶  profiles.omok_tokens     │
  게시판(post) ─┘            ▲                 │ (잔액)            │
            │               │ 멱등 ledger      │                  │
            │        omok_token_ledger         │                  │
            │                                  ▼                  │
            │        "오목 휴게소" 진입 카드 (잔액 표시) ──링크──┐ │
            └──────────────────────────────────────────────────┼─┘
                       같은 Supabase / 같은 로그인(SSO)          │
            ┌──────────────── 렌주 마스터 (오목앱) ◀────────────┘
            │ 연습(무료)  |  랭킹전(토큰 1 차감) ─▶ 결과 RPC      │
            │                         ├─ 토큰 원자 차감          │
            │                         ├─ omok_matches 기록       │
            │                         └─ omok_ratings(Elo) 갱신  │
            └───────────────────────────────────────────────────┘
```

설계 의도: **공부는 토큰의 ‘에너지 충전’, 오목은 그 에너지의 ‘소비처’**.
재미를 막지 않기 위해 **연습 대국은 무료**, **랭킹전(레이팅·보상 반영)만 토큰 1개**를 쓴다.

---

## 1. 토큰 경제 (적립 / 차감 표)

### 적립 (gongbuin 활동 → 토큰)
| 소스 | 트리거 | 적립 | 하루 상한 | 멱등 키(중복 방지) |
|------|--------|------|-----------|----------------------|
| **학습** | `study_sessions.ended_at` 채워질 때 | `floor(duration_min / 25)` 토큰 | 8 토큰(=200분) | `('study', session_id)` |
| **출석** | `board_stamps` insert(하루 1회) | +2 토큰 | 2 (자연 1회) | `('attend', stamp_date)` |
| **게시판 글** | `board_posts` insert | +3 토큰 | 6(=2글) | `('post', post_id)` |
| **댓글** | `board_comments` insert | +1 토큰 | 3 | `('comment', comment_id)` |
| **연속 출석 보너스** | 7일 연속 달성 | +10 토큰 | — | `('streak7', 주차키)` |

### 차감 (토큰 → 오목)
| 사용처 | 비용 |
|--------|------|
| 연습 대국(레이팅 미반영) | **0 (무료)** |
| 랭킹전 1판(레이팅·보상 반영) | **1 토큰** |
| 최강 AI 도전 랭킹전 | 1 토큰(동일) |

### 보상 (오목 결과 → gongbuin)
| 결과 | 보상 |
|------|------|
| 랭킹전 승리 | Elo +Δ, 토큰 환급 없음 |
| 최강 AI 격파 | 뱃지 `slayer`, 토큰 +5 보너스(`('slay', match_id)`) |
| N연승 | 토큰 보너스(`('streakwin', match_id)`) |

> 숫자는 운영 중 조정 가능하도록 **DB 설정 테이블 `omok_config`**(key/value)로 뺀다.

---

## 2. 데이터 모델 (신규 마이그레이션만)

`gongbuin/supabase/migrations/0018_omok.sql` 로 추가. 기존 테이블 변경은 `profiles`에 컬럼 1개 추가뿐(비파괴).

```sql
-- 2-1) 토큰 잔액(캐시) : 빠른 읽기용. 원장(ledger)이 진실의 원천.
alter table public.profiles
  add column if not exists omok_tokens integer not null default 0;

-- 2-2) 토큰 원장 (append-only, 감사 + 멱등성)
create table if not exists public.omok_token_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      integer not null,            -- +적립 / -차감
  reason     text not null,               -- 'study'|'attend'|'post'|'comment'|'play'|'slay'...
  ref_id     text not null,               -- 멱등 키의 식별자(session_id, date, post_id, match_id...)
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref_id)        -- 같은 행동으로 2번 적립 불가
);
create index if not exists omok_ledger_user_idx on public.omok_token_ledger(user_id, created_at desc);

-- 2-3) 대국 기록
create table if not exists public.omok_matches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mode        text not null check (mode in ('ai','pvp')),
  rated       boolean not null default false,    -- 랭킹전 여부(토큰 사용)
  difficulty  text,                              -- 'easy'|'normal'|'hard'|'master' (ai 모드)
  my_color    smallint not null,                 -- 1=흑,2=백
  result      text not null check (result in ('win','loss','draw')),
  moves       jsonb,                             -- 기보(선택)
  rating_delta integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists omok_matches_user_idx on public.omok_matches(user_id, created_at desc);

-- 2-4) 레이팅(Elo) + 전적 요약
create table if not exists public.omok_ratings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  rating      integer not null default 1200,
  games       integer not null default 0,
  wins        integer not null default 0,
  losses      integer not null default 0,
  draws       integer not null default 0,
  streak      integer not null default 0,
  best_streak integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- 2-5) 운영 설정(적립/차감 수치 튜닝)
create table if not exists public.omok_config (
  key text primary key,
  value integer not null
);
insert into public.omok_config(key,value) values
  ('minutes_per_token',25),('study_daily_cap',8),
  ('attend_reward',2),('post_reward',3),('post_daily_cap',6),
  ('comment_reward',1),('comment_daily_cap',3),
  ('rated_cost',1),('slay_bonus',5)
on conflict (key) do nothing;
```

### RLS
```sql
alter table public.omok_token_ledger enable row level security;
alter table public.omok_matches      enable row level security;
alter table public.omok_ratings      enable row level security;

-- 본인 데이터만 읽기. 쓰기는 전부 RPC(security definer)로만 → 자기 토큰 위조 불가.
create policy "ledger read"  on public.omok_token_ledger for select using (auth.uid() = user_id);
create policy "matches read" on public.omok_matches      for select using (auth.uid() = user_id);
create policy "ratings read public" on public.omok_ratings for select using (true); -- 랭킹 공개
```
> 적립/차감/대국기록은 **테이블 직접 insert 금지**, 아래 RPC로만 수행한다(보안 핵심).

---

## 3. 핵심 RPC (security definer)

### 3-1) 적립 (멱등)
```sql
create or replace function public.omok_grant(p_reason text, p_ref text, p_amount int)
returns integer language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  if p_amount <= 0 then return null; end if;
  insert into public.omok_token_ledger(user_id, delta, reason, ref_id)
    values (auth.uid(), p_amount, p_reason, p_ref)
    on conflict (user_id, reason, ref_id) do nothing;   -- 이미 적립됨 → 무시(멱등)
  if not found then
    return (select omok_tokens from public.profiles where id = auth.uid());
  end if;
  update public.profiles set omok_tokens = omok_tokens + p_amount
    where id = auth.uid() returning omok_tokens into v_bal;
  return v_bal;
end $$;
grant execute on function public.omok_grant(text,text,int) to authenticated;
```

### 3-2) 랭킹전 시작(원자 차감)
`consume_tutor_credit` 패턴 그대로. 토큰 0이면 NULL → 클라가 "토큰 부족" 처리.
```sql
create or replace function public.omok_spend_rated()
returns integer language plpgsql security definer set search_path = public as $$
declare v_bal integer; v_cost integer;
begin
  select value into v_cost from public.omok_config where key='rated_cost';
  update public.profiles set omok_tokens = omok_tokens - coalesce(v_cost,1)
    where id = auth.uid() and omok_tokens >= coalesce(v_cost,1)
    returning omok_tokens into v_bal;
  if v_bal is null then return null; end if;
  insert into public.omok_token_ledger(user_id,delta,reason,ref_id)
    values (auth.uid(), -coalesce(v_cost,1), 'play', gen_random_uuid()::text);
  return v_bal;
end $$;
grant execute on function public.omok_spend_rated() to authenticated;
```

### 3-3) 대국 결과 기록 + 레이팅 갱신
승패를 받아 `omok_matches` 기록, `omok_ratings` Elo 갱신, 최강 격파/연승 보너스 적립까지 한 트랜잭션.
```sql
create or replace function public.omok_record_result(
  p_mode text, p_rated boolean, p_difficulty text,
  p_color smallint, p_result text, p_moves jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_match uuid; v_delta int := 0; v_r int;
begin
  -- (AI 난이도 기반 가상 상대 레이팅으로 Elo 계산: easy 800 / normal 1100 / hard 1500 / master 2200)
  -- … Elo 계산 후 v_delta 산출 …
  insert into public.omok_matches(user_id,mode,rated,difficulty,my_color,result,moves,rating_delta)
    values (auth.uid(),p_mode,p_rated,p_difficulty,p_color,p_result,p_moves,v_delta)
    returning id into v_match;

  if p_rated then
    insert into public.omok_ratings(user_id) values(auth.uid()) on conflict do nothing;
    update public.omok_ratings set
      rating = rating + v_delta,
      games = games+1,
      wins = wins + (p_result='win')::int,
      losses = losses + (p_result='loss')::int,
      draws = draws + (p_result='draw')::int,
      streak = case when p_result='win' then streak+1 else 0 end,
      best_streak = greatest(best_streak, case when p_result='win' then streak+1 else 0 end),
      updated_at = now()
    where user_id = auth.uid();

    if p_result='win' and p_difficulty='master' then
      perform public.omok_grant('slay', v_match::text,
        (select value from public.omok_config where key='slay_bonus'));
    end if;
  end if;
  return jsonb_build_object('match_id',v_match,'rating_delta',v_delta);
end $$;
grant execute on function public.omok_record_result(text,boolean,text,smallint,text,jsonb) to authenticated;
```

---

## 4. 적립 훅 — 학습 · 출석 · 게시판 (사용자 요청 핵심)

두 가지 방식. **DB 트리거(권장, 누락·우회 불가)** 와 RPC 호출(앱 코드에서) 중 선택.
아래는 트리거 방식(서버에서 자동 적립, 클라 신뢰 불필요).

### 4-1) 학습 → 토큰 (세션 종료 시)
```sql
create or replace function public.tg_study_grant() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_min int; v_per int; v_cap int; v_today int; v_tokens int;
begin
  if new.ended_at is not null and (old.ended_at is null) then
    select value into v_per from omok_config where key='minutes_per_token';
    select value into v_cap from omok_config where key='study_daily_cap';
    v_min := floor(new.duration_sec/60.0);
    v_tokens := floor(v_min / greatest(v_per,1));
    -- 오늘 학습으로 이미 적립한 양 확인 → 상한 적용
    select coalesce(sum(delta),0) into v_today from omok_token_ledger
      where user_id=new.user_id and reason='study'
        and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul');
    v_tokens := least(v_tokens, greatest(v_cap - v_today, 0));
    if v_tokens > 0 then
      insert into omok_token_ledger(user_id,delta,reason,ref_id)
        values(new.user_id, v_tokens, 'study', new.id::text)
        on conflict do nothing;
      update profiles set omok_tokens = omok_tokens + v_tokens where id=new.user_id;
    end if;
  end if;
  return new;
end $$;
create trigger study_grant after update on public.study_sessions
  for each row execute function public.tg_study_grant();
```

### 4-2) 출석 → 토큰 (board_stamps insert)
```sql
create or replace function public.tg_attend_grant() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_r int;
begin
  select value into v_r from omok_config where key='attend_reward';
  insert into omok_token_ledger(user_id,delta,reason,ref_id)
    values(new.user_id, v_r, 'attend', new.stamp_date::text)
    on conflict do nothing;
  if found then
    update profiles set omok_tokens = omok_tokens + v_r where id=new.user_id;
  end if;
  return new;
end $$;
create trigger attend_grant after insert on public.board_stamps
  for each row execute function public.tg_attend_grant();
```

### 4-3) 게시판 글 → 토큰 (board_posts insert, 일일 상한)
```sql
create or replace function public.tg_post_grant() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_r int; v_cap int; v_today int;
begin
  select value into v_r   from omok_config where key='post_reward';
  select value into v_cap from omok_config where key='post_daily_cap';
  select coalesce(sum(delta),0) into v_today from omok_token_ledger
    where user_id=new.user_id and reason='post'
      and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul');
  if v_today < v_cap then
    insert into omok_token_ledger(user_id,delta,reason,ref_id)
      values(new.user_id, least(v_r, v_cap - v_today), 'post', new.id::text)
      on conflict do nothing;
    update profiles set omok_tokens = omok_tokens
      + least(v_r, v_cap - v_today) where id=new.user_id;
  end if;
  return new;
end $$;
create trigger post_grant after insert on public.board_posts
  for each row execute function public.tg_post_grant();
```
(댓글도 동일 패턴 `board_comments` + `comment_reward`/`comment_daily_cap`.)

> **어뷰징 방지**: 일일 상한 + 멱등 ledger + (선택) 게시글 최소 길이 체크(트리거에서 `length(new.content) >= 20` 조건). 글 삭제 후 재작성으로 재적립? → ref_id가 post_id라 같은 글엔 1회뿐, 새 글은 상한이 막는다.

---

## 5. SSO (단일 로그인) 설계

두 앱이 **같은 Supabase 프로젝트**를 보므로 user는 동일. 관건은 "오목앱에서 재로그인 없이 세션 인식".

### 권장: 같은 루트 도메인 + 서브도메인 쿠키 공유
- 배포: gongbuin = `app.공부인.kr`, 오목 = `omok.공부인.kr`
- 두 앱 모두 `@supabase/ssr` 사용, **쿠키 `domain=.공부인.kr`** 로 설정 → gongbuin 로그인 쿠키를 오목앱이 그대로 읽음.
- 오목앱 `middleware.ts`: 세션 없으면 `https://app.공부인.kr/login?redirect=https://omok.공부인.kr` 로 보냄.

### 대안: 서로 다른 도메인일 때 (원타임 토큰 핸드오프)
- gongbuin이 "오목 가기" 클릭 시 RPC `omok_issue_ott()` 로 60초짜리 일회용 토큰 발급 → `omok.xxx/enter?ott=...`
- 오목앱이 `ott`를 RPC `omok_exchange_ott(ott)`로 교환해 Supabase 세션 수립.
- (구현 부담 큼 → Phase 1은 **서브도메인 방식**을 기본 권장)

### 게스트 허용
- 비로그인도 **연습 대국 자유**. 랭킹전·적립·랭킹은 로그인 필요 → 자연스러운 가입 유도.

---

## 6. 변경 파일 목록

### gongbuin (학생앱)
| 파일 | 작업 |
|------|------|
| `supabase/migrations/0018_omok.sql` | 신규: 테이블·RLS·RPC·트리거(2~4장) |
| `src/lib/omok.ts` | 신규: `getMyTokens()`, `getOmokRanking()`, 오목앱 URL 빌더 |
| `src/app/(app)/…/page.tsx`(홈/계정) | "오목 휴게소" 진입 카드(잔액 표시 + 링크) |
| `.env.local` | 오목앱 URL 환경변수 `NEXT_PUBLIC_OMOK_URL` |

### renju-master (오목앱)
| 파일 | 작업 |
|------|------|
| `lib/supabase/client.ts` (신규) | gongbuin Supabase 프로젝트로 `@supabase/ssr` 클라 |
| `middleware.ts` (신규) | 세션 확인·랭킹전 진입 가드 |
| `lib/game/useGame.ts` | 랭킹전 모드 시작 시 `omok_spend_rated()`, 종료 시 `omok_record_result(...)` 호출 |
| `components/GameScreen.tsx` | 토큰 잔액 배지, "연습/랭킹전" 토글, 부족 시 안내 |
| `app/ranking/page.tsx` (신규) | `omok_ratings` 랭킹 보드 |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`(gongbuin 프로젝트) |

> 오목앱은 GPL 격리를 위해 **별도 레포·별도 배포** 유지. Supabase 연동 코드는 GPL과 무관.

---

## 7. 구현 순서 (Phase 1 체크리스트)

1. [ ] `0018_omok.sql` 작성 → **스테이징/개발 Supabase에서 먼저 검증**(라이브 직접 X)
2. [ ] gongbuin: `lib/omok.ts` + 진입 카드(잔액·링크)
3. [ ] 오목앱: Supabase 클라/미들웨어 + 연습/랭킹전 토글
4. [ ] 오목앱: 랭킹전 start(차감)·end(결과기록) 연동
5. [ ] 오목앱: 랭킹 보드 페이지
6. [ ] 적립 트리거 E2E 검증(학습 종료/출석/글 작성 → 토큰 +)
7. [ ] 어뷰징 점검(상한·멱등·최소길이) + RLS 침투 테스트
8. [ ] 서브도메인 배포 + 쿠키 SSO 실기기 확인

## 8. 리스크 / 결정 필요
- **도메인 구성**: 서브도메인 공유 가능? (SSO 난이도 결정 — 가능하면 강력 권장)
- **라이브 DB 변경**: 0011 마이그레이션은 비파괴지만 트리거는 학생 활동 경로에 붙으므로 **스테이징 선검증 필수**.
- **points.ts 연동**: 오목 보상을 gongbuin 레벨/뱃지에 합칠지(Phase 1.5) — 기존 포인트 공식 변경 부담 있어 Phase 1은 **토큰·레이팅 분리 운영** 권장.
