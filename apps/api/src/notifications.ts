import { cursor, beforeCursor } from './pagination';
import {
  Body,
  Controller,
  Get,
  Query,
  Post,
  Req,
  Param,
  Inject,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database, Executor } from './database';
import { ApiRequest } from './types';
import { SessionGuard } from './security';
import { randomUUID } from 'node:crypto';
import { assignmentProgress } from './onboarding-progress';
export async function notify(
  db: Executor,
  tenant: string,
  member: string,
  key: string,
  title: string,
  target: string,
) {
  await db.query(
    'INSERT INTO notifications(id,tenant_id,membership_id,dedupe_key,title,target) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,membership_id,dedupe_key) DO NOTHING',
    [randomUUID(), tenant, member, key, title, target],
  );
}
export async function materializeNotifications(db: Executor) {
  // Durable source records act as the outbox. Unique delivery keys make scans/retries safe.
  const tasks = (
    await db.query(
      `SELECT i.*,COALESCE(e.state->>'status',i.status) current_status FROM sop_instances i LEFT JOIN LATERAL(SELECT state FROM sop_events WHERE tenant_id=i.tenant_id AND instance_id=i.id ORDER BY revision DESC LIMIT 1)e ON true WHERE i.created_at>now()-interval '30 days'`,
    )
  ).rows;
  for (const t of tasks) {
    if (t.assignee_id) {
      await notify(
        db,
        t.tenant_id,
        t.assignee_id,
        'sop-new:' + t.id,
        'Tugas SOP tersedia',
        'operations',
      );
      if (!['accepted', 'excused', 'cancelled'].includes(t.current_status)) {
        if (new Date(t.due_at).getTime() < Date.now())
          await notify(
            db,
            t.tenant_id,
            t.assignee_id,
            'sop-late:' + t.id,
            'Tugas melewati tenggat',
            'operations',
          );
        else if (new Date(t.due_at).getTime() - Date.now() <= 86400000)
          await notify(
            db,
            t.tenant_id,
            t.assignee_id,
            'sop-due:' + t.id,
            'Tenggat tugas mendekat',
            'operations',
          );
      }
    } else {
      const reviewers = (
        await db.query(
          "SELECT m.id FROM memberships m WHERE m.tenant_id=$1 AND m.active AND (m.role IN ('OWNER','ADMIN') OR (m.role IN ('SUPERVISOR','OPERATIONS') AND EXISTS(SELECT 1 FROM branch_grants g WHERE g.tenant_id=$1 AND g.membership_id=m.id AND g.branch_id=$2)))",
          [t.tenant_id, t.branch_id],
        )
      ).rows;
      for (const r of reviewers)
        await notify(
          db,
          t.tenant_id,
          r.id,
          'sop-unassigned:' + t.id,
          'Tugas memerlukan penerima',
          'operations',
        );
    }
  }
  const results = (
    await db.query(
      `SELECT tenant_id,membership_id,id,'Hasil kuis tersedia' title,'learning' target FROM learning_attempts UNION ALL SELECT tenant_id,membership_id,id,'Hasil praktik tersedia','assignments' FROM practice_assessments`,
    )
  ).rows;
  for (const r of results)
    await notify(db, r.tenant_id, r.membership_id, 'result:' + r.id, r.title, r.target);
  const assignments = (
    await db.query("SELECT * FROM onboarding_assignments WHERE status<>'cancelled'")
  ).rows;
  for (const t of assignments) {
    await notify(
      db,
      t.tenant_id,
      t.membership_id,
      'assignment:' + t.id,
      'Tugas onboarding tersedia',
      'assignments',
    );
    const progress = (await assignmentProgress(db, t.tenant_id, [t]))[0];
    if (progress.status === 'completed') continue;
    const pending = progress.progress.steps.filter(
      (s: any) => s.theory_status !== 'passed' || s.practice_status !== 'competent',
    );
    const due_at = t.snapshot.steps
      .filter((s: any) => pending.some((p: any) => p.position === s.position))
      .map((s: any) => s.due_at)
      .sort()[0];
    if (new Date(due_at).getTime() < Date.now())
      await notify(
        db,
        t.tenant_id,
        t.membership_id,
        'assignment-late:' + t.id,
        'Periksa tugas jatuh tempo',
        'assignments',
      );
    else if (new Date(due_at).getTime() - Date.now() <= 86400000)
      await notify(
        db,
        t.tenant_id,
        t.membership_id,
        'assignment-due:' + t.id,
        'Tenggat tugas mendekat',
        'assignments',
      );
  }
  const changes = (
    await db.query(
      "SELECT e.id,e.tenant_id,i.assignee_id FROM sop_events e JOIN sop_instances i ON i.tenant_id=e.tenant_id AND i.id=e.instance_id WHERE e.state->>'status'='changes_requested' AND i.assignee_id IS NOT NULL",
    )
  ).rows;
  for (const r of changes)
    await notify(
      db,
      r.tenant_id,
      r.assignee_id,
      'changes:' + r.id,
      'Tugas memerlukan perbaikan',
      'operations',
    );
  const issues = (
    await db.query("SELECT id,tenant_id,branch_id FROM issues WHERE content->>'priority'='high'")
  ).rows;
  for (const i of issues) {
    const supervisors = (
      await db.query(
        "SELECT id FROM memberships m WHERE m.tenant_id=$1 AND m.active AND (m.role IN ('OWNER','ADMIN') OR (m.role IN ('SUPERVISOR','OPERATIONS') AND EXISTS(SELECT 1 FROM branch_grants g WHERE g.tenant_id=$1 AND g.membership_id=m.id AND g.branch_id=$2)))",
        [i.tenant_id, i.branch_id],
      )
    ).rows;
    for (const s of supervisors)
      await notify(
        db,
        i.tenant_id,
        s.id,
        'priority:' + i.id,
        'Kendala memerlukan perhatian',
        'operations',
      );
  }
}
@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    return (
      await this.db.query(
        `SELECT id,title,target,created_at,read_at FROM notifications WHERE tenant_id=$1 AND membership_id=$2 ${beforeCursor('notifications', 3)} ORDER BY created_at DESC,id DESC LIMIT 100`,
        [req.actor.tenant_id, req.actor.id, cursor(after) || null],
      )
    ).rows;
  }
  @Post(':id/read') async read(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const row = (
      await this.db.query(
        'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND membership_id=$2 AND id=$3 RETURNING id',
        [req.actor.tenant_id, req.actor.id, z.uuid().parse(raw)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }
}
