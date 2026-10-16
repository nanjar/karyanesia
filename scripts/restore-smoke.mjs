import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const url = new URL(process.env.TEST_DATABASE_URL || '');
const container = process.env.POSTGRES_CONTAINER;
if (!container) throw Error('POSTGRES_CONTAINER required; isolated smoke databases only');
const suffix = randomUUID().replaceAll('-', ''),
  source = 'restore_source_' + suffix,
  target = 'restore_target_' + suffix;
const admin = new Pool({ connectionString: url.toString() });
let sourcePool, targetPool;
const started = Date.now();
try {
  await admin.query(`CREATE DATABASE ${source}`);
  await admin.query(`CREATE DATABASE ${target}`);
  const sourceUrl = new URL(url);
  sourceUrl.pathname = '/' + source;
  sourcePool = new Pool({ connectionString: sourceUrl.toString() });
  for (const file of (await readdir(new URL('../packages/database/migrations/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await sourcePool.query(
      await readFile(new URL('../packages/database/migrations/' + file, import.meta.url), 'utf8'),
    );
  const tenant = randomUUID(),
    other = randomUUID(),
    user = randomUUID(),
    member = randomUUID(),
    asset = randomUUID(),
    version = randomUUID();
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  await sourcePool.query(
    "INSERT INTO tenants(id,code,name) VALUES($1,'restore-a','Restore A'),($2,'restore-b','Restore B')",
    [tenant, other],
  );
  await sourcePool.query(
    "INSERT INTO users(id,full_name) VALUES($1,'Synthetic restore operator')",
    [user],
  );
  await sourcePool.query(
    "INSERT INTO memberships(id,tenant_id,user_id,employee_number,role) VALUES($1,$2,$3,'RESTORE','OWNER')",
    [member, tenant, user],
  );
  await sourcePool.query(
    "INSERT INTO learning_versions(id,tenant_id,module_id,version,status,content,checksum,author_id,published_at) VALUES($1,$2,$3,1,'published',$4,'restore-checksum',$5,now())",
    [version, tenant, randomUUID(), JSON.stringify({ title: 'Restore immutable fixture' }), member],
  );
  await sourcePool.query(
    "INSERT INTO media_assets(id,tenant_id,owner_id,purpose,mime,size,checksum,bytes) VALUES($1,$2,$3,'learning','image/png',$4,$5,$6)",
    [asset, tenant, member, bytes.length, createHash('sha256').update(bytes).digest('hex'), bytes],
  );
  const dump = execFileSync(
    'docker',
    [
      'exec',
      container,
      'pg_dump',
      '-U',
      url.username,
      '-d',
      source,
      '-Fc',
      '--no-owner',
      '--no-privileges',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'pg_restore',
      '-U',
      url.username,
      '-d',
      target,
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
    ],
    { input: dump, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const targetUrl = new URL(url);
  targetUrl.pathname = '/' + target;
  targetPool = new Pool({ connectionString: targetUrl.toString() });
  const restored = (
    await targetPool.query('SELECT bytes,checksum FROM media_assets WHERE tenant_id=$1 AND id=$2', [
      tenant,
      asset,
    ])
  ).rows[0];
  assert.deepEqual(restored.bytes, bytes);
  assert.equal(restored.checksum, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(
    (
      await targetPool.query('SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2', [
        other,
        asset,
      ])
    ).rowCount,
    0,
  );
  await assert.rejects(
    targetPool.query("UPDATE learning_versions SET content='{}' WHERE id=$1", [version]),
  );
  await assert.rejects(targetPool.query('DELETE FROM media_assets WHERE id=$1', [asset]));
  console.log(
    JSON.stringify({
      test: 'postgres16-logical-restore',
      result: 'passed',
      duration_ms: Date.now() - started,
      verified: [
        'schema',
        'private-image-bytes',
        'checksum',
        'tenant-predicate',
        'immutability-triggers',
      ],
    }),
  );
} finally {
  if (sourcePool) await sourcePool.end();
  if (targetPool) await targetPool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${source} WITH (FORCE)`);
  await admin.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
  await admin.end();
}
