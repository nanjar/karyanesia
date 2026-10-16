import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Database } from './database';
import { readConfig } from './config';
async function main() {
  const db = new Database(readConfig());
  try {
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(72619001)');
      await tx.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const folder = resolve(__dirname, '../../../packages/database/migrations');
      for (const name of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
        const sql = await readFile(resolve(folder, name), 'utf8'),
          hash = createHash('sha256').update(sql).digest('hex');
        const { rows } = await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1', [
          name,
        ]);
        if (rows[0]) {
          if (rows[0].checksum !== hash) throw Error(`Migration checksum mismatch: ${name}`);
          continue;
        }
        await tx.query(sql);
        await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, hash]);
        console.log(`Applied ${name}`);
      }
    });
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
