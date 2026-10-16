import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { readConfig } from './config';
import { encryptSecret, hashPassword, newMfaSecret } from './crypto';
async function main() {
  const cfg = readConfig();
  const input = z
    .object({
      BOOTSTRAP_TENANT_CODE: z.string().regex(/^[a-z0-9-]{2,64}$/),
      BOOTSTRAP_TENANT_NAME: z.string().min(1).max(120),
      BOOTSTRAP_EMPLOYEE_NUMBER: z.string().min(1).max(64),
      BOOTSTRAP_FULL_NAME: z.string().min(1).max(120),
      BOOTSTRAP_PASSWORD: z.string().min(12).max(128),
    })
    .parse(process.env);
  const db = new Database(cfg),
    tenant = randomUUID(),
    user = randomUUID(),
    member = randomUUID(),
    secret = newMfaSecret(),
    hash = await hashPassword(input.BOOTSTRAP_PASSWORD);
  try {
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO tenants(id,code,name) VALUES($1,$2,$3)', [
        tenant,
        input.BOOTSTRAP_TENANT_CODE,
        input.BOOTSTRAP_TENANT_NAME,
      ]);
      await tx.query(
        'INSERT INTO users(id,full_name,password_hash,mfa_secret) VALUES($1,$2,$3,$4)',
        [user, input.BOOTSTRAP_FULL_NAME, hash, encryptSecret(secret, cfg.MFA_ENCRYPTION_KEY)],
      );
      await tx.query(
        "INSERT INTO memberships(id,tenant_id,user_id,employee_number,role,assessor) VALUES($1,$2,$3,$4,'OWNER',true)",
        [member, tenant, user, input.BOOTSTRAP_EMPLOYEE_NUMBER],
      );
      await tx.query(
        "INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id,correlation_id) VALUES($1,$2,$3,'tenant.bootstrap',$2,$4)",
        [randomUUID(), tenant, member, randomUUID()],
      );
    });
    console.log(
      'Tenant created. Store the following authenticator enrollment secret securely. It is shown only once.',
    );
    console.log(
      `otpauth://totp/${encodeURIComponent('Karyanesia:' + input.BOOTSTRAP_TENANT_CODE + ':' + input.BOOTSTRAP_EMPLOYEE_NUMBER)}?secret=${secret}&issuer=Karyanesia&algorithm=SHA1&digits=6&period=30`,
    );
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch(() => {
  console.error(
    'Bootstrap failed. Check required bootstrap environment variables and ensure tenant code is new.',
  );
  process.exitCode = 1;
});
