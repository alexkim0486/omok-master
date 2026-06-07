"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for the omok app. Points at the SAME project as
 * gongbuin, so a student logged into gongbuin is the same user here.
 *
 * Mirrors gongbuin's pattern: returns null (guest mode) when env is missing so
 * the app never crashes — callers must guard with `if (!supabase) ...`.
 *
 * SSO: when NEXT_PUBLIC_COOKIE_DOMAIN is set (e.g. ".gongbuin.kr"), the auth
 * cookie is shared across subdomains, so login on gongbuin carries over with no
 * re-login. Leave it unset for local development.
 */
let _client: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon || !/^https?:\/\//i.test(url)) {
    _client = null;
    return null;
  }

  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();

  try {
    _client = createBrowserClient(
      url,
      anon,
      cookieDomain ? { cookieOptions: { domain: cookieDomain } } : undefined,
    );
  } catch {
    _client = null;
  }
  return _client;
}

/**
 * 공부인 '통합앱' 홈/로그인 URL.
 * 예전 env(NEXT_PUBLIC_GONGBUIN_URL)가 구버전 수능 모의고사를 가리켜 홈 버튼이
 * 잘못 연결되던 문제로, 통합앱 도메인을 코드에 고정한다. (2호점 등 다른 도메인이
 * 필요하면 이 값만 바꾸면 됨)
 */
export function gongbuinUrl(): string {
  return "https://gongbuin.co.kr";
}
