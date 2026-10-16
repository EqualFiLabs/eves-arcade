CREATE TABLE operator_catalog (
  id integer PRIMARY KEY CHECK (id = 1),
  provenance jsonb NOT NULL,
  content_digest text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operators (
  token_id integer PRIMARY KEY CHECK (token_id BETWEEN 1 AND 5555),
  catalog_id integer NOT NULL DEFAULT 1 REFERENCES operator_catalog(id),
  svg text NOT NULL,
  traits jsonb NOT NULL,
  artwork_hash text NOT NULL CHECK (artwork_hash ~ '^[0-9a-f]{64}$')
);
