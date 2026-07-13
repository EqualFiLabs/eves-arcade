import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// The web app is the ONLY package that imports Phaser. Workspace packages
// @rpr/sim and @rpr/content resolve to TypeScript source; Vite/esbuild compile
// them on the fly, so no build step is required for internal packages.

// Best-effort git SHA for build versioning (Req 8.6). Falls back to 'dev' when
// git is unavailable (e.g. archived export).
function gitSha(): string {
  if (process.env.BUILD_VERSION) {
    return process.env.BUILD_VERSION;
  }

  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(gitSha()),
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
