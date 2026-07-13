CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  session_id text PRIMARY KEY,
  ticket jsonb NOT NULL,
  game_id text NOT NULL,
  game_version text NOT NULL,
  verifier_id text NOT NULL,
  verifier_revision integer NOT NULL CHECK (verifier_revision >= 0),
  build_version text NOT NULL,
  expires_at bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('issued', 'verifying', 'accepted', 'rejected', 'expired')),
  lease_token uuid,
  lease_expires_at bigint,
  submission_fingerprint text,
  terminal_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_verifier_idx
  ON tickets (verifier_id, verifier_revision);
CREATE INDEX IF NOT EXISTS tickets_lease_idx
  ON tickets (status, lease_expires_at);

CREATE TABLE IF NOT EXISTS verification_results (
  session_id text PRIMARY KEY REFERENCES tickets(session_id),
  submission_fingerprint text NOT NULL,
  player_handle text NOT NULL,
  claim jsonb NOT NULL,
  canonical_result jsonb,
  trace bytea NOT NULL,
  trace_encoding_version integer NOT NULL,
  trace_hash text NOT NULL,
  verified boolean NOT NULL,
  review_flag boolean NOT NULL,
  rejection_code text,
  rejection_reason text,
  submitted_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_results_review_idx
  ON verification_results (review_flag, verified, submitted_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_values (
  category_id text NOT NULL,
  session_id text NOT NULL REFERENCES verification_results(session_id),
  value double precision NOT NULL,
  submitted_at bigint NOT NULL,
  PRIMARY KEY (category_id, session_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_values_desc_idx
  ON leaderboard_values (category_id, value DESC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS leaderboard_values_asc_idx
  ON leaderboard_values (category_id, value ASC, submitted_at ASC);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  client_key text NOT NULL,
  window_start bigint NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (client_key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_windows_cleanup_idx
  ON rate_limit_windows (window_start);
