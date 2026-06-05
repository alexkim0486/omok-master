"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAccount, OmokAccount } from "@/lib/omok/account";

export interface UseAccount {
  account: OmokAccount | null;
  loading: boolean;
  /** True when Supabase is configured but no user is logged in. */
  isGuest: boolean;
  /** True when Supabase env is absent (pure offline play). */
  noSupabase: boolean;
  refresh: () => Promise<void>;
}

export function useAccount(): UseAccount {
  const [account, setAccount] = useState<OmokAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [noSupabase, setNoSupabase] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNoSupabase(true);
      setAccount(null);
      setLoading(false);
      return;
    }
    try {
      setAccount(await fetchAccount(supabase));
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refresh();
    const supabase = getSupabaseBrowserClient();
    const sub = supabase?.auth.onAuthStateChange(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [refresh]);

  return { account, loading, isGuest: !noSupabase && !account, noSupabase, refresh };
}
