import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the planner as a native iOS app with FULLY BUNDLED web assets
// (no `server.url`), which is what makes real offline use possible: the app shell
// ships inside the binary and boots with no network.
//
// `webDir` points at `dist-capacitor/`, produced by `npm run build:capacitor`
// (Vite built with a relative base so assets resolve from capacitor://localhost/).
// The Cloudflare/Pages build (`npm run build` -> dist/planner) is a separate target
// and is intentionally untouched.
const config: CapacitorConfig = {
  appId: 'app.bigpictureplanner',
  appName: 'Big Picture Planner',
  webDir: 'dist-capacitor',
  ios: {
    // Use the standard WKWebView host. Custom-scheme auth deep links
    // (bigpictureplanner://auth-callback) are handled in src/services/nativeAuth.ts.
    scheme: 'App',
  },
};

export default config;
