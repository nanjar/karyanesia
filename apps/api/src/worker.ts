import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { readConfig } from './config';
import { SopSchedulesController } from './sop-schedules';
import { materializeNotifications } from './notifications';
import { ApiRequest } from './types';
export async function workerTick(db: Database) {
  const schedules = (
    await db.query(
      `SELECT s.id,s.tenant_id,to_char(d.day,'YYYY-MM-DD') local_date FROM sop_schedules s JOIN tenants t ON t.id=s.tenant_id AND t.active CROSS JOIN LATERAL generate_series((s.content->>'start_date')::date, LEAST((s.content->>'end_date')::date,(now() AT TIME ZONE (s.content->>'timezone'))::date),interval '1 day')d(day) WHERE NOT EXISTS(SELECT 1 FROM schedule_stops x WHERE x.tenant_id=s.tenant_id AND x.schedule_id=s.id) AND (s.content->'weekdays') @> to_jsonb(extract(isodow FROM d.day)::integer) AND NOT EXISTS(SELECT 1 FROM sop_schedule_runs r WHERE r.tenant_id=s.tenant_id AND r.schedule_id=s.id AND r.local_date=d.day::date) AND NOT EXISTS(SELECT 1 FROM worker_jobs j WHERE j.tenant_id=s.tenant_id AND j.schedule_id=s.id AND j.local_date=d.day::date) ORDER BY d.day,s.id LIMIT 100`,
    )
  ).rows;
  for (const s of schedules)
    await db.query(
      'INSERT INTO worker_jobs(id,tenant_id,schedule_id,local_date) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [randomUUID(), s.tenant_id, s.id, s.local_date],
    );
  const jobs = (
    await db.query(
      "UPDATE worker_jobs SET next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE id IN (SELECT id FROM worker_jobs WHERE status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING *",
    )
  ).rows;
  for (const job of jobs) {
    try {
      const stopped = (
        await db.query('SELECT 1 FROM schedule_stops WHERE tenant_id=$1 AND schedule_id=$2', [
          job.tenant_id,
          job.schedule_id,
        ])
      ).rows.length;
      if (!stopped) {
        const a = (
          await db.query(
            "SELECT m.*,u.full_name,t.name tenant_name FROM memberships m JOIN users u ON u.id=m.user_id AND u.active JOIN tenants t ON t.id=m.tenant_id AND t.active WHERE m.tenant_id=$1 AND m.active AND m.role IN ('OWNER','ADMIN') ORDER BY m.id LIMIT 1",
            [job.tenant_id],
          )
        ).rows[0];
        if (!a) throw Error('No active administrator');
        await new SopSchedulesController(db).generate(
          job.schedule_id,
          {
            local_date:
              typeof job.local_date === 'string'
                ? job.local_date.slice(0, 10)
                : job.local_date.toISOString().slice(0, 10),
          },
          {
            actor: { ...a, scopes: [] },
            correlationId: job.id,
            executionSource: 'worker',
          } as ApiRequest,
        );
      }
      await db.query("UPDATE worker_jobs SET status='done',updated_at=now() WHERE id=$1", [job.id]);
    } catch {
      await db.query(
        "UPDATE worker_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+(power(2,attempts)*interval '1 minute'),updated_at=now() WHERE id=$1",
        [job.id],
      );
      console.error(
        JSON.stringify({ event: 'worker.job_failed', job_id: job.id, tenant_id: job.tenant_id }),
      );
    }
  }
  const stream = (
    await db.query(
      "UPDATE worker_streams SET next_attempt_at=now()+interval '5 minutes' WHERE name='notifications' AND NOT failed AND next_attempt_at<=now() RETURNING name",
    )
  ).rows[0];
  if (stream) {
    try {
      await materializeNotifications(db);
      await db.query(
        "UPDATE worker_streams SET attempts=0,next_attempt_at=now()+interval '1 minute',updated_at=now() WHERE name='notifications'",
      );
    } catch {
      await db.query(
        "UPDATE worker_streams SET attempts=attempts+1,failed=attempts>=4,next_attempt_at=now()+power(2,attempts)*interval '1 minute',updated_at=now() WHERE name='notifications'",
      );
      console.error(JSON.stringify({ event: 'worker.notification_failed' }));
    }
  }

  await db.query(
    "INSERT INTO worker_heartbeats(name,last_success_at) VALUES('operations',now()) ON CONFLICT(name) DO UPDATE SET last_success_at=now()",
  );
}
async function main() {
  const db = new Database(readConfig());
  let stop = false;
  process.on('SIGTERM', () => {
    stop = true;
  });
  process.on('SIGINT', () => {
    stop = true;
  });
  try {
    do {
      try {
        await workerTick(db);
      } catch {
        console.error(JSON.stringify({ event: 'worker.tick_failed' }));
      }
      if (process.argv.includes('--once')) break;
      for (let i = 0; i < 60 && !stop; i++) await new Promise((r) => setTimeout(r, 1000));
    } while (!stop);
  } finally {
    await db.onModuleDestroy();
  }
}
if (require.main === module) void main();
