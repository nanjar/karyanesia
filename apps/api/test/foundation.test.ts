import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
import { parseStaffCsv, csvCell } from '../src/staff-imports';
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
    await pool.end();
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 4,
      options: `-c search_path=${schema}`,
    });
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
  const migrationDir = resolve(__dirname, '../../../packages/database/migrations');
  for (const filename of (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = await readFile(resolve(migrationDir, filename), 'utf8');
    if (engine) await engine.exec(sql);
    else await db.query(sql);
  }
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

const importHeader =
  'employee_number,full_name,branch_code,job_code,supervisor_employee_number,email,start_date';
const staffCsv = (id: string, name = 'Nama Staf', branch = 'BR1', job = 'CASHIER') =>
  `${importHeader}\r\n${id},${name},${branch},${job},,,\r\n`;
let importBatch = '',
  importedMembership = '';
test('CSV parser accepts BOM, CRLF, quoted names and reports row shape errors', () => {
  const rows = parseStaffCsv('\uFEFF' + staffCsv('CSV1', '"Rina, Ayu"'));
  assert.equal(rows[0].data.full_name, 'Rina, Ayu');
  assert.equal(rows[0].row_number, 2);
  assert.deepEqual(rows[0].errors, []);
  const bad = parseStaffCsv(importHeader + '\nID,Incomplete\n');
  assert.ok(bad[0].errors.length);
  assert.throws(
    () => parseStaffCsv('employee_number,employee_number,branch_code,job_code\nX,X,BR1,CASHIER'),
    /Header/,
  );
  assert.throws(() => parseStaffCsv(importHeader + ',role\nX,X,BR1,CASHIER,,,,ADMIN'), /Header/);
  assert.throws(() => parseStaffCsv(importHeader + '\nX,"Unclosed,BR1,CASHIER'), /Format CSV/);
  assert.throws(
    () =>
      parseStaffCsv(
        importHeader +
          '\n' +
          Array.from({ length: 5001 }, (_, i) => `ID${i},Name,BR1,CASHIER,,,`).join('\n'),
      ),
    /5.000/,
  );
});
test('import preview validates mixed rows without creating accounts', async () => {
  const before = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  const csv =
    importHeader +
    '\r\n' +
    [
      'IMP001,"Rina, Ayu",BR1,CASHIER,ADMIN,rina@example.test,2026-10-01',
      'FAIL01,=1+1,MISSING,CASHIER,,,',
      'ADMIN,Existing employee,BR1,CASHIER,,,',
      'IMP002,Invalid job,BR1,MISSING,,,',
    ].join('\r\n');
  const r = await post('staff-imports/preview', cookies[0]).send({ csv }).expect(201);
  importBatch = r.body.id;
  assert.equal(r.body.total, 4);
  assert.equal(r.body.valid, 1);
  assert.equal(r.body.invalid, 3);
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n, before);
  await post(`staff-imports/${importBatch}/commit`, cookies[0])
    .send({ confirm: false })
    .expect(422);
});
test('staff import references and history never cross tenant boundaries', async () => {
  await get(`staff-imports/${importBatch}`, cookies[1]).expect(404);
  await get(`staff-imports/${importBatch}/errors.csv`, cookies[1]).expect(404);
  await post(`staff-imports/${importBatch}/commit`, cookies[1]).send({ confirm: true }).expect(404);
  await post('jobs', cookies[1]).send({ code: 'ONLY_B', name: 'Tenant B job' }).expect(201);
  const r = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('FOREIGN1', 'Foreign job', 'BR1', 'ONLY_B') })
    .expect(201);
  assert.equal(r.body.valid, 0);
  const b = await post('staff-imports/preview', cookies[1])
    .send({ csv: staffCsv('TENANTB') })
    .expect(201);
  const history = await get('staff-imports', cookies[0]).expect(200);
  assert.ok(!history.body.some((v: any) => v.id === b.body.id));
  const sup = await post('auth/login')
    .send({ company_code: 'company-0', employee_number: 'SUP1', password })
    .expect(200);
  await post('staff-imports/preview', cookie(sup))
    .send({ csv: staffCsv('DENIED') })
    .expect(403);
  await get(`staff-imports/${importBatch}/errors.csv`, cookie(sup)).expect(403);
});
test('error CSV escapes spreadsheet formulas and contains only invalid rows', async () => {
  const r = await get(`staff-imports/${importBatch}/errors.csv`, cookies[0]).expect(200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.ok(r.text.includes('"\'=1+1"'));
  assert.ok(!r.text.includes('IMP001'));
  assert.equal(csvCell('  =1+1'), '"\'  =1+1"');
  assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(csvCell('Nama "A"'), '"Nama ""A"""');
});
test('mixed import creates only valid staff, stores optional fields and replays safely', async () => {
  const r = await post(`staff-imports/${importBatch}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(200);
  assert.deepEqual(
    { created: r.body.created, failed: r.body.failed, total: r.body.total },
    { created: 1, failed: 3, total: 4 },
  );
  const again = await post(`staff-imports/${importBatch}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(200);
  assert.deepEqual(again.body, r.body);
  const found = await db.query(
    `SELECT m.id,m.role,m.start_date::text start_date,u.email,u.password_hash FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.employee_number='IMP001'`,
    [tenants[0]],
  );
  assert.equal(found.rows.length, 1);
  importedMembership = found.rows[0].id;
  assert.equal(found.rows[0].role, 'STAFF');
  assert.equal(found.rows[0].email, 'rina@example.test');
  assert.equal(found.rows[0].start_date, '2026-10-01');
  assert.equal(found.rows[0].password_hash, null);
  assert.equal(
    (
      await db.query('SELECT count(*)::int n FROM activation_tokens WHERE membership_id=$1', [
        importedMembership,
      ])
    ).rows[0].n,
    0,
  );
  const repeated = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('IMP001') })
    .expect(201);
  assert.equal(repeated.body.valid, 0);
  await post(`staff-imports/${repeated.body.id}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(422);
});
test('duplicate IDs inside one CSV are all rejected and role headers cannot escalate', async () => {
  const csv = importHeader + '\nDUP1,One,BR1,CASHIER,,,\nDUP1,Two,BR1,CASHIER,,,\n';
  const r = await post('staff-imports/preview', cookies[0]).send({ csv }).expect(201);
  assert.equal(r.body.valid, 0);
  assert.equal(r.body.invalid, 2);
  await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('ROLE') + '', tenant_id: tenants[1] })
    .expect(422);
  await post('staff-imports/preview', cookies[0])
    .send({ csv: importHeader + ',role\nROLE,Role,BR1,CASHIER,,,,ADMIN' })
    .expect(422);
});
test('expired preview cannot create accounts', async () => {
  const p = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('EXPIRED1') })
    .expect(201);
  await db.query("UPDATE staff_imports SET expires_at=now()-interval '1 minute' WHERE id=$1", [
    p.body.id,
  ]);
  await post(`staff-imports/${p.body.id}/commit`, cookies[0]).send({ confirm: true }).expect(410);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM memberships WHERE employee_number='EXPIRED1'"))
      .rows[0].n,
    0,
  );
});
test('confirmation revalidates references and IDs that changed after preview', async () => {
  const job = await post('jobs', cookies[0])
    .send({ code: 'TEMP_IMPORT', name: 'Temporary' })
    .expect(201);
  const csv = importHeader + '\nLATE1,Name,BR1,CASHIER,,,\nDELETED_REF,Name,BR1,TEMP_IMPORT,,,\n';
  const p = await post('staff-imports/preview', cookies[0]).send({ csv }).expect(201);
  assert.equal(p.body.valid, 2);
  await post('memberships', cookies[0])
    .send({
      employee_number: 'LATE1',
      full_name: 'Created after preview',
      branch_id: branches[0],
      job_id: jobs[0],
    })
    .expect(201);
  await db.query('DELETE FROM jobs WHERE id=$1 AND tenant_id=$2', [job.body.id, tenants[0]]);
  const result = await post(`staff-imports/${p.body.id}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(200);
  assert.equal(result.body.created, 0);
  assert.equal(result.body.failed, 2);
});
test('concurrent confirmations and overlapping batches do not create orphan or duplicate users', async () => {
  const p = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('CONCURRENT1') })
    .expect(201);
  const both = await Promise.all([
    post(`staff-imports/${p.body.id}/commit`, cookies[0]).send({ confirm: true }),
    post(`staff-imports/${p.body.id}/commit`, cookies[0]).send({ confirm: true }),
  ]);
  assert.ok(both.every((r) => r.status === 200));
  assert.deepEqual(both[0].body, both[1].body);
  const p1 = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('OVERLAP1') })
    .expect(201);
  const p2 = await post('staff-imports/preview', cookies[0])
    .send({ csv: staffCsv('OVERLAP1') })
    .expect(201);
  const before = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  const results = await Promise.all([
    post(`staff-imports/${p1.body.id}/commit`, cookies[0]).send({ confirm: true }),
    post(`staff-imports/${p2.body.id}/commit`, cookies[0]).send({ confirm: true }),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(
    results.reduce((n, r) => n + r.body.created, 0),
    1,
  );
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n, before + 1);
});
test('CSV upload supports more than 100 KiB and enforces file and JSON limits', async () => {
  const csv =
    importHeader +
    '\n' +
    Array.from({ length: 1000 }, (_, i) => `SIZE${i},${'N'.repeat(110)},BR1,CASHIER,,,`).join('\n');
  assert.ok(Buffer.byteLength(csv) > 100 * 1024);
  const p = await post('staff-imports/preview', cookies[0]).send({ csv }).expect(201);
  assert.equal(p.body.valid, 1000);
  await post('staff-imports/preview', cookies[0])
    .send({ csv: 'é'.repeat(600000) })
    .expect(422);
  await post('staff-imports/preview', cookies[0])
    .send({ csv: 'x'.repeat(3 * 1024 * 1024) })
    .expect(413);
});

let learningId = '',
  learnerCookie = '';
