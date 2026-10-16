import { randomUUID } from 'node:crypto';
import type { Executor } from './database';
import type { Actor } from './types';
export async function audit(
  db: Executor,
  actor: Actor,
  correlation: string,
  action: string,
  objectId: string,
  details: Record<string, unknown> = {},
) {
  await db.query(
    'INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id,correlation_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      randomUUID(),
      actor.tenant_id,
      actor.id,
      action,
      objectId,
      correlation,
      JSON.stringify(details),
    ],
  );
}
