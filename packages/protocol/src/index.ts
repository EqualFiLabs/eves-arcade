/**
 * @rpr/protocol — shared wire-protocol types and trace encoding.
 *
 * Pure TypeScript: no Phaser, no DOM, no Node-specific APIs. Consumed by both
 * the web client (`apps/web`) and the API server (`apps/api`).
 *
 * Public surface:
 * - Types: `SessionTicket`, `GameResult`, `ScoreSubmission`, `LeaderboardCategory`
 * - API responses: `SessionResponse`, `SubmissionResponse`, `LeaderboardResponse`, etc.
 * - Trace: `TRACE_ENCODING_VERSION`, `unpackTrace`, `DecodedTrace`
 */

export * from './types';
export * from './trace';
