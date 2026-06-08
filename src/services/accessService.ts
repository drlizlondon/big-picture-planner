import { getSupabaseClient } from './supabaseClient';

export type AccessStatus = 'trial' | 'expired' | 'paid' | 'no_access' | 'unauthenticated' | 'loading' | 'unconfigured';

export interface AccessState {
  status: AccessStatus;
  trialEndsAt?: string;
  daysRemaining?: number;
}

const ACCESS_EVENT = 'planner-access-change';

export const emitAccessChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCESS_EVENT));
};

export const subscribeToAccessChanges = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ACCESS_EVENT, callback);
  return () => window.removeEventListener(ACCESS_EVENT, callback);
};

export const getAccessState = async (): Promise<AccessState> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { status: 'unconfigured' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { status: 'unauthenticated' };

  const { data, error } = await supabase.rpc('get_my_access');
  if (error) return { status: 'no_access' };

  return {
    status: data.status as AccessStatus,
    trialEndsAt: data.trial_ends_at,
    daysRemaining: data.days_remaining,
  };
};

export const redeemCode = async (code: string): Promise<{ ok: boolean; error?: string; trialEndsAt?: string }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Not configured' };

  const { data, error } = await supabase.rpc('redeem_access_code', { p_code: code.trim().toUpperCase() });

  if (error) return { ok: false, error: error.message };

  if (data.status === 'ok') {
    emitAccessChange();
    return { ok: true, trialEndsAt: data.trial_ends_at };
  }

  if (data.status === 'already_has_access') {
    emitAccessChange();
    return { ok: true };
  }

  if (data.status === 'invalid') {
    return { ok: false, error: 'That code isn\'t valid. Check you\'ve typed it correctly.' };
  }

  return { ok: false, error: 'Something went wrong. Please try again.' };
};
