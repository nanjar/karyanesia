import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app';
import { Database } from '../src/database';
import { CONFIG } from '../src/config';
import {
  digest,
  encryptSecret,
  hashPassword,
  newMfaSecret,
  otpAt,
  token,
  verifyOtp,
} from '../src/crypto';
import { setup } from '../src/setup';
const origin = 'http://localhost:3000',
  key = 'a'.repeat(64),
  password = 'a-unique-test-password-123';
let app: INestApplication, db: any, engine: PGlite | undefined, pool: Pool | undefined;
const tenants = [randomUUID(), randomUUID()],
  branches = [randomUUID(), randomUUID()],
  jobs = [randomUUID(), randomUUID()],
  members = [randomUUID(), randomUUID()];
const secrets = [newMfaSecret(), newMfaSecret()];
let cookies: string[] = [],
  staffId = '',
  activation = '',
  staffCookie = '',
  supervisorCookie = '';
const cookie = (r: any) => r.headers['set-cookie'][0].split(';')[0];
const post = (path: string, c?: string) => {
  let q = request(app.getHttpServer())
    .post('/api/v1/' + path)
    .set('Origin', origin);
  if (c) q = q.set('Cookie', c);
  return q;
};
const get = (path: string, c: string) =>
  request(app.getHttpServer())
    .get('/api/v1/' + path)
    .set('Cookie', c);
