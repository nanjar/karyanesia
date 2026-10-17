import { Pool } from 'pg';
async function main() {
  if (process.argv[2] === 'api') {
    const response = await fetch('http://127.0.0.1:4000/api/v1/health', {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok || ((await response.json()) as { status: string }).status !== 'ok')
      throw Error();
  } else if (process.argv[2] === 'worker') {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      max: 1,
      query_timeout: 3000,
    });
    try {
      const result = await pool.query(
        "SELECT 1 FROM worker_heartbeats WHERE name='operations' AND last_success_at>now()-interval '3 minutes'",
      );
      if (!result.rows.length) throw Error();
    } finally {
      await pool.end();
    }
  } else throw Error();
}
main().catch(() => {
  process.exitCode = 1;
});
