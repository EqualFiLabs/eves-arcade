import type { Pool } from 'pg';
import type { OperatorTraits } from '@rpr/protocol';
import { OPERATOR_DIGEST, OPERATOR_SUPPLY, readOperatorSeed, type OperatorRecord } from '../operator-seed';

export interface OperatorCatalog {
  ready(): Promise<boolean>;
  get(tokenId: number): Promise<OperatorRecord | null>;
  random(exclude?: number): Promise<OperatorRecord | null>;
}

export class PostgresOperatorCatalog implements OperatorCatalog {
  constructor(private readonly pool: Pool) {}

  async ready(): Promise<boolean> {
    const result = await this.pool.query<{ ready: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM operator_catalog WHERE id=1 AND content_digest=$1)
        AND (SELECT count(*) FROM operators)=$2 AS ready`, [OPERATOR_DIGEST, OPERATOR_SUPPLY]);
    return result.rows[0]?.ready === true;
  }

  async get(tokenId: number): Promise<OperatorRecord | null> {
    const result = await this.pool.query<Row>('SELECT * FROM operators WHERE token_id=$1', [tokenId]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async random(exclude?: number): Promise<OperatorRecord | null> {
    const result = await this.pool.query<Row>(
      'SELECT * FROM operators WHERE ($1::integer IS NULL OR token_id <> $1) ORDER BY random() LIMIT 1',
      [exclude ?? null],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
}

/** Offline and atomic. Validation completes before obtaining a database connection. */
export async function importOperatorCatalog(pool: Pool, path?: string | URL): Promise<number> {
  const seed = await readOperatorSeed(path);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(746707002)');
    await client.query(`INSERT INTO operator_catalog(id,provenance,content_digest) VALUES (1,$1,$2)
      ON CONFLICT(id) DO UPDATE SET provenance=EXCLUDED.provenance,content_digest=EXCLUDED.content_digest`,
    [seed.provenance, seed.contentDigest]);
    // Batch insertion avoids 5,555 round trips; the transaction also repairs a partial catalog.
    for (let offset = 0; offset < seed.operators.length; offset += 250) {
      const batch = seed.operators.slice(offset, offset + 250);
      await client.query(`INSERT INTO operators(token_id,svg,traits,artwork_hash)
        SELECT token_id,svg,traits,artwork_hash FROM jsonb_to_recordset($1::jsonb)
          AS rows(token_id integer,svg text,traits jsonb,artwork_hash text)
        ON CONFLICT(token_id) DO UPDATE SET svg=EXCLUDED.svg,traits=EXCLUDED.traits,artwork_hash=EXCLUDED.artwork_hash`,
      [JSON.stringify(batch.map((row) => ({ token_id: row.tokenId, svg: row.svg, traits: row.traits, artwork_hash: row.artworkHash })))]);
    }
    await client.query('COMMIT');
    return seed.operators.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface Row { token_id: number; svg: string; traits: OperatorTraits; artwork_hash: string }
function fromRow(row: Row): OperatorRecord {
  return { tokenId: row.token_id, svg: row.svg, traits: row.traits, artworkHash: row.artwork_hash };
}