const learningContent = {
  title: 'Pelayanan aman',
  objective: 'Memahami prosedur awal',
  transcript: 'Sapa pelanggan dan periksa area kerja.',
  pass_score: 80,
  questions: [
    {
      prompt: 'Apa langkah pertama?',
      options: ['Sapa pelanggan', 'Abaikan pelanggan'],
      correct: 0,
    },
  ],
};
test('learning drafts are tenant isolated and hidden from staff; publication strips answer keys', async () => {
  const uid = randomUUID(),
    mid = randomUUID();
  await db.query('INSERT INTO users(id,full_name,password_hash) VALUES($1,$2,$3)', [
    uid,
    'Peserta uji',
    await hashPassword(password),
  ]);
  await db.query(
    "INSERT INTO memberships(id,tenant_id,user_id,employee_number,branch_id,job_id,role) VALUES($1,$2,$3,'LEARN1',$4,$5,'STAFF')",
    [mid, tenants[0], uid, branches[0], jobs[0]],
  );
  learnerCookie = cookie(
    await post('auth/login')
      .send({ company_code: 'company-0', employee_number: 'LEARN1', password })
      .expect(200),
  );
  await post('learning', learnerCookie).send(learningContent).expect(403);
  learningId = (await post('learning', cookies[0]).send(learningContent).expect(201)).body.id;
  await get('learning/' + learningId, cookies[1]).expect(404);
  await get('learning/' + learningId, learnerCookie).expect(404);
  assert.equal((await get('learning', learnerCookie)).body.items.length, 0);
  await post(`learning/${learningId}/publish`, cookies[1]).send({ confirm: true }).expect(409);
  await post(`learning/${learningId}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const detail = (await get('learning/' + learningId, learnerCookie).expect(200)).body;
  assert.equal(detail.content.questions[0].correct, undefined);
  assert.equal(detail.status, 'published');
  await post('learning', cookies[0])
    .send({ ...learningContent, questions: [{ ...learningContent.questions[0], correct: 4 }] })
    .expect(422);
});
test('theory grading is server-side, idempotent and limited to three attempts', async () => {
  const idempotency_key = randomUUID();
  const r = await post(`learning/${learningId}/attempts`, learnerCookie)
    .send({ idempotency_key, answers: [0] })
    .expect(201);
  assert.equal(r.body.score, 100);
  assert.equal(r.body.passed, true);
  assert.equal(r.body.practice_status, 'not_assessed');
  assert.deepEqual(
    (
      await post(`learning/${learningId}/attempts`, learnerCookie)
        .send({ idempotency_key, answers: [0] })
        .expect(201)
    ).body,
    r.body,
  );
  await post(`learning/${learningId}/attempts`, learnerCookie)
    .send({ idempotency_key, answers: [1] })
    .expect(409);
  await post(`learning/${learningId}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [2] })
    .expect(409);
  await post(`learning/${learningId}/attempts`, cookies[1])
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(404);
  for (let i = 0; i < 2; i++) {
    const failed = await post(`learning/${learningId}/attempts`, learnerCookie)
      .send({ idempotency_key: randomUUID(), answers: [1] })
      .expect(201);
    assert.equal(failed.body.score, 0);
    assert.equal(failed.body.passed, false);
  }
  await post(`learning/${learningId}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(409);
  assert.equal((await get('learning/' + learningId, learnerCookie)).body.attempts.length, 3);
  await assert.rejects(
    db.query('UPDATE learning_attempts SET result=$1 WHERE version_id=$2', [
      JSON.stringify({ score: 100 }),
      learningId,
    ]),
  );
});
test('published content is immutable and revisions preserve original quiz history', async () => {
  await assert.rejects(
    db.query('UPDATE learning_versions SET content=$1 WHERE id=$2', [
      JSON.stringify({ ...learningContent, title: 'Changed' }),
      learningId,
    ]),
  );
  await assert.rejects(db.query('DELETE FROM learning_versions WHERE id=$1', [learningId]));
  const next = (
    await post(`learning/${learningId}/revise`, cookies[0])
      .send({ ...learningContent, title: 'Versi baru' })
      .expect(201)
  ).body.id;
  const detail = (await get('learning/' + next, cookies[0])).body;
  assert.equal(detail.version, 2);
  assert.equal(detail.status, 'draft');
  assert.equal(
    (await get('learning/' + learningId, learnerCookie)).body.content.title,
    learningContent.title,
  );
  await get('learning/' + next, learnerCookie).expect(404);
  await post(`learning/${learningId}/publish`, cookies[0]).send({ confirm: true }).expect(409);
});

test('concurrent theory submissions preserve the cap and archive preserves replay', async () => {
  const version = (await post(`learning/${learningId}/revise`, cookies[0]).send(learningContent))
    .body.id;
  await post(`learning/${version}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const keys = Array.from({ length: 4 }, () => randomUUID());
  const results = await Promise.all(
    keys.map((idempotency_key) =>
      post(`learning/${version}/attempts`, learnerCookie).send({ idempotency_key, answers: [0] }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 201, 201, 409]);
  const successful = results.findIndex((r) => r.status === 201);
  await post(`learning/${version}/archive`, learnerCookie).send({ confirm: true }).expect(403);
  await post(`learning/${version}/archive`, cookies[0]).send({ confirm: true }).expect(201);
  await get('learning/' + version, learnerCookie).expect(404);
  await post(`learning/${version}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(404);
  const replay = await post(`learning/${version}/attempts`, learnerCookie)
    .send({ idempotency_key: keys[successful], answers: [0] })
    .expect(201);
  assert.deepEqual(replay.body, results[successful].body);
});

test('learning videos accept only YouTube HTTPS URLs and persist canonical links', async () => {
  for (const video_url of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://example.com/a.mp4',
    'http://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/watch?v=bad',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
  ]) {
    await post('learning', cookies[0])
      .send({ ...learningContent, video_url })
      .expect(422);
  }
  for (const video_url of [
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=ignored',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/embed/dQw4w9WgXcQ',
  ]) {
    const r = await post('learning', cookies[0])
      .send({ ...learningContent, video_url })
      .expect(201);
    const detail = (await get('learning/' + r.body.id, cookies[0])).body;
    assert.equal(detail.content.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  }
});

test('five-question versions grade all answers and revisions retain video and original keys', async () => {
  const content = {
    ...learningContent,
    video_url: 'https://youtu.be/dQw4w9WgXcQ',
    questions: Array.from({ length: 5 }, (_, i) => ({
      prompt: `Soal ${i + 1}`,
      options: ['A', 'B', 'C', 'D', 'E'],
      correct: i,
    })),
  };
  await post('learning', cookies[0])
    .send({ ...content, questions: [...content.questions, content.questions[0]] })
    .expect(422);
  await post('learning', cookies[0])
    .send({ ...content, questions: [{ ...content.questions[0], options: ['A'] }] })
    .expect(422);
  const first = (await post('learning', cookies[0]).send(content).expect(201)).body.id;
  await post(`learning/${first}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const result = (
    await post(`learning/${first}/attempts`, learnerCookie)
      .send({ idempotency_key: randomUUID(), answers: [0, 1, 2, 3, 0] })
      .expect(201)
  ).body;
  assert.equal(result.correct, 4);
  assert.equal(result.score, 80);
  assert.equal(result.passed, true);
  const revised = (
    await post(`learning/${first}/revise`, cookies[0])
      .send({ ...content, questions: content.questions.map((q) => ({ ...q, correct: 4 })) })
      .expect(201)
  ).body.id;
  const old = (await get('learning/' + first, cookies[0])).body;
  const next = (await get('learning/' + revised, cookies[0])).body;
  assert.equal(next.content.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepEqual(
    old.content.questions.map((q: any) => q.correct),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    next.content.questions.map((q: any) => q.correct),
    [4, 4, 4, 4, 4],
  );
});

test('supervisor resets failed theory within branch scope and preserves all attempts', async () => {
  supervisorCookie = cookie(
    await post('auth/login')
      .send({ company_code: 'company-0', employee_number: 'SUP1', password })
      .expect(200),
  );
  const learner = (
    await db.query("SELECT id FROM memberships WHERE tenant_id=$1 AND employee_number='LEARN1'", [
      tenants[0],
    ])
  ).rows[0].id;
  const supervisor = (
    await db.query("SELECT id FROM memberships WHERE tenant_id=$1 AND employee_number='SUP1'", [
      tenants[0],
    ])
  ).rows[0].id;
  const version = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${version}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const reason = 'Latihan ulang setelah pendampingan supervisor',
    idempotency_key = randomUUID();
  const payload = { membership_id: learner, reason, idempotency_key };
  await post(`learning/${version}/resets`, supervisorCookie).send(payload).expect(409);
  const firstKey = randomUUID();
  for (let i = 0; i < 3; i++)
    await post(`learning/${version}/attempts`, learnerCookie)
      .send({ idempotency_key: i === 0 ? firstKey : randomUUID(), answers: [1] })
      .expect(201);
  await post(`learning/${version}/resets`, learnerCookie).send(payload).expect(403);
  await post(`learning/${version}/resets`, cookies[1]).send(payload).expect(404);
  await post(`learning/${version}/resets`, supervisorCookie)
    .send({ ...payload, reason: 'short' })
    .expect(422);
  await post(`learning/${version}/resets`, supervisorCookie)
    .send({ ...payload, membership_id: supervisor })
    .expect(403);
  const otherBranch = randomUUID();
  await db.query(
    "INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,'OTHER_LEARN','Other','Asia/Jakarta')",
    [otherBranch, tenants[0]],
  );
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [otherBranch, learner]);
  assert.equal((await get(`learning/${version}/blocked`, supervisorCookie)).body.items.length, 0);
  await post(`learning/${version}/resets`, supervisorCookie).send(payload).expect(404);
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [branches[0], learner]);
  assert.equal(
    (await get(`learning/${version}/blocked`, supervisorCookie)).body.items[0].id,
    learner,
  );
  const results = await Promise.all([
    post(`learning/${version}/resets`, supervisorCookie).send(payload),
    post(`learning/${version}/resets`, supervisorCookie).send({
      ...payload,
      idempotency_key: randomUUID(),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const stored = (await db.query('SELECT * FROM learning_resets WHERE version_id=$1', [version]))
    .rows[0];
  const replayPayload = { ...payload, idempotency_key: stored.idempotency_key };
  assert.equal(
    (await post(`learning/${version}/resets`, supervisorCookie).send(replayPayload).expect(201))
      .body.round,
    2,
  );
  await post(`learning/${version}/resets`, supervisorCookie)
    .send({ ...replayPayload, reason: 'Alasan berbeda tidak diizinkan' })
    .expect(409);
  const detail = (await get(`learning/${version}`, learnerCookie)).body;
  assert.equal(detail.attempts.length, 3);
  assert.equal(detail.budget.remaining, 3);
  assert.equal(detail.budget.round, 2);
  const replay = (
    await post(`learning/${version}/attempts`, learnerCookie)
      .send({ idempotency_key: firstKey, answers: [1] })
      .expect(201)
  ).body;
  assert.equal(replay.round, 1);
  const success = (
    await post(`learning/${version}/attempts`, learnerCookie)
      .send({ idempotency_key: randomUUID(), answers: [0] })
      .expect(201)
  ).body;
  assert.equal(success.round, 2);
  assert.equal(success.attempt, 1);
  assert.equal(success.passed, true);
  for (let i = 0; i < 2; i++)
    await post(`learning/${version}/attempts`, learnerCookie)
      .send({ idempotency_key: randomUUID(), answers: [1] })
      .expect(201);
  await post(`learning/${version}/resets`, supervisorCookie)
    .send({ ...payload, idempotency_key: randomUUID() })
    .expect(409);
  assert.equal((await get(`learning/${version}`, learnerCookie)).body.attempts.length, 6);
  assert.equal((await get(`learning/${version}/blocked`, supervisorCookie)).body.items.length, 0);
  await assert.rejects(
    db.query("UPDATE learning_resets SET reason='Changed reason' WHERE id=$1", [stored.id]),
  );
  const audits = (await get('audit-events', cookies[0])).body;
  assert.ok(audits.some((e: any) => e.action === 'learning.attempts_reset'));
});

let pathId = '',
  pathSecondModule = '';
const pathPayload = () => ({
  title: 'Orientasi kasir',
  description: 'Tahap dasar orientasi kerja',
  steps: [
    { version_id: learningId, due_days: 0, prerequisite: null, practice_required: true },
    { version_id: pathSecondModule, due_days: 2, prerequisite: 1, practice_required: true },
  ],
});
test('onboarding path drafts validate tenant versions, prerequisite order and required practice', async () => {
  pathSecondModule = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${pathSecondModule}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post('onboarding-paths', learnerCookie).send(pathPayload()).expect(403);
  await get('onboarding-paths', supervisorCookie).expect(403);
  const foreign = (await post('learning', cookies[1]).send(learningContent)).body.id;
  await post(`learning/${foreign}/publish`, cookies[1]).send({ confirm: true }).expect(201);
  await post('onboarding-paths', cookies[0])
    .send({ ...pathPayload(), steps: [{ version_id: foreign, due_days: 0 }] })
    .expect(409);
  const draft = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post('onboarding-paths', cookies[0])
    .send({ ...pathPayload(), steps: [{ version_id: draft, due_days: 0 }] })
    .expect(409);
  for (const steps of [
    [{ version_id: learningId, due_days: 0, prerequisite: 1 }],
    [{ version_id: learningId, due_days: 0, practice_required: false }],
    [
      { version_id: learningId, due_days: 0 },
      { version_id: learningId, due_days: 1 },
    ],
    [
      { version_id: learningId, due_days: 3 },
      { version_id: pathSecondModule, due_days: 1, prerequisite: 1 },
    ],
    [],
  ])
    await post('onboarding-paths', cookies[0])
      .send({ ...pathPayload(), steps })
      .expect(422);
  pathId = (await post('onboarding-paths', cookies[0]).send(pathPayload()).expect(201)).body.id;
  const detail = (await get('onboarding-paths/' + pathId, cookies[0]).expect(200)).body;
  assert.equal(detail.version, 1);
  assert.equal(detail.status, 'draft');
  assert.equal(detail.content.steps[0].module_title, learningContent.title);
  assert.equal(detail.content.steps[0].module_checksum.length, 64);
  assert.equal('questions' in detail.content.steps[0], false);
  await get('onboarding-paths/' + pathId, cookies[1]).expect(404);
  await get('onboarding-paths/' + pathId, learnerCookie).expect(403);
  await post(`onboarding-paths/${pathId}/publish`, cookies[1]).send({ confirm: true }).expect(409);
});
test('published paths and references are immutable and revisions preserve original snapshots', async () => {
  await post(`onboarding-paths/${pathId}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  await assert.rejects(
    db.query('UPDATE onboarding_paths SET content=$1 WHERE id=$2', [
      JSON.stringify({ title: 'tampered' }),
      pathId,
    ]),
  );
  await assert.rejects(db.query('DELETE FROM onboarding_paths WHERE id=$1', [pathId]));
  await assert.rejects(db.query('DELETE FROM onboarding_path_modules WHERE path_id=$1', [pathId]));
  await assert.rejects(
    db.query(
      'INSERT INTO onboarding_path_modules(tenant_id,path_id,position,version_id) VALUES($1,$2,3,$3)',
      [tenants[0], pathId, pathSecondModule],
    ),
  );
  const revised = (
    await post(`onboarding-paths/${pathId}/revise`, cookies[0])
      .send({ ...pathPayload(), title: 'Orientasi baru' })
      .expect(201)
  ).body;
  assert.equal(revised.version, 2);
  assert.equal(
    (await get('onboarding-paths/' + pathId, cookies[0])).body.content.title,
    'Orientasi kasir',
  );
  assert.equal((await get('onboarding-paths/' + revised.id, cookies[0])).body.status, 'draft');
  await post(`onboarding-paths/${pathId}/archive`, cookies[0]).send({ confirm: true }).expect(201);
  assert.equal((await get('onboarding-paths/' + pathId, cookies[0])).body.status, 'archived');
  await post(`onboarding-paths/${pathId}/publish`, cookies[0]).send({ confirm: true }).expect(409);
});
test('path publication revalidates module availability and concurrent revisions get distinct numbers', async () => {
  const draft = (await post('onboarding-paths', cookies[0]).send(pathPayload()).expect(201)).body
    .id;
  const versions = await Promise.all(
    [1, 2].map(() => post(`onboarding-paths/${draft}/revise`, cookies[0]).send(pathPayload())),
  );
  assert.deepEqual(versions.map((r) => r.body.version).sort(), [2, 3]);
  await post(`learning/${pathSecondModule}/archive`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post(`onboarding-paths/${draft}/publish`, cookies[0]).send({ confirm: true }).expect(409);
  assert.equal((await get('onboarding-paths/' + draft, cookies[0])).body.status, 'draft');
  const audit = (await get('audit-events', cookies[0])).body;
  assert.ok(audit.some((e: any) => e.action === 'onboarding_path.published'));
});

let assignmentPath = '',
  assignmentBatch = '',
  assignmentId = '';
const assignmentStart = '2026-10-16';
let assignmentLearner = '';
const assignmentPayload = () => ({
  path_version_id: assignmentPath,
  start_date: assignmentStart,
  target: { kind: 'staff', ids: [assignmentLearner] },
});
test('assignment previews validate targets and create no staff tasks before confirmation', async () => {
  assignmentLearner = (
    await db.query("SELECT id FROM memberships WHERE tenant_id=$1 AND employee_number='LEARN1'", [
      tenants[0],
    ])
  ).rows[0].id;
  const module = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${module}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  assignmentPath = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Onboarding terjadwal',
      description: 'Uji penugasan',
      steps: [{ version_id: module, due_days: 0 }],
    })
  ).body.id;
  await post(`onboarding-paths/${assignmentPath}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post('onboarding-assignments/preview', learnerCookie).send(assignmentPayload()).expect(403);
  await post('onboarding-assignments/preview', supervisorCookie)
    .send(assignmentPayload())
    .expect(403);
  await post('onboarding-assignments/preview', cookies[1]).send(assignmentPayload()).expect(409);
  await post('onboarding-assignments/preview', cookies[0])
    .send({ ...assignmentPayload(), start_date: '2026-02-30' })
    .expect(422);
  await post('onboarding-assignments/preview', cookies[0])
    .send({ ...assignmentPayload(), target: { kind: 'branch', ids: [branches[1]] } })
    .expect(404);
  const preview = (
    await post('onboarding-assignments/preview', cookies[0]).send(assignmentPayload()).expect(201)
  ).body;
  assignmentBatch = preview.id;
  assert.equal(preview.count, 1);
  assert.equal(preview.items[0].id, assignmentLearner);
  assert.equal((await get('onboarding-assignments', learnerCookie)).body.items.length, 0);
  await post(`onboarding-assignments/batches/${assignmentBatch}/commit`, cookies[1])
    .send({ confirm: true })
    .expect(404);
  await post(`onboarding-assignments/batches/${assignmentBatch}/commit`, learnerCookie)
    .send({ confirm: true })
    .expect(403);
});
test('assignment confirmation is atomic and idempotent with local calendar deadlines', async () => {
  const responses = await Promise.all(
    [1, 2].map(() =>
      post(`onboarding-assignments/batches/${assignmentBatch}/commit`, cookies[0]).send({
        confirm: true,
      }),
    ),
  );
  assert.ok(responses.every((r) => r.status === 201));
  assert.deepEqual(responses[0].body, responses[1].body);
  assignmentId = responses[0].body.assignment_ids[0];
  const list = (await get('onboarding-assignments', learnerCookie)).body.items;
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'assigned');
  assert.equal(list[0].snapshot.steps[0].practice_required, true);
  assert.equal(
    new Date(list[0].snapshot.steps[0].due_at).toISOString(),
    '2026-10-16T17:00:00.000Z',
  );
  assert.equal(list[0].timezone, 'Asia/Jakarta');
  assert.equal(list[0].start_date, assignmentStart);
  assert.equal('questions' in list[0].snapshot.steps[0], false);
  assert.equal((await get('onboarding-assignments', cookies[1])).body.items.length, 0);
  assert.ok(
    (await get('onboarding-assignments', supervisorCookie)).body.items.some(
      (t: any) => t.id === assignmentId,
    ),
  );
  await assert.rejects(
    db.query('UPDATE onboarding_assignments SET snapshot=$1 WHERE id=$2', [
      JSON.stringify({ title: 'tampered' }),
      assignmentId,
    ]),
  );
  await assert.rejects(db.query('DELETE FROM onboarding_assignments WHERE id=$1', [assignmentId]));
});
test('assignment previews expire and reject changes to previewed staff context', async () => {
  const expired = (
    await post('onboarding-assignments/preview', cookies[0]).send(assignmentPayload())
  ).body.id;
  await db.query(
    "UPDATE onboarding_assignment_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [expired],
  );
  await post(`onboarding-assignments/batches/${expired}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(410);
  const batch = (await post('onboarding-assignments/preview', cookies[0]).send(assignmentPayload()))
    .body.id;
  const branch = randomUUID();
  await db.query(
    "INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,'ASSIGN_WITA','WITA','Asia/Makassar')",
    [branch, tenants[0]],
  );
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [branch, assignmentLearner]);
  await post(`onboarding-assignments/batches/${batch}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(409);
  assert.equal(
    Number(
      (
        await db.query('SELECT count(*) AS n FROM onboarding_assignments WHERE batch_id=$1', [
          batch,
        ])
      ).rows[0].n,
    ),
    0,
  );
  const wita = (await post('onboarding-assignments/preview', cookies[0]).send(assignmentPayload()))
    .body.id;
  const confirmed = (
    await post(`onboarding-assignments/batches/${wita}/commit`, cookies[0])
      .send({ confirm: true })
      .expect(201)
  ).body.assignment_ids[0];
  const row = (
    await db.query('SELECT snapshot FROM onboarding_assignments WHERE id=$1', [confirmed])
  ).rows[0];
  assert.equal(new Date(row.snapshot.steps[0].due_at).toISOString(), '2026-10-16T16:00:00.000Z');
  assert.ok(
    !(await get('onboarding-assignments', supervisorCookie)).body.items.some(
      (t: any) => t.membership_id === assignmentLearner,
    ),
  );
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [
    branches[0],
    assignmentLearner,
  ]);
});
test('path archival preserves assigned snapshots and cancellation requires reason and audit', async () => {
  await post(`onboarding-paths/${assignmentPath}/archive`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post(`onboarding-assignments/batches/${assignmentBatch}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post('onboarding-assignments/preview', cookies[0]).send(assignmentPayload()).expect(409);
  assert.ok(
    (await get('onboarding-assignments', learnerCookie)).body.items.some(
      (t: any) => t.id === assignmentId,
    ),
  );
  const reason = 'Perubahan rencana orientasi kerja staf';
  await post(`onboarding-assignments/${assignmentId}/cancel`, learnerCookie)
    .send({ reason })
    .expect(403);
  await post(`onboarding-assignments/${assignmentId}/cancel`, cookies[1])
    .send({ reason })
    .expect(404);
  await post(`onboarding-assignments/${assignmentId}/cancel`, cookies[0])
    .send({ reason: 'short' })
    .expect(422);
  await post(`onboarding-assignments/${assignmentId}/cancel`, cookies[0])
    .send({ reason })
    .expect(201);
  await post(`onboarding-assignments/${assignmentId}/cancel`, cookies[0])
    .send({ reason })
    .expect(201);
  await post(`onboarding-assignments/${assignmentId}/cancel`, cookies[0])
    .send({ reason: 'Alasan pembatalan yang berbeda' })
    .expect(409);
  const item = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === assignmentId,
  );
  assert.equal(item.status, 'cancelled');
  assert.equal(item.cancel_reason, reason);
  assert.equal(item.snapshot.title, 'Onboarding terjadwal');
  assert.ok(
    (await get('audit-events', cookies[0])).body.some(
      (e: any) => e.action === 'onboarding_assignment.cancelled',
    ),
  );
});

test('branch preview freezes the target set and job targeting remains tenant scoped', async () => {
  const old = (await get('onboarding-paths/' + assignmentPath, cookies[0])).body;
  const path = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Kelompok cabang',
      description: 'Target tetap',
      steps: old.content.steps.map((s: any) => ({
        version_id: s.version_id,
        due_days: s.due_days,
      })),
    })
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const payload = {
    ...assignmentPayload(),
    path_version_id: path,
    target: { kind: 'branch', ids: [branches[0]] },
  };
  const preview = (
    await post('onboarding-assignments/preview', cookies[0]).send(payload).expect(201)
  ).body;
  const newStaff = (
    await post('memberships', cookies[0])
      .send({
        employee_number: 'AFTER_PREVIEW',
        full_name: 'After preview',
        branch_id: branches[0],
        job_id: jobs[0],
      })
      .expect(201)
  ).body.id;
  const result = (
    await post(`onboarding-assignments/batches/${preview.id}/commit`, cookies[0])
      .send({ confirm: true })
      .expect(201)
  ).body;
  assert.equal(result.count, preview.count);
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) AS n FROM onboarding_assignments WHERE batch_id=$1 AND membership_id=$2',
          [preview.id, newStaff],
        )
      ).rows[0].n,
    ),
    0,
  );
  await post('onboarding-assignments/preview', cookies[0])
    .send({ ...payload, target: { kind: 'job', ids: [jobs[1]] } })
    .expect(404);
  const byJob = (
    await post('onboarding-assignments/preview', cookies[0])
      .send({ ...payload, target: { kind: 'job', ids: [jobs[0]] } })
      .expect(201)
  ).body;
  assert.ok(byJob.count >= preview.count);
});

test('assignment progress reuses exact-version theory evidence and never marks practice complete', async () => {
  const first = (await post('learning', cookies[0]).send({ ...learningContent, title: 'Teori A' }))
    .body.id;
  const second = (await post('learning', cookies[0]).send({ ...learningContent, title: 'Teori B' }))
    .body.id;
  for (const id of [first, second])
    await post(`learning/${id}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  await post(`learning/${first}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(201);
  const path = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Progres teori',
      description: 'Bukti teori immutable',
      steps: [
        { version_id: first, due_days: 0 },
        { version_id: second, due_days: 1 },
      ],
    })
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const preview = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: path,
      start_date: '2020-01-01',
    })
  ).body.id;
  const id = (
    await post(`onboarding-assignments/batches/${preview}/commit`, cookies[0]).send({
      confirm: true,
    })
  ).body.assignment_ids[0];
  const read = async () =>
    (await get('onboarding-assignments', learnerCookie)).body.items.find((a: any) => a.id === id);
  let item = await read();
  assert.equal(item.status, 'in_progress');
  assert.equal(item.progress.theory_passed, 1);
  assert.equal(item.progress.practice_passed, 0);
  assert.equal(item.progress.completed_steps, 0);
  assert.equal(item.progress.overdue, true);
  assert.equal(item.progress.steps[0].theory_status, 'passed');
  assert.equal(item.progress.steps[1].theory_status, 'not_started');
  assert.equal(item.progress.steps[1].best_score, null);
  await post(`learning/${second}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0], score: 100, practice_status: 'competent' })
    .expect(422);
  await post(`learning/${second}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [1] })
    .expect(201);
  item = await read();
  assert.equal(item.status, 'in_progress');
  assert.equal(item.progress.steps[1].theory_status, 'needs_review');
  assert.equal(item.progress.steps[1].best_score, 0);
  await post(`learning/${second}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(201);
  item = await read();
  assert.equal(item.status, 'awaiting_assessment');
  assert.equal(item.progress.theory_passed, 2);
  assert.equal(item.progress.practice_passed, 0);
  assert.ok(item.progress.steps.every((s: any) => s.practice_status === 'not_assessed'));
  const supervisor = (await get('onboarding-assignments', supervisorCookie)).body.items.find(
    (a: any) => a.id === id,
  );
  assert.equal(supervisor.progress.theory_passed, 2);
  assert.ok(
    !(await get('onboarding-assignments', cookies[1])).body.items.some((a: any) => a.id === id),
  );
  // A revision with the same text and answer key is still a different immutable version.
  const revision = (
    await post(`learning/${second}/revise`, cookies[0]).send({
      ...learningContent,
      title: 'Teori B revisi',
    })
  ).body.id;
  await post(`learning/${revision}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const nextPath = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Revisi perlu teori baru',
      description: 'Versi berbeda',
      steps: [{ version_id: revision, due_days: 0 }],
    })
  ).body.id;
  await post(`onboarding-paths/${nextPath}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  const nextBatch = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: nextPath,
    })
  ).body.id;
  const nextId = (
    await post(`onboarding-assignments/batches/${nextBatch}/commit`, cookies[0]).send({
      confirm: true,
    })
  ).body.assignment_ids[0];
  const next = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (a: any) => a.id === nextId,
  );
  assert.equal(next.status, 'assigned');
  assert.equal(next.progress.theory_passed, 0);
  await post(`learning/${second}/archive`, cookies[0]).send({ confirm: true }).expect(201);
  item = await read();
  assert.equal(item.progress.steps[1].module_available, false);
  assert.equal(item.progress.steps[1].theory_status, 'passed');
  await post(`onboarding-assignments/${id}/cancel`, cookies[0])
    .send({ reason: 'Penugasan dihentikan setelah evaluasi' })
    .expect(201);
  // Quiz evidence added after cancellation must not rewrite the cancelled task's history.
  await post(`learning/${first}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [1] })
    .expect(201);
  item = await read();
  assert.equal(item.status, 'cancelled');
  assert.equal(item.progress.overdue, false);
  assert.equal(item.progress.steps[0].attempts, 1);
  assert.equal(item.progress.theory_passed, 2);
  assert.equal(item.progress.completed_steps, 0);
  const stored = (await db.query('SELECT status FROM onboarding_assignments WHERE id=$1', [nextId]))
    .rows[0];
  assert.equal(stored.status, 'assigned');
});

test('cancelled assignment evidence retains database timestamp precision', async () => {
  const module = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${module}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const path = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Presisi histori',
      description: 'Batas pembatalan',
      steps: [{ version_id: module, due_days: 0 }],
    })
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const batch = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: path,
    })
  ).body.id;
  const id = (
    await post(`onboarding-assignments/batches/${batch}/commit`, cookies[0]).send({ confirm: true })
  ).body.assignment_ids[0];
  for (const [time, passed] of [
    ['2026-10-16T00:00:00.123456Z', true],
    ['2026-10-16T00:00:00.123900Z', false],
  ] as const) {
    await db.query(
      'INSERT INTO learning_attempts(id,tenant_id,version_id,membership_id,idempotency_key,answers,result,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        tenants[0],
        module,
        assignmentLearner,
        randomUUID(),
        JSON.stringify([passed ? 0 : 1]),
        JSON.stringify({ score: passed ? 100 : 0, passed }),
        time,
      ],
    );
  }
  await db.query(
    "UPDATE onboarding_assignments SET status='cancelled',cancel_reason='Pembatalan untuk uji presisi',cancelled_by=$1,cancelled_at='2026-10-16T00:00:00.123789Z' WHERE id=$2",
    [members[0], id],
  );
  const item = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (a: any) => a.id === id,
  );
  assert.equal(item.status, 'cancelled');
  assert.equal(item.progress.theory_passed, 1);
  assert.equal(item.progress.steps[0].attempts, 1);
});

let rubricId = '',
  rubricPath = '',
  rubricAssignment = '';
const rubricContent = {
  title: 'Praktik pelayanan',
  instructions: 'Amati staf menjalankan prosedur pada kondisi kerja yang sesuai.',
  items: [
    { label: 'Area kerja aman', required: true, critical: true },
    { label: 'Prosedur dijalankan berurutan', required: true, critical: false },
    { label: 'Menyampaikan saran perbaikan', required: false, critical: false },
  ],
};
const rubricPathPayload = (rubric: string) => ({
  title: 'Jalur dengan rubrik',
  description: 'Persyaratan praktik eksplisit',
  steps: [{ version_id: learningId, due_days: 1, rubric_version_id: rubric }],
});
test('practice rubrics enforce required and critical items and tenant authorization', async () => {
  await post('practice-rubrics', learnerCookie).send(rubricContent).expect(403);
  await get('practice-rubrics', supervisorCookie).expect(403);
  await post('practice-rubrics', cookies[0])
    .send({
      ...rubricContent,
      items: [{ label: 'Tidak konsisten', required: false, critical: true }],
    })
    .expect(422);
  await post('practice-rubrics', cookies[0])
    .send({
      ...rubricContent,
      items: [{ label: 'Semua opsional', required: false, critical: false }],
    })
    .expect(422);
  await post('practice-rubrics', cookies[0])
    .send({ ...rubricContent, items: [] })
    .expect(422);
  await post('practice-rubrics', cookies[0])
    .send({ ...rubricContent, items: Array.from({ length: 21 }, () => rubricContent.items[0]) })
    .expect(422);
  rubricId = (await post('practice-rubrics', cookies[0]).send(rubricContent).expect(201)).body.id;
  await get('practice-rubrics/' + rubricId, cookies[1]).expect(404);
  await post(`practice-rubrics/${rubricId}/publish`, cookies[1])
    .send({ confirm: true })
    .expect(409);
  await post('onboarding-paths', cookies[0]).send(rubricPathPayload(rubricId)).expect(409);
  await post(`practice-rubrics/${rubricId}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  const detail = (await get('practice-rubrics/' + rubricId, cookies[0])).body;
  assert.equal(detail.content.items[0].position, 1);
  assert.equal(detail.content.items[0].critical, true);
  assert.equal(detail.checksum.length, 64);
  const foreign = (await post('practice-rubrics', cookies[1]).send(rubricContent)).body.id;
  await post(`practice-rubrics/${foreign}/publish`, cookies[1]).send({ confirm: true }).expect(201);
  await post('onboarding-paths', cookies[0]).send(rubricPathPayload(foreign)).expect(409);
});
test('published rubrics are immutable and snapshots preserve criteria across revisions', async () => {
  await assert.rejects(
    db.query('UPDATE practice_rubrics SET content=$1 WHERE id=$2', [
      JSON.stringify({ ...rubricContent, title: 'Tampered' }),
      rubricId,
    ]),
  );
  await assert.rejects(db.query('DELETE FROM practice_rubrics WHERE id=$1', [rubricId]));
  rubricPath = (
    await post('onboarding-paths', cookies[0]).send(rubricPathPayload(rubricId)).expect(201)
  ).body.id;
  const draft = (await get('onboarding-paths/' + rubricPath, cookies[0])).body;
  assert.equal(draft.content.steps[0].practice_rubric.id, rubricId);
  assert.equal(draft.content.steps[0].practice_rubric.items[0].label, rubricContent.items[0].label);
  assert.equal(
    (
      await db.query('SELECT rubric_version_id FROM onboarding_path_modules WHERE path_id=$1', [
        rubricPath,
      ])
    ).rows[0].rubric_version_id,
    rubricId,
  );
  await post(`onboarding-paths/${rubricPath}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  const batch = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: rubricPath,
    })
  ).body.id;
  rubricAssignment = (
    await post(`onboarding-assignments/batches/${batch}/commit`, cookies[0])
      .send({ confirm: true })
      .expect(201)
  ).body.assignment_ids[0];
  const revisions = await Promise.all(
    [1, 2].map((i) =>
      post(`practice-rubrics/${rubricId}/revise`, cookies[0]).send({
        ...rubricContent,
        title: 'Rubrik revisi ' + i,
      }),
    ),
  );
  assert.deepEqual(revisions.map((r) => r.body.version).sort(), [2, 3]);
  const task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (a: any) => a.id === rubricAssignment,
  );
  assert.equal(task.snapshot.steps[0].practice_rubric.version, 1);
  assert.equal(task.snapshot.steps[0].practice_rubric.title, rubricContent.title);
  assert.equal(task.snapshot.steps[0].practice_rubric.items.length, 3);
  assert.equal(task.progress.practice_passed, 0);
});
test('archived rubrics block new publication and assignment while preserving existing snapshots', async () => {
  const draft = (
    await post('onboarding-paths', cookies[0]).send(rubricPathPayload(rubricId)).expect(201)
  ).body.id;
  const pending = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: rubricPath,
    })
  ).body.id;
  await post(`practice-rubrics/${rubricId}/archive`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await post(`onboarding-paths/${draft}/publish`, cookies[0]).send({ confirm: true }).expect(409);
  await post('onboarding-assignments/preview', cookies[0])
    .send({ ...assignmentPayload(), path_version_id: rubricPath })
    .expect(409);
  await post(`onboarding-assignments/batches/${pending}/commit`, cookies[0])
    .send({ confirm: true })
    .expect(409);
  const existing = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (a: any) => a.id === rubricAssignment,
  );
  assert.equal(existing.snapshot.steps[0].practice_rubric.id, rubricId);
  assert.equal(existing.snapshot.steps[0].practice_rubric.items[0].critical, true);
  assert.equal(existing.progress.practice_passed, 0);
  const old = (await get('practice-rubrics/' + rubricId, cookies[0])).body;
  assert.equal(old.status, 'archived');
  assert.equal(old.content.title, rubricContent.title);
  assert.ok(
    (await get('audit-events', cookies[0])).body.some(
      (a: any) => a.action === 'practice_rubric.archived',
    ),
  );
});

let signedAssessment = '',
  practicePayload: any;
const practiceAnswers = (critical: boolean) => [
  { position: 1, passed: critical },
  { position: 2, passed: true },
  { position: 3, passed: false },
];
test('practice observations enforce scope, no self approval and server rubric grading', async () => {
  practicePayload = {
    step_position: 1,
    answers: practiceAnswers(false),
    comment: 'Observasi langsung pada area kerja staf',
    training_instructions: '',
    supersedes: null,
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, learnerCookie)
    .send(practicePayload)
    .expect(403);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, cookies[1])
    .send(practicePayload)
    .expect(404);
  await get(`onboarding-assignments/${rubricAssignment}/assessments`, cookies[1]).expect(404);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...practicePayload, outcome: 'competent' })
    .expect(422);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send(practicePayload)
    .expect(409);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...practicePayload, answers: [{ position: 1, passed: true }] })
    .expect(409);
  const branch = (
    await db.query("SELECT id FROM branches WHERE tenant_id=$1 AND code='ASSIGN_WITA'", [
      tenants[0],
    ])
  ).rows[0].id;
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [branch, assignmentLearner]);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send(practicePayload)
    .expect(404);
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [
    branches[0],
    assignmentLearner,
  ]);
  const supervisor = (
    await db.query("SELECT id FROM memberships WHERE tenant_id=$1 AND employee_number='SUP1'", [
      tenants[0],
    ])
  ).rows[0].id;
  const selfTask = randomUUID();
  await db.query(
    'INSERT INTO onboarding_assignments(id,tenant_id,batch_id,path_version_id,membership_id,branch_id,start_date,timezone,snapshot) SELECT $1,tenant_id,batch_id,path_version_id,$2,branch_id,start_date,timezone,snapshot FROM onboarding_assignments WHERE id=$3',
    [selfTask, supervisor, rubricAssignment],
  );
  await post(`onboarding-assignments/${selfTask}/assessments`, supervisorCookie)
    .send(practicePayload)
    .expect(403);
  practicePayload = {
    ...practicePayload,
    training_instructions: 'Latih pemeriksaan area aman sebelum menjalankan prosedur.',
  };
  const result = (
    await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
      .send(practicePayload)
      .expect(201)
  ).body;
  signedAssessment = result.id;
  assert.equal(result.outcome, 'needs_practice');
  assert.equal(result.rubric_version_id, rubricId);
  assert.equal(result.sequence, 1);
  const history = (
    await get(`onboarding-assignments/${rubricAssignment}/assessments`, learnerCookie).expect(200)
  ).body.items;
  assert.equal(history[0].outcome, 'needs_practice');
  assert.equal(history[0].assessor_name, 'Supervisor');
  assert.equal(history[0].training_instructions, practicePayload.training_instructions);
  assert.equal('input_hash' in history[0], false);
  const task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === rubricAssignment,
  );
  assert.equal(task.progress.steps[0].practice_status, 'needs_practice');
  assert.notEqual(task.status, 'completed');
});
test('practice reassessments append history, require latest record and complete only with theory', async () => {
  const correct = {
    ...practicePayload,
    answers: practiceAnswers(true),
    training_instructions: '',
    idempotency_key: randomUUID(),
    supersedes: signedAssessment,
    correction_reason: 'Latihan ulang dan observasi kedua sudah dilakukan',
  };
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...correct, supersedes: null })
    .expect(409);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...correct, correction_reason: '' })
    .expect(409);
  const result = (
    await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
      .send(correct)
      .expect(201)
  ).body;
  assert.equal(result.outcome, 'competent');
  assert.equal(result.sequence, 2);
  assert.equal(result.supersedes, signedAssessment);
  assert.deepEqual(
    (
      await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
        .send(correct)
        .expect(201)
    ).body,
    result,
  );
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...correct, comment: 'Isi berbeda pada key yang sudah dipakai' })
    .expect(409);
  let task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === rubricAssignment,
  );
  assert.equal(task.status, 'completed');
  assert.equal(task.progress.practice_passed, 1);
  assert.equal(task.progress.completed_steps, 1);
  assert.equal(task.progress.overdue, false);
  const parallel = [0, 1].map((i) => ({
    ...correct,
    supersedes: result.id,
    idempotency_key: randomUUID(),
    comment: 'Pemeriksaan lanjutan nomor ' + i,
  }));
  const responses = await Promise.all(
    parallel.map((input) =>
      post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie).send(input),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const winner = responses.findIndex((r) => r.status === 201),
    latest = responses[winner].body;
  assert.equal(latest.sequence, 3);
  await assert.rejects(
    db.query("UPDATE practice_assessments SET outcome='competent' WHERE id=$1", [signedAssessment]),
  );
  await assert.rejects(
    db.query('DELETE FROM practice_assessments WHERE id=$1', [signedAssessment]),
  );
  const history = (
    await get(`onboarding-assignments/${rubricAssignment}/assessments`, learnerCookie)
  ).body.items;
  assert.equal(history.length, 3);
  assert.ok(history.some((h: any) => h.id === signedAssessment && h.outcome === 'needs_practice'));
  await post(`onboarding-assignments/${rubricAssignment}/cancel`, cookies[0])
    .send({ reason: 'Penugasan dihentikan secara administratif' })
    .expect(201);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send({ ...correct, supersedes: latest.id, idempotency_key: randomUUID() })
    .expect(409);
  await post(`onboarding-assignments/${rubricAssignment}/assessments`, supervisorCookie)
    .send(parallel[winner])
    .expect(201);
  task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === rubricAssignment,
  );
  assert.equal(task.status, 'cancelled');
});
test('practice checks theory and prerequisite competence and corrections can reopen completion', async () => {
  const rubric = (await post('practice-rubrics', cookies[0]).send(rubricContent)).body.id;
  await post(`practice-rubrics/${rubric}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const module = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${module}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const path = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Praktik berurutan',
      description: 'Verifikasi teori dan praktik prasyarat',
      steps: [
        { version_id: learningId, rubric_version_id: rubric, due_days: 0 },
        { version_id: module, rubric_version_id: rubric, due_days: 1, prerequisite: 1 },
      ],
    })
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const preview = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: path,
      start_date: '2020-01-01',
    })
  ).body.id;
  const taskId = (
    await post(`onboarding-assignments/batches/${preview}/commit`, cookies[0]).send({
      confirm: true,
    })
  ).body.assignment_ids[0];
  const payload = {
    step_position: 2,
    answers: practiceAnswers(true),
    comment: 'Praktik sesuai kriteria yang diamati',
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
    .send(payload)
    .expect(409);
  await post(`learning/${module}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(403);
  await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
    .send(payload)
    .expect(409);
  const first = (
    await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
      .send({ ...payload, step_position: 1, idempotency_key: randomUUID() })
      .expect(201)
  ).body;
  await post(`learning/${module}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(201);
  await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
    .send(payload)
    .expect(201);
  let task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === taskId,
  );
  assert.equal(task.status, 'completed');
  assert.equal(task.progress.completed_steps, 2);
  assert.equal(task.progress.overdue, false);
  await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
    .send({
      ...payload,
      step_position: 1,
      answers: practiceAnswers(false),
      supersedes: first.id,
      correction_reason: 'Koreksi hasil setelah ditemukan bukti observasi baru',
      training_instructions: 'Ulangi pemeriksaan area aman sebelum bekerja',
      idempotency_key: randomUUID(),
    })
    .expect(201);
  task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === taskId,
  );
  assert.equal(task.status, 'awaiting_assessment');
  assert.equal(task.progress.completed_steps, 1);
  assert.equal(task.progress.overdue, true);
  const legacy = (
    await db.query(
      "SELECT id FROM onboarding_assignments WHERE tenant_id=$1 AND membership_id=$2 AND status='assigned' AND snapshot->'steps'->0->'practice_rubric' IS NULL LIMIT 1",
      [tenants[0], assignmentLearner],
    )
  ).rows[0].id;
  await post(`onboarding-assignments/${legacy}/assessments`, supervisorCookie)
    .send({ ...payload, step_position: 1 })
    .expect(409);
  assert.ok(
    (await get('audit-events', cookies[0])).body.some(
      (e: any) => e.action === 'practice_assessment.signed',
    ),
  );
});

