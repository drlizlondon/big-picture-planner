import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/planner/',
  // The Vite app is served under /planner/. Build it into dist/planner so the
  // assemble step (scripts/assemble-site.mjs) can place the landing site at the
  // dist root, producing the full public site under a single output dir (dist).
  build: {
    outDir: 'dist/planner',
    emptyOutDir: true,
  },
  plugins: [react()],
})
