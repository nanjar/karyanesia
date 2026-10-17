import { parseEnv } from 'node:util';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

export function validateEnvironment(env, requireProduction = false) {
  const errors = [];
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'production'].includes(mode))
    errors.push('NODE_ENV harus development atau production.');
  if (requireProduction && mode !== 'production')
    errors.push('Pemeriksaan produksi memerlukan NODE_ENV=production.');
  if (
    !/^[A-Za-z0-9._~-]{24,}$/.test(env.POSTGRES_PASSWORD || '') ||
    /change_me|password/i.test(env.POSTGRES_PASSWORD || '')
  )
    errors.push(
      'POSTGRES_PASSWORD harus acak, minimal 24 karakter URL-safe; gunakan openssl rand -hex 24.',
    );
  if (
    !/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY || '') ||
    /^(.)\1+$/.test(env.MFA_ENCRYPTION_KEY || '')
  )
    errors.push('MFA_ENCRYPTION_KEY harus 32 byte acak dalam hex; gunakan openssl rand -hex 32.');
  try {
    const origin = new URL(env.WEB_ORIGIN);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.WEB_ORIGIN)
      throw Error();
    if ((mode === 'production' || requireProduction) && origin.protocol !== 'https:')
      errors.push('WEB_ORIGIN produksi wajib HTTPS.');
  } catch {
    errors.push(
      'WEB_ORIGIN harus origin HTTP/HTTPS persis tanpa kredensial, path atau trailing slash.',
    );
  }
  if (!/^[0-3]$/.test(env.TRUST_PROXY_HOPS || '0'))
    errors.push('TRUST_PROXY_HOPS harus bilangan 0–3.');
  const ports = {};
  for (const [name, fallback] of [
    ['WEB_PORT', '3000'],
    ['API_PORT', '4000'],
    ['POSTGRES_PORT', '5432'],
  ]) {
    const value = env[name] ?? fallback;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
      errors.push(`${name} harus bilangan 1–65535.`);
    else ports[name] = Number(value);
  }
  if (new Set(Object.values(ports)).size !== Object.values(ports).length)
    errors.push('WEB_PORT, API_PORT dan POSTGRES_PORT tidak boleh sama.');
  return { errors, ports };
}

export function portAvailable(port) {
  return new Promise((resolveResult) => {
    const server = createServer();
    server.once('error', () => resolveResult(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
      server.close(() => resolveResult(true)),
    );
  });
}

export async function runPreflight(args, envFile = resolve('.env'), shellEnv = process.env) {
  if (args.some((arg) => !['--production', '--check-ports'].includes(arg)))
    return ['Penggunaan: node scripts/preflight.mjs [--production] [--check-ports]'];
  let fileEnv;
  try {
    const stat = statSync(envFile);
    if (!stat.isFile()) return ['.env harus berkas konfigurasi biasa.'];
    if ((stat.mode & 0o077) !== 0) return ['Izin .env terlalu terbuka; jalankan chmod 600 .env.'];
    fileEnv = parseEnv(readFileSync(envFile, 'utf8'));
  } catch {
    return ['.env tidak dapat dibaca; salin .env.example dan isi konfigurasi secara privat.'];
  }
  const env = { ...fileEnv, ...shellEnv };
  const { errors, ports } = validateEnvironment(env, args.includes('--production'));
  // Keep configuration interpretation explicit; Compose interpolation is not evaluated here.
  if (
    Object.entries(env).some(
      ([name, value]) =>
        [
          'POSTGRES_PASSWORD',
          'MFA_ENCRYPTION_KEY',
          'WEB_ORIGIN',
          'NODE_ENV',
          'TRUST_PROXY_HOPS',
          ...Object.keys(ports),
        ].includes(name) &&
        typeof value === 'string' &&
        value.includes('$'),
    )
  )
    errors.push(
      'Gunakan nilai literal pada konfigurasi yang diperiksa; interpolasi Compose tidak dievaluasi preflight.',
    );
  if (!errors.length && args.includes('--check-ports')) {
    for (const [name, port] of Object.entries(ports))
      if (!(await portAvailable(port)))
        errors.push(
          `${name} tidak dapat digunakan pada loopback; periksa port atau pilih port lain.`,
        );
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = await runPreflight(process.argv.slice(2));
  if (errors.length) {
    for (const error of errors) console.error(`GAGAL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Preflight konfigurasi lulus. Tidak ada nilai secret ditampilkan.');
    console.log(
      'Tetap jalankan docker compose config --quiet. TLS, ClamAV, backup, alarm dan UAT perlu verifikasi terpisah.',
    );
  }
}