test('practice signing rejects assignments before their local start date', async () => {
  const rubric = (await post('practice-rubrics', cookies[0]).send(rubricContent)).body.id;
  await post(`practice-rubrics/${rubric}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const path = (await post('onboarding-paths', cookies[0]).send(rubricPathPayload(rubric))).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const preview = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: path,
      start_date: '2099-01-01',
    })
  ).body.id;
  const taskId = (
    await post(`onboarding-assignments/batches/${preview}/commit`, cookies[0]).send({
      confirm: true,
    })
  ).body.assignment_ids[0];
  await post(`onboarding-assignments/${taskId}/assessments`, supervisorCookie)
    .send({
      step_position: 1,
      answers: practiceAnswers(true),
      comment: 'Praktik sebelum tanggal mulai tugas',
      idempotency_key: randomUUID(),
    })
    .expect(409);
  assert.equal(
    (await get(`onboarding-assignments/${taskId}/assessments`, learnerCookie)).body.items.length,
    0,
  );
});

let requestTask = '',
  pendingRequest = '',
  requestGrade: any,
  firstRequestPayload: any;
test('staff practice requests require eligibility, ownership and idempotent pending submission', async () => {
  const rubric = (await post('practice-rubrics', cookies[0]).send(rubricContent)).body.id;
  await post(`practice-rubrics/${rubric}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const module = (await post('learning', cookies[0]).send(learningContent)).body.id;
  await post(`learning/${module}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const path = (
    await post('onboarding-paths', cookies[0]).send({
      title: 'Pengajuan staf',
      description: 'Praktik dan peninjauan',
      steps: [{ version_id: module, rubric_version_id: rubric, due_days: 1 }],
    })
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const batch = (
    await post('onboarding-assignments/preview', cookies[0]).send({
      ...assignmentPayload(),
      path_version_id: path,
      start_date: '2020-01-01',
    })
  ).body.id;
  requestTask = (
    await post(`onboarding-assignments/batches/${batch}/commit`, cookies[0]).send({ confirm: true })
  ).body.assignment_ids[0];
  firstRequestPayload = {
    step_position: 1,
    kind: 'practice',
    reason: 'Saya siap menunjukkan praktik sesuai rubrik tugas',
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send(firstRequestPayload)
    .expect(409);
  await post(`learning/${module}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(201);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, cookies[0])
    .send(firstRequestPayload)
    .expect(404);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, supervisorCookie)
    .send(firstRequestPayload)
    .expect(404);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, cookies[1])
    .send(firstRequestPayload)
    .expect(404);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...firstRequestPayload, reason: 'short' })
    .expect(422);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...firstRequestPayload, kind: 'review' })
    .expect(409);
  const submissions = await Promise.all(
    [1, 2].map(() =>
      post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie).send(
        firstRequestPayload,
      ),
    ),
  );
  assert.ok(submissions.every((r) => r.status === 201));
  assert.deepEqual(submissions[0].body, submissions[1].body);
  pendingRequest = submissions[0].body.id;
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...firstRequestPayload, idempotency_key: randomUUID() })
    .expect(409);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...firstRequestPayload, reason: 'Isi berbeda pada kunci yang sudah digunakan' })
    .expect(409);
  const progress = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === requestTask,
  );
  assert.equal(progress.progress.steps[0].practice_request.status, 'pending');
  assert.equal(progress.progress.steps[0].practice_status, 'not_assessed');
  assert.equal(progress.status, 'awaiting_assessment');
  await get('onboarding-assignments/practice-queue', learnerCookie).expect(403);
  assert.ok(
    (
      await get('onboarding-assignments/practice-queue', supervisorCookie).expect(200)
    ).body.items.some((t: any) => t.id === requestTask),
  );
  assert.ok(
    !(await get('onboarding-assignments/practice-queue', cookies[1])).body.items.some(
      (t: any) => t.id === requestTask,
    ),
  );
  const otherBranch = (
    await db.query("SELECT id FROM branches WHERE tenant_id=$1 AND code='ASSIGN_WITA'", [
      tenants[0],
    ])
  ).rows[0].id;
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [
    otherBranch,
    assignmentLearner,
  ]);
  await get(`onboarding-assignments/${requestTask}/practice-requests`, supervisorCookie).expect(
    404,
  );
  assert.ok(
    !(await get('onboarding-assignments/practice-queue', supervisorCookie)).body.items.some(
      (t: any) => t.id === requestTask,
    ),
  );
  await db.query('UPDATE memberships SET branch_id=$1 WHERE id=$2', [
    branches[0],
    assignmentLearner,
  ]);
});
test('new observations answer requests explicitly while replay cannot consume a later request', async () => {
  requestGrade = {
    step_position: 1,
    answers: practiceAnswers(false),
    comment: 'Observasi awal menemukan item kritis perlu latihan',
    training_instructions: 'Ulangi pemeriksaan area kerja yang aman',
    idempotency_key: randomUUID(),
  };
  const first = (
    await post(`onboarding-assignments/${requestTask}/assessments`, supervisorCookie)
      .send(requestGrade)
      .expect(201)
  ).body;
  assert.equal(first.request_id, pendingRequest);
  let history = (
    await get(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
  ).body.items;
  assert.equal(history[0].status, 'answered');
  assert.equal(history[0].answer_assessment_id, first.id);
  assert.equal('input_hash' in history[0], false);
  assert.ok(
    !(await get('onboarding-assignments/practice-queue', supervisorCookie)).body.items.some(
      (t: any) => t.id === requestTask,
    ),
  );
  const review = {
    step_position: 1,
    kind: 'review',
    reason: 'Saya meminta peninjauan setelah mengulang latihan',
    based_on: first.id,
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...review, based_on: null })
    .expect(409);
  const reviewResult = (
    await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
      .send(review)
      .expect(201)
  ).body;
  await post(`onboarding-assignments/${requestTask}/assessments`, supervisorCookie)
    .send(requestGrade)
    .expect(201);
  history = (await get(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie))
    .body.items;
  assert.equal(history.find((r: any) => r.id === reviewResult.id).status, 'pending');
  const corrected = {
    ...requestGrade,
    answers: practiceAnswers(true),
    training_instructions: '',
    supersedes: first.id,
    correction_reason: 'Peninjauan hasil setelah observasi praktik ulang',
    idempotency_key: randomUUID(),
  };
  const answer = (
    await post(`onboarding-assignments/${requestTask}/assessments`, supervisorCookie)
      .send(corrected)
      .expect(201)
  ).body;
  assert.equal(answer.request_id, reviewResult.id);
  assert.equal(answer.outcome, 'competent');
  assert.deepEqual(
    (
      await post(`onboarding-assignments/${requestTask}/assessments`, supervisorCookie)
        .send(corrected)
        .expect(201)
    ).body,
    answer,
  );
  const task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === requestTask,
  );
  assert.equal(task.status, 'completed');
  assert.equal(task.progress.steps[0].practice_request.status, 'answered');
});
test('pending reviews preserve competence and cancellation preserves immutable request history', async () => {
  const task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === requestTask,
  );
  const payload = {
    step_position: 1,
    kind: 'review',
    reason: 'Mohon penjelasan dan peninjauan hasil kompetensi',
    based_on: task.progress.steps[0].latest_assessment_id,
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...payload, kind: 'practice' })
    .expect(409);
  const payloads = [payload, { ...payload, idempotency_key: randomUUID() }];
  const results = await Promise.all(
    payloads.map((input) =>
      post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie).send(input),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const winner = results.findIndex((r) => r.status === 201),
    id = results[winner].body.id;
  const pending = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === requestTask,
  );
  assert.equal(pending.status, 'completed');
  assert.equal(pending.progress.steps[0].practice_status, 'competent');
  assert.equal(pending.progress.steps[0].practice_request.status, 'pending');
  await assert.rejects(
    db.query("UPDATE practice_requests SET reason='Changed reason' WHERE id=$1", [id]),
  );
  await assert.rejects(db.query('DELETE FROM practice_requests WHERE id=$1', [id]));
  await post(`onboarding-assignments/${requestTask}/cancel`, cookies[0])
    .send({ reason: 'Penghentian tugas dengan histori tetap disimpan' })
    .expect(201);
  const history = (
    await get(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
  ).body.items;
  assert.equal(history.find((r: any) => r.id === id).status, 'cancelled');
  assert.equal(history.length, 3);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send(payloads[winner])
    .expect(201);
  await post(`onboarding-assignments/${requestTask}/practice-requests`, learnerCookie)
    .send({ ...payload, idempotency_key: randomUUID() })
    .expect(409);
  assert.ok(
    !(await get('onboarding-assignments/practice-queue', supervisorCookie)).body.items.some(
      (t: any) => t.id === requestTask,
    ),
  );
  assert.ok(
    (await get('audit-events', cookies[0])).body.some(
      (e: any) => e.action === 'practice_request.submitted',
    ),
  );
});
test('practice requests reject future starts, absent rubrics and unmet practical prerequisites', async () => {
  const future = (
    await db.query(
      "SELECT id FROM onboarding_assignments WHERE tenant_id=$1 AND membership_id=$2 AND start_date='2099-01-01' LIMIT 1",
      [tenants[0], assignmentLearner],
    )
  ).rows[0].id;
  const payload = {
    step_position: 1,
    kind: 'practice',
    reason: 'Saya siap melakukan observasi praktik',
    idempotency_key: randomUUID(),
  };
  await post(`onboarding-assignments/${future}/practice-requests`, learnerCookie)
    .send(payload)
    .expect(409);
  const legacy = (
    await db.query(
      "SELECT id FROM onboarding_assignments WHERE tenant_id=$1 AND membership_id=$2 AND status='assigned' AND snapshot->'steps'->0->'practice_rubric' IS NULL LIMIT 1",
      [tenants[0], assignmentLearner],
    )
  ).rows[0].id;
  await post(`onboarding-assignments/${legacy}/practice-requests`, learnerCookie)
    .send(payload)
    .expect(409);
  const sequential = (
    await db.query(
      "SELECT id FROM onboarding_assignments WHERE tenant_id=$1 AND membership_id=$2 AND snapshot->>'title'='Praktik berurutan' LIMIT 1",
      [tenants[0], assignmentLearner],
    )
  ).rows[0].id;
  const detail = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === sequential,
  );
  await post(`onboarding-assignments/${sequential}/practice-requests`, learnerCookie)
    .send({
      ...payload,
      kind: 'review',
      step_position: 2,
      based_on: detail.progress.steps[1].latest_assessment_id,
    })
    .expect(409);
});

