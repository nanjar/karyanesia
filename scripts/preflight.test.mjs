import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { validateEnvironment, runPreflight, portAvailable } from './preflight.mjs';

const valid = () => ({
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  WEB_ORIGIN: 'https://training.example.test',
  NODE_ENV: 'production',
});

test('production rejects missing or placeholder secrets and non-origin URLs without exposing values', () => {
  assert.deepEqual(validateEnvironment(valid(), true).errors, []);
  for (const patch of [
    { POSTGRES_PASSWORD: 'CHANGE_ME' },
    { MFA_ENCRYPTION_KEY: '0'.repeat(64) },
    { WEB_ORIGIN: 'http://training.example.test' },
    { WEB_ORIGIN: 'https://training.example.test/' },
    { WEB_ORIGIN: 'https://user:private@training.example.test' },
    { NODE_ENV: 'development' },
    { TRUST_PROXY_HOPS: '4' },
    { WEB_PORT: '0' },
    { API_PORT: '65536' },
    { WEB_PORT: '4000' },
  ]) {
    const env = { ...valid(), ...patch };
    const errors = validateEnvironment(env, true).errors;
    assert.ok(errors.length > 0);
    assert.ok(!errors.join().includes(env.POSTGRES_PASSWORD));
    assert.ok(!errors.join().includes(env.MFA_ENCRYPTION_KEY));
    assert.ok(!errors.join().includes(env.WEB_ORIGIN));
  }
});

test('private env files are read as data, shell overrides apply and public file modes fail', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'karyanesia-preflight-'));
  const file = join(folder, '.env');
  try {
    const env = valid();
    await writeFile(
      file,
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
      { mode: 0o600 },
    );
    assert.deepEqual(await runPreflight(['--production'], file, {}), []);
    assert.ok((await runPreflight(['--production'], file, { NODE_ENV: 'development' })).length > 0);
    await chmod(file, 0o644);
    assert.match((await runPreflight([], file, {})).join(), /chmod 600/);
    assert.match((await runPreflight(['--unknown'], file, {})).join(), /Penggunaan/);
    assert.match(
      (await runPreflight([], join(folder, 'missing'), {})).join(),
      /tidak dapat dibaca/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('port checks detect an existing service without stopping it', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    assert.equal(await portAvailable(port), false);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await portAvailable(port), true);
});

test('Compose interpolation is rejected rather than silently interpreted differently', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'karyanesia-preflight-'));
  const file = join(folder, '.env');
  try {
    await writeFile(file, 'WEB_ORIGIN=https://${DOMAIN}\n', { mode: 0o600 });
    const errors = await runPreflight([], file, { ...valid(), WEB_ORIGIN: 'https://${DOMAIN}' });
    assert.match(errors.join(), /interpolasi Compose/);
    assert.ok(!errors.join().includes('${DOMAIN}'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