before(async () => {
  if (process.env.TEST_DATABASE_URL) {
    const schema = 'test_' + randomUUID().replaceAll('-', '');
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`SET search_path TO ${schema}`);
    db = {
      query: (s: string, p?: any[]) => pool!.query(s, p),
      transaction: async (fn: any) => {
        const c = await pool!.connect();
        try {
          await c.query('BEGIN');
          const v = await fn(c);
          await c.query('COMMIT');
          return v;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
      cleanup: async () => {
        await pool!.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool!.end();
      },
    };
  } else {
    engine = new PGlite();
    db = {
      query: (s: string, p?: any[]) => engine!.query(s, p),
      transaction: (fn: any) => engine!.transaction(fn),
      cleanup: () => engine!.close(),
    };
  }
  const sql = await readFile(
    resolve(__dirname, '../../../packages/database/migrations/001_foundation.sql'),
    'utf8',
  );
  if (engine) await engine.exec(sql);
  else await db.query(sql);
  const hash = await hashPassword(password);
  for (let i = 0; i < 2; i++) {
    const uid = randomUUID();
    await db.query('INSERT INTO tenants(id,code,name) VALUES($1,$2,$3)', [
      tenants[i],
      'company-' + i,
      'Perusahaan ' + i,
    ]);
    await db.query('INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,$3,$4,$5)', [
      branches[i],
      tenants[i],
      'BR1',
      'Cabang ' + i,
      'Asia/Jakarta',
    ]);
    await db.query('INSERT INTO jobs(id,tenant_id,code,name) VALUES($1,$2,$3,$4)', [
      jobs[i],
      tenants[i],
      'CASHIER',
      'Kasir',
    ]);
    await db.query('INSERT INTO users(id,full_name,password_hash,mfa_secret) VALUES($1,$2,$3,$4)', [
      uid,
      'Admin ' + i,
      hash,
      encryptSecret(secrets[i], key),
    ]);
    await db.query(
      "INSERT INTO memberships(id,tenant_id,user_id,employee_number,role) VALUES($1,$2,$3,'ADMIN','OWNER')",
      [members[i], tenants[i], uid],
    );
  }
  const m = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue({
      DATABASE_URL: 'unused',
      WEB_ORIGIN: origin,
      MFA_ENCRYPTION_KEY: key,
      NODE_ENV: 'test',
      PORT: 4000,
    })
    .overrideProvider(Database)
    .useValue(db)
    .compile();
  app = m.createNestApplication({ logger: false });
  setup(app, false);
  await app.init();
});
after(async () => {
  await app?.close();
  await db?.cleanup();
});
test('TOTP follows RFC 6238 test vector and rejects replay', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(otpAt(secret, 1), '287082');
  assert.equal(verifyOtp(secret, '287082', null, 59000), 1);
  assert.equal(verifyOtp(secret, '287082', 1, 59000), null);
});
test('admin requires MFA, opaque cookie is HttpOnly, OTP cannot replay', async () => {
  await post('auth/login')
    .send({ company_code: 'company-0', employee_number: 'ADMIN', password })
    .expect(401);
  for (let i = 0; i < 2; i++) {
    const otp = otpAt(secrets[i], Math.floor(Date.now() / 30000));
    const r = await post('auth/login')
      .send({ company_code: 'company-' + i, employee_number: 'ADMIN', password, otp })
      .expect(200);
    cookies[i] = cookie(r);
    assert.match(r.headers['set-cookie'][0], /HttpOnly/);
    assert.match(r.headers['set-cookie'][0], /SameSite=Strict/);
    await post('auth/login')
      .send({ company_code: 'company-' + i, employee_number: 'ADMIN', password, otp })
      .expect(401);
  }
});
test('unauthenticated and forged-cookie access rejected', async () => {
  await request(app.getHttpServer()).get('/api/v1/memberships').expect(401);
  await get('memberships', 'karyanesia_session=' + token()).expect(401);
});
test('unsafe writes reject missing and foreign origins', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/jobs')
    .set('Cookie', cookies[0])
    .send({ code: 'X', name: 'X' })
    .expect(403);
  await post('jobs', cookies[0])
    .set('Origin', 'https://evil.example')
    .send({ code: 'X', name: 'X' })
    .expect(403);
});
test('admin reads only their tenant and creates organization with audit', async () => {
  const b = await get('branches', cookies[0]).expect(200);
  assert.deepEqual(
    b.body.map((r: any) => r.id),
    [branches[0]],
  );
  const j = await post('jobs', cookies[0]).send({ code: 'LEAD', name: 'Kepala shift' }).expect(201);
  assert.equal(j.body.name, 'Kepala shift');
  const b2 = await post('branches', cookies[0])
    .send({ code: 'BR2', name: 'Cabang kedua', timezone: 'Asia/Makassar' })
    .expect(201);
  assert.ok(b2.body.id);
  const a = await get('audit-events', cookies[0]).expect(200);
  assert.ok(a.body.some((v: any) => v.action === 'job.create'));
});
test('cross-tenant references fail and roll back orphan user creation', async () => {
  const before = await db.query('SELECT count(*)::int n FROM users');
  await post('memberships', cookies[0])
    .send({ employee_number: 'BAD', full_name: 'Invalid', branch_id: branches[1], job_id: jobs[0] })
    .expect(422);
  const after = await db.query('SELECT count(*)::int n FROM users');
  assert.equal(before.rows[0].n, after.rows[0].n);
});
test('strict validation rejects role escalation and caller tenant payload', async () => {
  const data = {
    employee_number: 'BAD',
    full_name: 'Invalid',
    branch_id: branches[0],
    job_id: jobs[0],
  };
  await post('memberships', cookies[0])
    .send({ ...data, role: 'ADMIN' })
    .expect(422);
  await post('memberships', cookies[0])
    .send({ ...data, tenant_id: tenants[1] })
    .expect(422);
  const r = await post('branches', cookies[0])
    .send({ code: 'BR3', name: 'Cabang', timezone: 'UTC' })
    .expect(422);
  assert.ok(r.body.correlation_id);
  assert.ok(r.body.field_errors.length);
});
test('staff activation is single-use, token stored hashed, duplicate staff rejected', async () => {
  const data = {
    employee_number: 'S001',
    full_name: 'Staf baru',
    branch_id: branches[0],
    job_id: jobs[0],
  };
  const r = await post('memberships', cookies[0]).send(data).expect(201);
  staffId = r.body.id;
  activation = r.body.activation_token;
  const stored = await db.query('SELECT token_hash FROM activation_tokens WHERE membership_id=$1', [
    staffId,
  ]);
  assert.equal(stored.rows[0].token_hash, digest(activation));
  await post('memberships', cookies[0]).send(data).expect(422);
  await db.query(
    "UPDATE activation_tokens SET expires_at=now()-interval '1 minute' WHERE membership_id=$1",
    [staffId],
  );
  await post('auth/activate').send({ token: activation, password }).expect(401);
  await post('memberships/' + staffId + '/activation-token', cookies[1]).expect(404);
  const fresh = await post('memberships/' + staffId + '/activation-token', cookies[0]).expect(201);
  await post('auth/activate').send({ token: activation, password }).expect(401);
  activation = fresh.body.activation_token;
  await post('auth/activate').send({ token: activation, password }).expect(200);
  await post('auth/activate').send({ token: activation, password }).expect(401);
  const login = await post('auth/login')
    .send({ company_code: 'company-0', employee_number: 'S001', password })
    .expect(200);
  staffCookie = cookie(login);
});
test('staff sees only self and cannot administer or read audits', async () => {
  const m = await get('memberships', staffCookie).expect(200);
  assert.equal(m.body.items.length, 1);
  assert.equal(m.body.items[0].id, staffId);
  assert.equal('password_hash' in m.body.items[0], false);
  await post('branches', staffCookie)
    .send({ code: 'DENIED', name: 'Denied', timezone: 'Asia/Jakarta' })
    .expect(403);
  await get('audit-events', staffCookie).expect(403);
});
test('supervisor reads only assigned branch', async () => {
  const r = await post('memberships', cookies[0])
    .send({
      employee_number: 'SUP1',
      full_name: 'Supervisor',
      role: 'SUPERVISOR',
      branch_id: branches[0],
      job_id: jobs[0],
    })
    .expect(201);
  await post('auth/activate').send({ token: r.body.activation_token, password }).expect(200);
  const login = await post('auth/login')
    .send({ company_code: 'company-0', employee_number: 'SUP1', password })
    .expect(200);
  supervisorCookie = cookie(login);
  const b = await get('branches', supervisorCookie).expect(200);
  assert.deepEqual(
    b.body.map((r: any) => r.id),
    [branches[0]],
  );
  const m = await get('memberships', supervisorCookie).expect(200);
  assert.ok(m.body.items.every((r: any) => r.branch_id === branches[0]));
  await post('jobs', supervisorCookie).send({ code: 'DENIED', name: 'Denied' }).expect(403);
});
test('tenant B cannot deactivate tenant A staff, owner is protected', async () => {
  await request(app.getHttpServer())
    .patch('/api/v1/memberships/' + staffId + '/deactivate')
    .set('Cookie', cookies[1])
    .set('Origin', origin)
    .expect(404);
  await request(app.getHttpServer())
    .patch('/api/v1/memberships/' + members[0] + '/deactivate')
    .set('Cookie', cookies[0])
    .set('Origin', origin)
    .expect(404);
});
test('deactivation revokes existing sessions and prevents login', async () => {
  await request(app.getHttpServer())
    .patch('/api/v1/memberships/' + staffId + '/deactivate')
    .set('Cookie', cookies[0])
    .set('Origin', origin)
    .expect(200);
  await get('auth/me', staffCookie).expect(401);
  await post('auth/login')
    .send({ company_code: 'company-0', employee_number: 'S001', password })
    .expect(401);
});
test('cursor pagination and totals derive from database', async () => {
  const page = await get('memberships?limit=1', cookies[0]).expect(200);
  assert.equal(page.body.items.length, 1);
  assert.ok(page.body.next_cursor);
  const second = await get('memberships?limit=1&after=' + page.body.next_cursor, cookies[0]).expect(
    200,
  );
  assert.notEqual(page.body.items[0].id, second.body.items[0].id);
  const s = await get('organization/summary', cookies[0]).expect(200);
  assert.equal(s.body.active_staff, 2);
  assert.equal(s.body.awaiting_activation, 0);
});
test('persistent account rate limit returns 429 without user enumeration', async () => {
  for (let i = 0; i < 10; i++)
    await post('auth/login')
      .send({ company_code: 'missing', employee_number: 'unknown', password })
      .expect(401);
  await post('auth/login')
    .send({ company_code: 'missing', employee_number: 'unknown', password })
    .expect(429);
});
test('expired sessions fail and logout invalidates current session', async () => {
  const raw = token();
  await db.query(
    "INSERT INTO sessions(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()-interval '1 minute')",
    [digest(raw), tenants[0], members[0]],
  );
  await get('auth/me', 'karyanesia_session=' + raw).expect(401);
  await post('auth/logout', supervisorCookie).expect(200);
  await get('auth/me', supervisorCookie).expect(401);
});
test('audit history is immutable at database level', async () => {
  await assert.rejects(
    () => db.query('DELETE FROM audit_events WHERE tenant_id=$1', [tenants[0]]),
    /append-only/,
  );
});