let gatedTask = '',
  gatedRubric = '',
  gatedVersions: string[] = [],
  gatedRootAssessment = '',
  gatedLeafAttempt: any;
async function createGatedAssignment(steps: any[], start = '2020-01-01') {
  const path = (
    await post('onboarding-paths', cookies[0])
      .send({ title: 'Akses bertahap', description: 'Prasyarat teori dan praktik', steps })
      .expect(201)
  ).body.id;
  await post(`onboarding-paths/${path}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const batch = (
    await post('onboarding-assignments/preview', cookies[0])
      .send({ ...assignmentPayload(), path_version_id: path, start_date: start })
      .expect(201)
  ).body.id;
  return (
    await post(`onboarding-assignments/batches/${batch}/commit`, cookies[0])
      .send({ confirm: true })
      .expect(201)
  ).body.assignment_ids[0];
}
test('learning access enforces full prerequisite chains on direct reads and submissions', async () => {
  gatedRubric = (await post('practice-rubrics', cookies[0]).send(rubricContent)).body.id;
  await post(`practice-rubrics/${gatedRubric}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  for (let i = 0; i < 3; i++) {
    const id = (
      await post('learning', cookies[0]).send({ ...learningContent, title: 'Tahap akses ' + i })
    ).body.id;
    gatedVersions.push(id);
    await post(`learning/${id}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  }
  gatedTask = await createGatedAssignment(
    gatedVersions.map((id, i) => ({
      version_id: id,
      rubric_version_id: gatedRubric,
      due_days: i,
      prerequisite: i === 0 ? null : i,
    })),
  );
  await get('learning/' + gatedVersions[0], learnerCookie).expect(200);
  for (const id of gatedVersions.slice(1)) {
    await get('learning/' + id, learnerCookie).expect(403);
    await get(`learning/${id}?assignment_id=${gatedTask}`, learnerCookie).expect(403);
    await post(`learning/${id}/attempts`, learnerCookie)
      .send({ idempotency_key: randomUUID(), answers: [0] })
      .expect(403);
  }
  await get('learning/' + gatedVersions[2], cookies[0]).expect(200);
  await get('learning/' + gatedVersions[2], cookies[1]).expect(404);
  const list = (await get('learning', learnerCookie)).body.items;
  assert.equal(list.find((r: any) => r.id === gatedVersions[2]).learning_available, false);
  assert.ok(list.find((r: any) => r.id === gatedVersions[2]).learning_locked_reason);
  await post(`learning/${gatedVersions[0]}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), assignment_id: gatedTask, answers: [0] })
    .expect(201);
  const assessment = {
    step_position: 1,
    answers: practiceAnswers(true),
    comment: 'Observasi praktik tahap pertama sesuai rubrik',
    idempotency_key: randomUUID(),
  };
  gatedRootAssessment = (
    await post(`onboarding-assignments/${gatedTask}/assessments`, supervisorCookie)
      .send(assessment)
      .expect(201)
  ).body.id;
  await get(`learning/${gatedVersions[1]}?assignment_id=${gatedTask}`, learnerCookie).expect(200);
  await post(`learning/${gatedVersions[1]}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), assignment_id: gatedTask, answers: [0] })
    .expect(201);
  await post(`onboarding-assignments/${gatedTask}/assessments`, supervisorCookie)
    .send({ ...assessment, step_position: 2, idempotency_key: randomUUID() })
    .expect(201);
  gatedLeafAttempt = { idempotency_key: randomUUID(), assignment_id: gatedTask, answers: [0] };
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send(gatedLeafAttempt)
    .expect(201);
  const stored = (
    await db.query('SELECT assignment_id FROM learning_attempts WHERE idempotency_key=$1', [
      gatedLeafAttempt.idempotency_key,
    ])
  ).rows[0];
  assert.equal(stored.assignment_id, gatedTask);
  await post(`onboarding-assignments/${gatedTask}/assessments`, supervisorCookie)
    .send({
      ...assessment,
      answers: practiceAnswers(false),
      training_instructions: 'Ulangi pemeriksaan keamanan area kerja',
      supersedes: gatedRootAssessment,
      correction_reason: 'Temuan baru pada praktik langkah pertama',
      idempotency_key: randomUUID(),
    })
    .expect(201);
  // The direct parent stays competent, but an earlier ancestor now needs practice.
  await get(`learning/${gatedVersions[2]}?assignment_id=${gatedTask}`, learnerCookie).expect(403);
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send({ ...gatedLeafAttempt, idempotency_key: randomUUID() })
    .expect(403);
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send(gatedLeafAttempt)
    .expect(201);
  await post(`onboarding-assignments/${gatedTask}/assessments`, supervisorCookie)
    .send({ ...assessment, step_position: 3, idempotency_key: randomUUID() })
    .expect(409);
  await post(`onboarding-assignments/${gatedTask}/practice-requests`, learnerCookie)
    .send({
      step_position: 3,
      kind: 'practice',
      reason: 'Saya ingin menunjukkan praktik langkah lanjutan',
      idempotency_key: randomUUID(),
    })
    .expect(409);
  const task = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === gatedTask,
  );
  assert.equal(task.progress.steps[2].learning_available, false);
  assert.equal(task.progress.steps[2].practice_eligible, false);
  assert.equal(task.progress.steps[1].practice_status, 'competent');
  assert.equal(task.progress.steps[0].overdue, true);
  await get(`learning/${gatedVersions[0]}?assignment_id=${gatedTask}`, learnerCookie).expect(200);
});
test('shared module library access does not bypass a specifically locked assignment context', async () => {
  const alternative = await createGatedAssignment([
    { version_id: gatedVersions[2], rubric_version_id: gatedRubric, due_days: 0 },
  ]);
  await get('learning/' + gatedVersions[2], learnerCookie).expect(200);
  await get(`learning/${gatedVersions[2]}?assignment_id=${alternative}`, learnerCookie).expect(200);
  await get(`learning/${gatedVersions[2]}?assignment_id=${gatedTask}`, learnerCookie).expect(403);
  await get(`learning/${gatedVersions[2]}?assignment_id=${randomUUID()}`, learnerCookie).expect(
    404,
  );
  await get(`learning/${gatedVersions[0]}?assignment_id=${alternative}`, learnerCookie).expect(404);
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send({ ...gatedLeafAttempt, assignment_id: alternative })
    .expect(409);
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), assignment_id: alternative, answers: [0] })
    .expect(201);
  await post(`learning/${gatedVersions[2]}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), assignment_id: gatedTask, answers: [0] })
    .expect(403);
  await post(`learning/${gatedVersions[0]}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), assignment_id: randomUUID(), answers: [0] })
    .expect(404);
});
test('future assignment schedules lock library and contextual access while cancellation preserves free learning', async () => {
  const module = (
    await post('learning', cookies[0]).send({
      ...learningContent,
      title: 'Materi terjadwal mendatang',
    })
  ).body.id;
  await post(`learning/${module}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  await get('learning/' + module, learnerCookie).expect(200);
  const task = await createGatedAssignment(
    [{ version_id: module, rubric_version_id: gatedRubric, due_days: 0 }],
    '2099-01-01',
  );
  await get('learning/' + module, learnerCookie).expect(403);
  await get(`learning/${module}?assignment_id=${task}`, learnerCookie).expect(403);
  await post(`learning/${module}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(403);
  const row = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === task,
  );
  assert.equal(row.progress.steps[0].learning_available, false);
  assert.equal(row.progress.steps[0].practice_eligible, false);
  await post(`onboarding-assignments/${task}/cancel`, cookies[0])
    .send({ reason: 'Jadwal pelatihan dibatalkan untuk staf ini' })
    .expect(201);
  await get(`learning/${module}?assignment_id=${task}`, learnerCookie).expect(403);
  await get('learning/' + module, learnerCookie).expect(200);
  await post(`learning/${module}/attempts`, learnerCookie)
    .send({ idempotency_key: randomUUID(), answers: [0] })
    .expect(201);
  const cancelled = (await get('onboarding-assignments', learnerCookie)).body.items.find(
    (t: any) => t.id === task,
  );
  assert.equal(cancelled.progress.theory_passed, 0);
});

let sopTemplateId = '',
  sopNightId = '';
const sopPayload = () => ({
  title: 'Pembukaan area kerja',
  instructions: 'Periksa kondisi awal sebelum melayani pelanggan.',
  branch_ids: [branches[0]],
  job_ids: [jobs[0]],
  shift_label: 'Pagi',
  start_time: '08:00',
  due_time: '17:00',
  due_next_day: false,
  auto_accept: false,
  items: [
    {
      kind: 'boolean',
      label: 'Area kerja aman?',
      required: true,
      critical: true,
      issue_required: true,
      expected: true,
    },
    {
      kind: 'number',
      label: 'Suhu penyimpanan',
      required: true,
      critical: false,
      issue_required: true,
      unit: '°C',
      min: 0,
      max: 5,
    },
    {
      kind: 'text',
      label: 'Catatan tambahan',
      required: false,
      critical: false,
      issue_required: false,
      max_length: 500,
    },
  ],
});
test('SOP templates validate typed items, critical review policy and tenant targets', async () => {
  await post('sop-templates', learnerCookie).send(sopPayload()).expect(403);
  await get('sop-templates', supervisorCookie).expect(403);
  await post('sop-templates', cookies[0])
    .send({ ...sopPayload(), tenant_id: tenants[1] })
    .expect(422);
  await post('sop-templates', cookies[0])
    .send({ ...sopPayload(), branch_ids: [branches[1]] })
    .expect(409);
  await post('sop-templates', cookies[0])
    .send({ ...sopPayload(), job_ids: [jobs[1]] })
    .expect(409);
  await post('sop-templates', cookies[0])
    .send({ ...sopPayload(), branch_ids: [branches[0], branches[0].toUpperCase()] })
    .expect(422);
  await post('sop-templates', cookies[0])
    .send({ ...sopPayload(), auto_accept: true })
    .expect(422);
  for (const items of [
    [],
    [{ kind: 'photo', label: 'Foto area', required: true }],
    [{ kind: 'boolean', label: 'Kritis opsional', required: false, critical: true }],
    [{ kind: 'text', label: 'Semua opsional', required: false }],
    [{ kind: 'number', label: 'Tanpa rentang', unit: '°C', min: null, max: null }],
    [{ kind: 'number', label: 'Rentang terbalik', unit: '°C', min: 5, max: 1 }],
    [{ kind: 'number', label: 'Terlalu besar', unit: 'unit', min: 1000000001 }],
    [{ kind: 'text', label: 'Kendala teks', issue_required: true }],
    [{ kind: 'text', label: 'Teks kosong', max_length: 0 }],
  ]) {
    await post('sop-templates', cookies[0])
      .send({ ...sopPayload(), items })
      .expect(422);
  }
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM sop_templates')).rows[0].n), 0);
  sopTemplateId = (await post('sop-templates', cookies[0]).send(sopPayload()).expect(201)).body.id;
  const detail = (await get('sop-templates/' + sopTemplateId, cookies[0]).expect(200)).body;
  assert.equal(detail.status, 'draft');
  assert.equal(detail.version, 1);
  assert.equal(detail.checksum.length, 64);
  assert.equal(detail.content.items[0].position, 1);
  assert.equal(detail.content.items[1].unit, '°C');
  assert.equal(detail.content.items[2].kind, 'text');
  assert.equal(detail.content.targets.branches[0].timezone, 'Asia/Jakarta');
  await get('sop-templates/' + sopTemplateId, cookies[1]).expect(404);
  await get('sop-templates/' + sopTemplateId, learnerCookie).expect(403);
  await post(`sop-templates/${sopTemplateId}/publish`, cookies[1])
    .send({ confirm: true })
    .expect(409);
});
test('SOP shift defaults support crossing midnight and reject invalid daily windows', async () => {
  for (const window of [
    { start_time: '24:00', due_time: '06:00', due_next_day: true },
    { start_time: '08:00', due_time: '08:00', due_next_day: false },
    { start_time: '22:00', due_time: '06:00', due_next_day: false },
    { start_time: '08:00', due_time: '09:00', due_next_day: true },
  ])
    await post('sop-templates', cookies[0])
      .send({ ...sopPayload(), ...window })
      .expect(422);
  sopNightId = (
    await post('sop-templates', cookies[0])
      .send({
        ...sopPayload(),
        title: 'Serah terima malam',
        shift_label: 'Malam',
        start_time: '22:00',
        due_time: '06:00',
        due_next_day: true,
      })
      .expect(201)
  ).body.id;
  await post(`sop-templates/${sopNightId}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const night = (await get('sop-templates/' + sopNightId, cookies[0])).body;
  assert.equal(night.content.due_next_day, true);
  assert.equal(night.content.start_time, '22:00');
  assert.equal(night.content.due_time, '06:00');
  const lowRisk = (
    await post('sop-templates', cookies[0])
      .send({
        ...sopPayload(),
        auto_accept: true,
        items: [
          {
            kind: 'boolean',
            label: 'Alat tulis tersedia?',
            required: true,
            critical: false,
            expected: true,
          },
        ],
      })
      .expect(201)
  ).body.id;
  await post(`sop-templates/${lowRisk}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  assert.equal((await get('sop-templates/' + lowRisk, cookies[0])).body.content.auto_accept, true);
});
test('published SOP versions and target references are immutable while revisions get new versions', async () => {
  await post(`sop-templates/${sopTemplateId}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  await assert.rejects(
    db.query('UPDATE sop_templates SET content=$1 WHERE id=$2', [
      JSON.stringify({ title: 'tampered' }),
      sopTemplateId,
    ]),
  );
  await assert.rejects(db.query('DELETE FROM sop_templates WHERE id=$1', [sopTemplateId]));
  await assert.rejects(
    db.query('DELETE FROM sop_template_branches WHERE template_version_id=$1', [sopTemplateId]),
  );
  await assert.rejects(
    db.query('DELETE FROM sop_template_jobs WHERE template_version_id=$1', [sopTemplateId]),
  );
  const revisions = await Promise.all(
    [1, 2].map((i) =>
      post(`sop-templates/${sopTemplateId}/revise`, cookies[0]).send({
        ...sopPayload(),
        title: 'Revisi SOP ' + i,
      }),
    ),
  );
  assert.ok(revisions.every((r) => r.status === 201));
  assert.deepEqual(revisions.map((r) => r.body.version).sort(), [2, 3]);
  const original = (await get('sop-templates/' + sopTemplateId, cookies[0])).body;
  assert.equal(original.content.title, 'Pembukaan area kerja');
  assert.equal(original.content.items[0].critical, true);
  const next = (await get('sop-templates/' + revisions[0].body.id, cookies[0])).body;
  assert.equal(next.status, 'draft');
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) AS n FROM sop_template_branches WHERE template_version_id=$1',
          [next.id],
        )
      ).rows[0].n,
    ),
    1,
  );
  await post(`sop-templates/${next.id}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  await post(`sop-templates/${sopTemplateId}/archive`, cookies[0])
    .send({ confirm: true })
    .expect(201);
  assert.equal((await get('sop-templates/' + sopTemplateId, cookies[0])).body.status, 'archived');
  await post(`sop-templates/${sopTemplateId}/publish`, cookies[0])
    .send({ confirm: true })
    .expect(409);
  assert.ok(
    (await get('audit-events', cookies[0])).body.some(
      (e: any) => e.action === 'sop_template.published',
    ),
  );
});

test('SOP schedules validate recipients and generate immutable overnight instances idempotently', async () => {
  const payload = {
    template_version_id: sopNightId,
    branch_id: branches[0],
    start_date: '2026-10-16',
    end_date: '2026-10-31',
    weekdays: [5],
    assignee_ids: [assignmentLearner],
  };
  await post('sop-schedules', learnerCookie).send(payload).expect(403);
  await post('sop-schedules', cookies[1]).send(payload).expect(409);
  await post('sop-schedules', cookies[0])
    .send({ ...payload, assignee_ids: [members[0]] })
    .expect(409);
  await post('sop-schedules', cookies[0])
    .send({ ...payload, start_date: '2026-02-30' })
    .expect(422);
  const schedule = (await post('sop-schedules', cookies[0]).send(payload).expect(201)).body;
  await post(`sop-schedules/${schedule.id}/generate`, cookies[1])
    .send({ local_date: '2026-10-16' })
    .expect(404);
  await post(`sop-schedules/${schedule.id}/generate`, cookies[0])
    .send({ local_date: '2026-10-17' })
    .expect(409);
  const generated = await Promise.all(
    [1, 2].map(() =>
      post(`sop-schedules/${schedule.id}/generate`, cookies[0]).send({ local_date: '2026-10-16' }),
    ),
  );
  assert.ok(generated.every((r) => r.status === 201));
  assert.deepEqual(generated[0].body, generated[1].body);
  assert.equal(generated[0].body.assigned_count, 1);
  const instance = (await get('sop-instances', learnerCookie)).body.find(
    (r: any) => r.id === generated[0].body.instance_ids[0],
  );
  assert.ok(instance);
  assert.equal(new Date(instance.starts_at).toISOString(), '2026-10-16T15:00:00.000Z');
  assert.equal(new Date(instance.due_at).toISOString(), '2026-10-16T23:00:00.000Z');
  assert.equal(instance.snapshot.template.id, sopNightId);
  assert.ok(!(await get('sop-instances', cookies[1])).body.some((r: any) => r.id === instance.id));
  assert.ok(
    (await get('sop-instances', supervisorCookie)).body.some((r: any) => r.id === instance.id),
  );
  await assert.rejects(
    db.query('UPDATE sop_instances SET snapshot=$1 WHERE id=$2', ['{}', instance.id]),
  );
  await assert.rejects(db.query('DELETE FROM sop_schedules WHERE id=$1', [schedule.id]));
  await post(`sop-templates/${sopNightId}/archive`, cookies[0]).send({ confirm: true }).expect(201);
  assert.equal(
    (
      await post(`sop-schedules/${schedule.id}/generate`, cookies[0])
        .send({ local_date: '2026-10-23' })
        .expect(201)
    ).body.assigned_count,
    1,
  );
});
test('SOP generation records unassigned and freezes each run when recipients become ineligible', async () => {
  const template = (
    await post('sop-templates', cookies[0])
      .send({ ...sopPayload(), title: 'Jadwal kosong' })
      .expect(201)
  ).body.id;
  await post(`sop-templates/${template}/publish`, cookies[0]).send({ confirm: true }).expect(201);
  const payload = {
    template_version_id: template,
    branch_id: branches[0],
    start_date: '2026-10-16',
    end_date: '2026-10-18',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    assignee_ids: [assignmentLearner],
  };
  const schedule = (await post('sop-schedules', cookies[0]).send(payload).expect(201)).body;
  await db.query('UPDATE memberships SET active=false WHERE id=$1', [assignmentLearner]);
  const result = (
    await post(`sop-schedules/${schedule.id}/generate`, cookies[0])
      .send({ local_date: '2026-10-16' })
      .expect(201)
  ).body;
  assert.equal(result.unassigned, true);
  assert.deepEqual(result.skipped_assignee_ids, [assignmentLearner]);
  await db.query('UPDATE memberships SET active=true WHERE id=$1', [assignmentLearner]);
  assert.deepEqual(
    (
      await post(`sop-schedules/${schedule.id}/generate`, cookies[0])
        .send({ local_date: '2026-10-16' })
        .expect(201)
    ).body,
    result,
  );
  const row = (await get('sop-instances', cookies[0])).body.find(
    (r: any) => r.id === result.instance_ids[0],
  );
  assert.equal(row.status, 'unassigned');
  assert.equal(row.assignee_id, null);
  assert.ok(!(await get('sop-instances', learnerCookie)).body.some((r: any) => r.id === row.id));
  const empty = (
    await post('sop-schedules', cookies[0])
      .send({ ...payload, assignee_ids: [] })
      .expect(201)
  ).body;
  assert.equal(
    (
      await post(`sop-schedules/${empty.id}/generate`, cookies[0])
        .send({ local_date: '2026-10-17' })
        .expect(201)
    ).body.unassigned,
    true,
  );
});
