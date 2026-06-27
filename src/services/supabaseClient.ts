import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { getAuthRedirectTo } from './authRedirect';

// Custom URL scheme registered by the native iOS app (CFBundleURLTypes).
// Supabase redirects OAuth / magic links to <scheme>://auth-callback, which
// nativeAuth.ts intercepts to complete the session inside the app.
export const APP_URL_SCHEME = 'bigpictureplanner';

let client: SupabaseClient | null | undefined;

/**
 * Resolve where Supabase should send the user back after auth. On the web this
 * is the current page (unchanged behaviour). In the bundled native app it is the
 * custom-scheme deep link, because capacitor://localhost is not a valid Google
 * redirect target and the webview never reloads to trigger detectSessionInUrl.
 */
const resolveRedirectTo = (): string =>
  getAuthRedirectTo({
    isNative: Capacitor.isNativePlatform(),
    origin: window.location.origin,
    pathname: window.location.pathname,
    scheme: APP_URL_SCHEME,
  });

/**
 * Start an OAuth sign-in.
 *
 * On the web, supabase-js navigates the current page to the provider — the
 * normal flow. Inside Capacitor that would navigate the *main* WKWebView away
 * from the app (capacitor://localhost), destroying the React app, the Supabase
 * client and the appUrlOpen listener — so when the provider redirects back to
 * bigpictureplanner://auth-callback there is nothing left to complete the
 * session. Instead we keep the app alive in the main webview and open the
 * provider URL in the system browser; nativeAuth.ts closes it and sets the
 * session when the deep link returns.
 */
const startOAuth = async (
  options: Parameters<SupabaseClient['auth']['signInWithOAuth']>[0]['options']
): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const isNative = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { ...options, skipBrowserRedirect: isNative },
  });
  if (error) throw error;

  if (isNative && data?.url) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url });
  }
};

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
  await startOAuth({
    redirectTo: resolveRedirectTo(),
  });
};

/**
 * Re-authenticate with Google requesting the calendar.events scope.
 * Uses prompt:'consent' to ensure Google shows the permission screen even
 * if the user previously signed in without the calendar scope.
 */
export const connectGoogleCalendar = async (): Promise<void> => {
  await startOAuth({
    scopes: 'https://www.googleapis.com/auth/calendar.events',
    redirectTo: resolveRedirectTo(),
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });
};

export const sendMagicLink = async (email: string): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: resolveRedirectTo(),
    },
  });

  if (error) throw error;
};
