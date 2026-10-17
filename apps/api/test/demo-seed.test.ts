import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app';
import { Database } from '../src/database';
import { CONFIG } from '../src/config';
import { setup } from '../src/setup';
import { demoOptions, seedDemo } from '../src/demo-seed';
import { otpAt } from '../src/crypto';

test('demo flag is strict, defaults off and rejects production or missing password', async () => {
  assert.deepEqual(demoOptions({}), { enabled: false });
  assert.deepEqual(demoOptions({ DEMO: 'false', NODE_ENV: 'production' }), { enabled: false });
  for (const env of [
    { DEMO: '1' },
    { DEMO: 'true', NODE_ENV: 'production' },
    { DEMO: 'true', NODE_ENV: 'development' },
  ])
    assert.throws(() => demoOptions(env));
  let touched = false;
  assert.deepEqual(
    await seedDemo(
      {
        transaction: async () => {
          touched = true;
          throw Error();
        },
      },
      { MFA_ENCRYPTION_KEY: '' },
      { DEMO: 'false' },
    ),
    { status: 'disabled' },
  );
  assert.equal(touched, false);
});

test('demo seed is atomic, isolated, repeatable and usable through real login/learning/SOP APIs', async () => {
  const schema = 'demo_test_' + randomUUID().replaceAll('-', '');
  let engine: PGlite | undefined, pool: Pool | undefined;
  if (process.env.TEST_DATABASE_URL) {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 3,
    });
  } else engine = new PGlite();
  const db: any = {
    query: (s: string, p?: any[]) => (pool ? pool.query(s, p) : engine!.query(s, p)),
    transaction: async (fn: any) => {
      if (engine) return engine.transaction(fn);
      const c = await pool!.connect();
      try {
        await c.query('BEGIN');
        const result = await fn(c);
        await c.query('COMMIT');
        return result;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
  let app: any;
  const cfg = {
    DATABASE_URL: '',
    MFA_ENCRYPTION_KEY: 'a'.repeat(64),
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:3000',
    PORT: 4000,
    TRUST_PROXY_HOPS: 0,
    CLAMAV_PORT: 3310,
  };
  const env = {
    DEMO: 'true',
    NODE_ENV: 'development',
    DEMO_PASSWORD: 'test-only-demo-password-2026',
  };
  try {
    const dir = resolve(__dirname, '../../../packages/database/migrations');
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
      const sql = await readFile(resolve(dir, name), 'utf8');
      if (engine) await engine.exec(sql);
      else await db.query(sql);
    }
    const collision = randomUUID();
    await db.query(
      "INSERT INTO tenants(id,code,name) VALUES($1,'karyanesia-demo','Existing real tenant')",
      [collision],
    );
    await assert.rejects(seedDemo(db, cfg, env), /Reserved demo tenant/);
    assert.equal(
      (await db.query('SELECT name FROM tenants WHERE id=$1', [collision])).rows[0].name,
      'Existing real tenant',
    );
    await db.query('DELETE FROM tenants WHERE id=$1', [collision]);
    await assert.rejects(seedDemo(db, { MFA_ENCRYPTION_KEY: 'invalid' }, env));
    assert.equal(Number((await db.query('SELECT count(*) n FROM tenants')).rows[0].n), 0);
    await db.query("INSERT INTO tenants(id,code,name) VALUES($1,'unrelated','Untouched tenant')", [
      randomUUID(),
    ]);
    const first = await seedDemo(db, cfg, env);
    assert.equal(first.status, 'created');
    assert.equal(first.access.accounts.length, 7);
    assert.equal(first.access.accounts.filter((a) => a.mfa_enrollment_uri).length, 2);
    const counts = async () =>
      (
        await db.query(
          `SELECT (SELECT count(*) FROM tenants) tenants,(SELECT count(*) FROM memberships) members,(SELECT count(*) FROM onboarding_assignments) assignments,(SELECT count(*) FROM sop_instances) instances,(SELECT count(*) FROM audit_events) audits`,
        )
      ).rows[0];
    const before = await counts();
    assert.equal(Number(before.tenants), 2);
    assert.equal(Number(before.members), 7);
    assert.equal(Number(before.assignments), 2);
    assert.equal(Number(before.instances), 2);
    const again = await seedDemo(db, cfg, env);
    assert.equal(again.status, 'existing');
    assert.deepEqual(again.access, {
      ...first.access,
      accounts: [...first.access.accounts].sort((a, b) =>
        a.employee_number.localeCompare(b.employee_number),
      ),
    });
    assert.deepEqual(await counts(), before);
    await assert.rejects(
      seedDemo(db, cfg, { ...env, DEMO_PASSWORD: 'different-password-2026' }),
      /no passwords were reset/,
    );
    await seedDemo(db, cfg, { DEMO: 'false' });
    assert.deepEqual(await counts(), before);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Database)
      .useValue(db)
      .overrideProvider(CONFIG)
      .useValue(cfg)
      .compile();
    app = mod.createNestApplication({ bodyParser: false });
    setup(app, false);
    await app.init();
    const login = async (employee: string, otp?: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', cfg.WEB_ORIGIN)
        .send({
          company_code: 'karyanesia-demo',
          employee_number: employee,
          password: env.DEMO_PASSWORD,
          ...(otp ? { otp } : {}),
        });
    const owner = first.access.accounts.find((a) => a.role === 'OWNER')!;
    await login(owner.employee_number).then((r) => assert.equal(r.status, 401));
    const secret = new URL(owner.mfa_enrollment_uri!).searchParams.get('secret')!;
    await login(owner.employee_number, otpAt(secret, Math.floor(Date.now() / 30000))).then((r) =>
      assert.equal(r.status, 200),
    );
    const logged = await login('DEMO-STAFF-01');
    assert.equal(logged.status, 200);
    const cookie = logged.headers['set-cookie'][0].split(';')[0];
    const modules = await request(app.getHttpServer())
      .get('/api/v1/learning')
      .set('Cookie', cookie);
    assert.equal(modules.status, 200);
    assert.equal(modules.body.items.length, 1);
    const detail = await request(app.getHttpServer())
      .get('/api/v1/learning/' + modules.body.items[0].id)
      .set('Cookie', cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.content.questions[0].correct, undefined);
    const instance = (
      await db.query(
        "SELECT i.id FROM sop_instances i JOIN memberships m ON m.id=i.assignee_id WHERE m.employee_number='DEMO-STAFF-01'",
      )
    ).rows[0];
    const tasks = await request(app.getHttpServer())
      .get('/api/v1/sop-instances/' + instance.id)
      .set('Cookie', cookie);
    assert.equal(tasks.status, 200);
    const other = (
      await db.query(
        "SELECT i.id FROM sop_instances i JOIN memberships m ON m.id=i.assignee_id WHERE m.employee_number='DEMO-STAFF-02'",
      )
    ).rows[0];
    await request(app.getHttpServer())
      .get('/api/v1/sop-instances/' + other.id)
      .set('Cookie', cookie)
      .expect(404);
  } finally {
    if (app) await app.close();
    if (pool) {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
    if (engine) await engine.close();
  }
});
