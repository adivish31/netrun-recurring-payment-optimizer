import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { poolConfig, maskUrl } from './connection';

dotenv.config();

/**
 * tsc does not copy .sql files into dist/, so look next to this file first
 * (ts-node) and fall back to the source tree (node dist/src/db/migrate.js).
 */
function resolveSqlPath(): string {
  const candidates = [
    path.join(__dirname, 'migrations', '001_init.sql'),
    path.join(process.cwd(), 'src', 'db', 'migrations', '001_init.sql'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Migration SQL file not found. Looked in:\n  ${candidates.join('\n  ')}`);
  return found;
}

export async function runMigration() {
  const config = poolConfig();
  console.log(`Running database migration against: ${maskUrl(config.connectionString!)}`);

  const pool = new Pool(config);
  try {
    const client = await pool.connect();
    try {
      // 001_init.sql uses plain CREATE TABLE, so re-running it on every deploy
      // would fail. Skip when the schema is already there.
      const { rows } = await client.query(`SELECT to_regclass('public.mandates') AS t`);
      if (rows[0]?.t) {
        console.log('Schema already present (mandates exists). Nothing to do.');
        return;
      }

      console.log('Executing 001_init.sql...');
      await client.query(fs.readFileSync(resolveSqlPath(), 'utf8'));
      console.log('✅ Migration completed successfully!');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration();
}
