import { Pool } from 'pg';
import { importOperatorCatalog } from './catalog';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const count = await importOperatorCatalog(pool, process.argv[2]);
  console.log(`Imported ${count} verified Mainnet base Operators`);
} finally {
  await pool.end();
}
