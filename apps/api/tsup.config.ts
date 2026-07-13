import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/verify/worker-task.ts', 'src/migrate-cli.ts'],
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  noExternal: [/^@rpr\//],
});
