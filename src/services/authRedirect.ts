// Pure helper for choosing the OAuth / magic-link redirect target.
//
// On the web the redirect stays exactly as it was before (origin + pathname), so
// the existing Cloudflare/Pages auth flow is unchanged. Inside a bundled Capacitor
// app, `window.location.origin` is `capacitor://localhost`, which Google will not
// accept and which the webview never reloads on, so we instead redirect to a
// custom-scheme deep link that @capacitor/app intercepts (see nativeAuth.ts).
//
// Kept dependency-free and pure so it can be unit-tested under `node --test`.

export const AUTH_CALLBACK_PATH = 'auth-callback';

export interface AuthRedirectInput {
  isNative: boolean;
  origin: string;
  pathname: string;
  scheme: string;
}

export const getAuthRedirectTo = ({ isNative, origin, pathname, scheme }: AuthRedirectInput): string => {
  if (isNative) {
    return `${scheme}://${AUTH_CALLBACK_PATH}`;
  }
  return `${origin}${pathname}`;
};

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Pull implicit-flow tokens out of a deep-link URL. Supabase appends them as a
 * hash fragment (#access_token=...&refresh_token=...) to the redirect target.
 * Pure (no Capacitor) so the native deep-link path is unit-testable.
 */
export const parseTokensFromUrl = (url: string): SessionTokens | null => {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
};

export const isAuthCallbackUrl = (url: string): boolean => url.includes(AUTH_CALLBACK_PATH);

/**
 * Extract a PKCE auth code (?code=...) from a deep-link URL, if present.
 * Returns null for the implicit flow (which uses a hash fragment instead).
 */
export const getAuthCodeFromUrl = (url: string): string | null => {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return null;
  // Strip any hash before parsing the query string.
  const query = url.slice(queryIndex + 1).split('#')[0];
  return new URLSearchParams(query).get('code');
};
