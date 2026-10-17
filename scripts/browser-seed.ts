import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashPassword, newMfaSecret, encryptSecret, digest, token } from '../apps/api/src/crypto';
async function main() {
  if (process.env.CI !== 'true' || process.env.BROWSER_TEST_MODE !== 'synthetic-ci')
    throw Error('Browser seed is restricted to isolated synthetic CI databases.');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw Error('Only local CI database is allowed.');
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw Error('CI MFA key required.');
  const db = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await db.query('BEGIN');
    if (Number((await db.query('SELECT count(*) n FROM tenants')).rows[0].n) !== 0)
      throw Error('Browser seed refuses a database containing existing tenants.');
    const tenant = randomUUID(),
      branch = randomUUID(),
      job = randomUUID(),
      code = 'browser-' + randomBytes(6).toString('hex'),
      password = randomBytes(24).toString('hex'),
      hash = await hashPassword(password);
    await db.query("INSERT INTO tenants(id,code,name) VALUES($1,$2,'Perusahaan Uji Browser')", [
      tenant,
      code,
    ]);
    await db.query(
      "INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,'BROWSER','Cabang Uji Browser','Asia/Jakarta')",
      [branch, tenant],
    );
    await db.query(
      "INSERT INTO jobs(id,tenant_id,code,name) VALUES($1,$2,'BROWSER','Jabatan Uji Browser')",
      [job, tenant],
    );
    const projects: Record<string, unknown> = {};
    for (const name of ['chromium-desktop', 'chromium-mobile', 'webkit-mobile']) {
      const secret = newMfaSecret(),
        activation = token();
      const accounts = { admin: 'ADMIN-' + name, staff: 'STAFF-' + name, newStaff: 'NEW-' + name };
      for (const role of ['admin', 'staff', 'newStaff'] as const) {
        const uid = randomUUID(),
          member = randomUUID();
        await db.query(
          'INSERT INTO users(id,full_name,password_hash,mfa_secret) VALUES($1,$2,$3,$4)',
          [
            uid,
            role === 'admin' ? 'Admin Uji Browser' : 'Staf Uji Browser',
            role === 'newStaff' ? null : hash,
            role === 'admin' ? encryptSecret(secret, key) : null,
          ],
        );
        await db.query(
          'INSERT INTO memberships(id,tenant_id,user_id,employee_number,branch_id,job_id,role,assessor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            member,
            tenant,
            uid,
            accounts[role],
            branch,
            job,
            role === 'admin' ? 'OWNER' : 'STAFF',
            role === 'admin',
          ],
        );
        if (role === 'newStaff')
          await db.query(
            "INSERT INTO activation_tokens(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
            [digest(activation), tenant, member],
          );
      }
      projects[name] = { ...accounts, secret, activation };
    }
    const author = (
      await db.query("SELECT id FROM memberships WHERE tenant_id=$1 AND role='OWNER' LIMIT 1", [
        tenant,
      ])
    ).rows[0].id;
    const content = {
      title: 'Video Uji Browser',
      objective: 'Memeriksa fallback video',
      transcript: 'Transkrip uji tetap tersedia saat koneksi YouTube gagal.',
      video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      video_duration_seconds: 120,
      pass_score: 80,
      questions: [{ prompt: 'Transkrip tersedia?', options: ['Ya', 'Tidak'], correct: 0 }],
    };
    await db.query(
      "INSERT INTO learning_versions(id,tenant_id,module_id,version,status,content,checksum,author_id,published_at) VALUES($1,$2,$3,1,'published',$4,$5,$6,now())",
      [
        randomUUID(),
        tenant,
        randomUUID(),
        JSON.stringify(content),
        digest(JSON.stringify(content)),
        author,
      ],
    );
    await db.query('COMMIT');
    const folder = resolve('qa-artifacts');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(folder, 'browser-fixture.json'),
      JSON.stringify({ code, password, projects }),
      { mode: 0o600 },
    );
    console.log('Synthetic browser accounts prepared in isolated CI database.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error('Browser fixture initialization failed; verify isolated CI configuration.');
  process.exitCode = 1;
});
