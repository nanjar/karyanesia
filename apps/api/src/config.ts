import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Use 32 random bytes encoded as hex'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});
export type Config = z.infer<typeof schema>;
export function readConfig(): Config {
  const cfg = schema.parse(process.env);
  if (cfg.NODE_ENV === 'production' && new URL(cfg.WEB_ORIGIN).protocol !== 'https:')
    throw Error('Production requires HTTPS WEB_ORIGIN');
  if (new URL(cfg.WEB_ORIGIN).origin !== cfg.WEB_ORIGIN)
    throw Error('WEB_ORIGIN must be an origin without path or trailing slash');
  return cfg;
}
export const CONFIG = Symbol('CONFIG');
