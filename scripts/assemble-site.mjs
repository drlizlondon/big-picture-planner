// Assemble the full public site into dist/ for static hosting (Cloudflare Pages).
//
// Layout produced:
//   dist/            -> landing site (index.html, adhd.html, _redirects, ...)
//   dist/planner/    -> the Vite/React app (already built here by `vite build`)
//
// This mirrors what the old GitHub Pages workflow did in its "Assemble site"
// step, but bakes it into `npm run build` so a plain Cloudflare Pages config
// (build: `npm run build`, output dir: `dist`) produces the complete site.

import { cpSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const landing = join(root, 'landing');

if (!existsSync(join(dist, 'planner', 'index.html'))) {
  console.error(
    '[assemble-site] dist/planner/index.html missing — run `vite build` first.'
  );
  process.exit(1);
}

// Clean everything in dist except the freshly built planner app.
for (const entry of readdirSync(dist)) {
  if (entry === 'planner') continue;
  rmSync(join(dist, entry), { recursive: true, force: true });
}

// Copy the landing site to the dist root.
cpSync(landing, dist, { recursive: true });

console.log('[assemble-site] landing -> dist/, app -> dist/planner/  ✓');
