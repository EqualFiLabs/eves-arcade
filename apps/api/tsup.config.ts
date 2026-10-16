import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'verify/worker-task': 'src/verify/worker-task.ts',
    'migrate-cli': 'src/migrate-cli.ts', 'import-operators': 'src/operators/import-cli.ts' },
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  noExternal: [/^@rpr\//],
});
