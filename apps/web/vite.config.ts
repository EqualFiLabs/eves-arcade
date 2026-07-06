import { defineConfig } from 'vite';

// The web app is the ONLY package that imports Phaser. Workspace packages
// @rpr/sim and @rpr/content resolve to TypeScript source; Vite/esbuild compile
// them on the fly, so no build step is required for internal packages.
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
