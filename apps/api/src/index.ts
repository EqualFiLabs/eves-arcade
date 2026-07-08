/**
 * API server entry point (Req 9.1). Starts a Node HTTP server serving the Hono
 * app. Run with `pnpm --filter @rpr/api dev`.
 */
import { serve } from './node-serve';
import { createApp } from './server';
import { loadConfig } from './config';
import { Store } from './store';

const config = loadConfig();
const store = new Store();
const app = createApp({ config, store });

const port = config.port;
serve(app, port);

console.log(`@rpr/api listening on http://localhost:${port}`);
