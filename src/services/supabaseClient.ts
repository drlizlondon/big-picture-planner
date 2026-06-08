import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

const getSupabaseEnv = (): { url?: string; anonKey?: string } => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return {
    url: env?.VITE_SUPABASE_URL,
    anonKey: env?.VITE_SUPABASE_ANON_KEY,
  };
};

export const getSupabaseClient = (): SupabaseClient | null => {
  if (client !== undefined) return client;

  const { url, anonKey } = getSupabaseEnv();

  client = url && anonKey
    ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    : null;

  return client;
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
};

export const signInWithGoogle = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) throw error;
};

export const sendMagicLink = async (email: string): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) throw error;
};
