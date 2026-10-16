import { serve } from './node-serve';
import { createApp } from './server';
import { loadConfig } from './config';
import { Store, type ArcadeStore } from './store';
import { PostgresStore } from './postgres-store';
import { migrate } from './migrate';
import { PostgresOperatorCatalog } from './operators/catalog';
import { MemorySessionRateLimiter, PostgresSessionRateLimiter } from './rate-limit';
import { WorkerVerificationExecutor } from './verify/executor';

const config = loadConfig();
let store: ArcadeStore;
if (config.databaseUrl) {
  await migrate(config.databaseUrl);
  store = new PostgresStore(config.databaseUrl);
} else {
  store = new Store();
}
const executor = new WorkerVerificationExecutor({
  minThreads: config.workerMinThreads,
  maxThreads: config.workerMaxThreads,
  maxQueue: config.workerMaxQueue,
  timeoutMs: config.verificationTimeoutMs,
});
const rateLimiter = store instanceof PostgresStore
  ? new PostgresSessionRateLimiter(store, config)
  : new MemorySessionRateLimiter(config);
const operators = store instanceof PostgresStore ? new PostgresOperatorCatalog(store.pool) : undefined;
const app = createApp({ config, store, executor, rateLimiter, operators });

serve(app, config.port, { maxBodyBytes: config.maxRequestBodyBytes });
console.log(JSON.stringify({ level: 'info', event: 'api_listening', port: config.port }));

async function shutdown(): Promise<void> {
  await executor.close();
  await store.close?.();
  process.exit(0);
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
