/**
 * Supabase Auth session state for the beheer UI (WP-A4).
 */

import { useEffect, useState } from 'react';
import { supabaseAuth } from '../lib/supabase-client';

export interface AdminSessionState {
  loading: boolean;
  email: string | null;
}

export function useAdminSession(): AdminSessionState {
  const [state, setState] = useState<AdminSessionState>({
    loading: Boolean(supabaseAuth),
    email: null,
  });

  useEffect(() => {
    if (!supabaseAuth) return;

    supabaseAuth.auth.getSession().then(({ data }) => {
      setState({ loading: false, email: data.session?.user?.email ?? null });
    });

    const { data: listener } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, email: session?.user?.email ?? null });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return state;
}
