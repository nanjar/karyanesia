import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { CONFIG, Config } from './config';
export interface Executor {
  query<T extends QueryResultRow = any>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
@Injectable()
export class Database implements Executor, OnModuleDestroy {
  readonly pool: Pool;
  constructor(@Inject(CONFIG) cfg: Config) {
    this.pool = new Pool({ connectionString: cfg.DATABASE_URL, max: 10 });
  }
  query<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
    return this.pool.query<T>(sql, params);
  }
  async transaction<T>(fn: (db: Executor) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
