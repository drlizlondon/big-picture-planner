import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { getSupabaseClient } from './supabaseClient';
import { isAuthCallbackUrl, parseTokensFromUrl, getAuthCodeFromUrl } from './authRedirect';

// Inside the bundled native app the webview never navigates to the auth redirect
// URL — instead iOS hands the custom-scheme deep link to the app. We catch that
// here and complete the Supabase session manually, because detectSessionInUrl
// (which the web flow relies on) never fires in this context.
//
// This is a no-op on the web, so importing/calling it there is safe.

const SYNC_EVENT = 'planner-sync-change';

// Redact tokens/codes so we can log the auth round-trip without leaking secrets.
const redactUrl = (url: string): string =>
  url
    .replace(/(access_token|refresh_token|code|id_token)=[^&#]+/gi, '$1=<redacted>')
    .replace(/#.*$/, (m) => (m.length > 1 ? '#<redacted-fragment>' : m));

/**
 * Register the deep-link listener once at startup. No-op on the web.
 */
export const initNativeAuth = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  void App.addListener('appUrlOpen', async ({ url }) => {
    console.log('[nativeAuth] appUrlOpen', redactUrl(url));

    if (!isAuthCallbackUrl(url)) {
      console.log('[nativeAuth] not an auth callback, ignoring');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[nativeAuth] Supabase not configured; cannot complete sign-in');
      return;
    }

    try {
      // Implicit flow (Supabase default): tokens arrive in the URL hash fragment.
      const tokens = parseTokensFromUrl(url);
      if (tokens) {
        const { error } = await supabase.auth.setSession(tokens);
        if (error) throw error;
        console.log('[nativeAuth] setSession (implicit) succeeded');
      } else {
        // PKCE flow fallback: an auth code in the query string.
        const code = getAuthCodeFromUrl(url);
        if (!code) {
          console.warn('[nativeAuth] callback had neither tokens nor a code', redactUrl(url));
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        console.log('[nativeAuth] exchangeCodeForSession (pkce) succeeded');
      }

      // OAuth opened the provider in the system browser; close it now that we're
      // back in the app with a session. (Harmless no-op for the magic-link flow.)
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.close();
      } catch {
        // Browser may not be open (magic-link path) — ignore.
      }

      // Nudge the sync layer (and any open SyncStatusPanel) to refresh.
      window.dispatchEvent(new Event(SYNC_EVENT));
    } catch (error) {
      // Log the message only — never the tokens.
      const message = error instanceof Error ? error.message : String(error);
      console.error('[nativeAuth] failed to complete session:', message);
    }
  });
};
