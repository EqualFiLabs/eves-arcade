import type { AnalyticsHook } from './types';

/**
 * V1 analytics implementation (Req: AnalyticsHook). No-op in production; logs
 * to the console in development so events are observable during migration.
 * Replaced by a real sink later without touching the contract.
 */
const isDev = typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

export const consoleAnalytics: AnalyticsHook = {
  track(event, props) {
    if (isDev) console.debug('[analytics]', event, props ?? {});
  },
};
