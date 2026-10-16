import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresStore } from '../../apps/api/src/postgres-store';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { migrate } from '../../apps/api/src/migrate';
import { importOperatorCatalog, PostgresOperatorCatalog } from '../../apps/api/src/operators/catalog';
import { readOperatorSeed } from '../../apps/api/src/operator-seed';
import { createApp } from '../../apps/api/src/server';
import { loadConfig } from '../../apps/api/src/config';
import { Store } from '../../apps/api/src/store';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const makePool = () => new PostgresStore(databaseUrl!, 2).pool;
let pool: ReturnType<typeof makePool>;
let catalog: PostgresOperatorCatalog;

suite('PostgreSQL Operator catalog and HTTP routes', () => {
  beforeAll(async () => {
    await migrate(databaseUrl!);
    pool = makePool();
    catalog = new PostgresOperatorCatalog(pool);
    await pool.query('TRUNCATE operators,operator_catalog');
  });
  afterAll(async () => { await pool?.end(); });

  it('imports every SVG exactly, repeats safely, and survives a new connection', async () => {
    expect(await catalog.ready()).toBe(false);
    expect(await importOperatorCatalog(pool)).toBe(5555);
    expect(await importOperatorCatalog(pool)).toBe(5555);
    const original = await readOperatorSeed();
    const rows = await pool.query('SELECT * FROM operators ORDER BY token_id');
    expect(rows.rows).toHaveLength(5555);
    rows.rows.forEach((row, i) => {
      expect(row).toMatchObject({ token_id: original.operators[i]!.tokenId, svg: original.operators[i]!.svg,
        traits: original.operators[i]!.traits, artwork_hash: original.operators[i]!.artworkHash });
    });
    const other = makePool();
    try { expect(await new PostgresOperatorCatalog(other).get(5555)).toEqual(original.operators[5554]); }
    finally { await other.end(); }
  });

  it('rejects incomplete input before storage and rolls back a mid-import SQL failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'operator-invalid-'));
    try {
      const file = join(directory, 'broken.json.gz');
      await writeFile(file, gzipSync(JSON.stringify({ operators: [] })));
      await expect(importOperatorCatalog(pool, file)).rejects.toThrow();
      expect(await catalog.ready()).toBe(true);
    } finally { await rm(directory, { recursive: true }); }

    await pool.query("UPDATE operators SET svg='before-import' WHERE token_id=1");
    await pool.query(`CREATE FUNCTION reject_operator_import() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.token_id >= 3000 THEN RAISE EXCEPTION 'import failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER fail_operator_import BEFORE INSERT OR UPDATE ON operators
      FOR EACH ROW EXECUTE FUNCTION reject_operator_import()`);
    try {
      await expect(importOperatorCatalog(pool)).rejects.toThrow('import failure');
      expect((await catalog.get(1))!.svg).toBe('before-import');
      expect(await catalog.ready()).toBe(true);
    } finally {
      await pool.query('DROP TRIGGER fail_operator_import ON operators');
      await pool.query('DROP FUNCTION reject_operator_import()');
      await importOperatorCatalog(pool);
    }
  });

  it('serves metadata, random selection, byte-exact SVG, caching and invalid IDs', async () => {
    const app = createApp({ config: loadConfig({ NODE_ENV: 'test', BUILD_VERSION: 'test' }), store: new Store(), operators: catalog });
    const response = await app.request('/operators/42');
    expect(response.status).toBe(200);
    const appearance = await response.json();
    expect(appearance).toMatchObject({ tokenId: 42, name: 'Operator #42', traits: { Shell: 'Round Shell' } });
    const imagePath = appearance.imageUrl.replace('/api', '');
    const image = await app.request(imagePath);
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(image.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(await image.text()).toBe((await catalog.get(42))!.svg);
    expect((await app.request(imagePath, { headers: { 'If-None-Match': image.headers.get('ETag')! } })).status).toBe(304);
    expect((await app.request('/operators/42/image.svg?v=stale')).status).toBe(404);
    for (const id of ['0', '5556', '1.5', '-1', '01', '1e2', 'NaN']) {
      expect((await app.request(`/operators/${id}`)).status).toBe(400);
    }
    const random = await (await app.request('/operators/random?exclude=42')).json();
    expect(random.tokenId).not.toBe(42);
    expect(await catalog.get(random.tokenId)).not.toBeNull();
    expect((await app.request('/operators/random?exclude=bad')).status).toBe(400);
  });

  it('fails closed for an incomplete catalog and database outages', async () => {
    const config = loadConfig({ NODE_ENV: 'test', BUILD_VERSION: 'test' });
    await pool.query('DELETE FROM operators WHERE token_id=42');
    try {
      const app = createApp({ config, store: new Store(), operators: catalog });
      expect((await app.request('/operators/42')).status).toBe(503);
    } finally { await importOperatorCatalog(pool); }
    const closed = makePool();
    await closed.end();
    const app = createApp({ config, store: new Store(), operators: new PostgresOperatorCatalog(closed) });
    expect((await app.request('/operators/42')).status).toBe(503);
    expect((await createApp({ config, store: new Store() }).request('/operators/42')).status).toBe(503);
    // Narrow repository-contract negative: a complete catalog reports a missing row.
    const missing = createApp({ config, store: new Store(), operators: {
      ready: async () => true, get: async () => null, random: async () => null,
    } });
    expect((await missing.request('/operators/42')).status).toBe(404);
  });
});
