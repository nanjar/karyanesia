import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  ConflictException,
  GoneException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database, Executor } from './database';
import { SessionGuard } from './security';
import { admins, ApiRequest } from './types';
import { audit } from './audit';
import { assignmentProgress } from './onboarding-progress';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= '2000-01-01' &&
      v <= '2100-12-31'
    );
  }, 'Tanggal mulai tidak valid.');
const previewSchema = z.strictObject({
  path_version_id: z.uuid(),
  start_date: date,
  target: z.strictObject({
    kind: z.enum(['staff', 'branch', 'job']),
    ids: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length, 'Target tidak boleh berulang.'),
  }),
});
function manage(req: ApiRequest) {
  if (!admins(req.actor)) throw new ForbiddenException('Hanya admin dapat menugaskan onboarding.');
}
async function targets(db: Executor, tenant: string, kind: string, ids: string[]) {
  const table = kind === 'staff' ? 'memberships' : kind === 'branch' ? 'branches' : 'jobs';
  if (
    (
      await db.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND id=ANY($2::uuid[])`, [
        tenant,
        ids,
      ])
    ).rows.length !== ids.length
  )
    throw new NotFoundException('Target tidak ditemukan dalam perusahaan.');
  const field = kind === 'staff' ? 'm.id' : kind === 'branch' ? 'm.branch_id' : 'm.job_id';
  const rows = (
    await db.query(
      `SELECT m.id,m.branch_id,m.job_id,u.full_name,m.employee_number,b.name AS branch_name,b.timezone FROM memberships m JOIN users u ON u.id=m.user_id JOIN branches b ON b.tenant_id=m.tenant_id AND b.id=m.branch_id WHERE m.tenant_id=$1 AND m.active AND u.active AND m.role='STAFF' AND ${field}=ANY($2::uuid[]) ORDER BY m.id LIMIT 501`,
      [tenant, ids],
    )
  ).rows;
  if (!rows.length || rows.length > 500)
    throw new ConflictException('Pilih target yang menghasilkan 1–500 staf aktif dengan cabang.');
  if (kind === 'staff' && rows.length !== ids.length)
    throw new ConflictException('Semua staf terpilih harus aktif dan memiliki cabang.');
  return rows;
}
async function available(db: Executor, tenant: string, id: string) {
  const row = (
    await db.query(
      "SELECT * FROM onboarding_paths WHERE tenant_id=$1 AND id=$2 AND status='published' FOR SHARE",
      [tenant, id],
    )
  ).rows[0];
  if (!row) throw new ConflictException('Versi jalur terbit tidak tersedia.');
  const ids = row.content.steps.map((s: any) => s.version_id).sort();
  const modules = (
    await db.query(
      "SELECT id FROM learning_versions WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status='published' ORDER BY id FOR SHARE",
      [tenant, ids],
    )
  ).rows;
  if (modules.length !== ids.length)
    throw new ConflictException(
      'Ada modul yang sudah tidak tersedia. Revisi jalur sebelum menugaskan.',
    );
  return { id: row.id, version: row.version, checksum: row.checksum, ...row.content };
}
@Controller('onboarding-assignments')
@UseGuards(SessionGuard)
export class OnboardingAssignmentsController {
  constructor(@Inject(Database) private db: Database) {}
  @Post('preview') async preview(@Req() req: ApiRequest, @Body() body: unknown) {
    manage(req);
    const input = previewSchema.parse(body);
    return this.db.transaction(async (db) => {
      const path = await available(db, req.actor.tenant_id, input.path_version_id),
        rows = await targets(db, req.actor.tenant_id, input.target.kind, input.target.ids),
        id = randomUUID();
      await db.query(
        'INSERT INTO onboarding_assignment_batches(id,tenant_id,path_version_id,created_by,start_date,targets,path_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          req.actor.tenant_id,
          input.path_version_id,
          req.actor.id,
          input.start_date,
          JSON.stringify({ selection: input.target, items: rows }),
          JSON.stringify(path),
        ],
      );
      await audit(db, req.actor, req.correlationId, 'onboarding_assignment.previewed', id, {
        count: rows.length,
      });
      return {
        id,
        start_date: input.start_date,
        path,
        items: rows,
        count: rows.length,
        expires_in_hours: 24,
      };
    });
  }
  @Post('batches/:id/commit') async commit(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw),
      a = req.actor;
    return this.db.transaction(async (db) => {
      const batch = (
        await db.query(
          'SELECT *,start_date::text AS start FROM onboarding_assignment_batches WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!batch) throw new NotFoundException('Pratinjau tidak ditemukan.');
      if (batch.result) return batch.result;
      if (new Date(batch.expires_at).getTime() <= Date.now())
        throw new GoneException('Pratinjau kedaluwarsa. Buat ulang pratinjau.');
      await available(db, a.tenant_id, batch.path_version_id);
      // Lock previewed memberships and branch settings in stable order; target expansion is never implicit.
      const ids = batch.targets.items.map((t: any) => t.id).sort();
      await db.query(
        'SELECT id FROM memberships WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
        [a.tenant_id, ids],
      );
      const branchIds = [...new Set(batch.targets.items.map((t: any) => t.branch_id))].sort();
      await db.query(
        'SELECT id FROM branches WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',
        [a.tenant_id, branchIds],
      );
      const current = await targets(db, a.tenant_id, 'staff', ids);
      const signature = (rows: any[]) =>
        JSON.stringify(rows.map((r) => [r.id, r.branch_id, r.job_id, r.timezone]));
      if (signature(current) !== signature(batch.targets.items))
        throw new ConflictException(
          'Cabang, jabatan atau zona waktu target berubah. Buat pratinjau baru.',
        );
      const deadlines = new Map<string, Map<number, string>>();
      for (const timezone of [...new Set(current.map((m) => m.timezone))]) {
        const days = [...new Set<number>(batch.path_snapshot.steps.map((s: any) => s.due_days))];
        const rows = (
          await db.query(
            'SELECT day, (($1::date + day + 1)::timestamp AT TIME ZONE $3)::text AS due_at FROM unnest($2::int[]) AS day',
            [batch.start, days, timezone],
          )
        ).rows;
        deadlines.set(
          timezone,
          new Map(rows.map((r) => [r.day, new Date(r.due_at).toISOString()])),
        );
      }
      const assignmentIds = [];
      for (const member of current) {
        const assignmentId = randomUUID(),
          steps = [];
        for (const step of batch.path_snapshot.steps)
          steps.push({ ...step, due_at: deadlines.get(member.timezone)!.get(step.due_days) });
        const snapshot = { ...batch.path_snapshot, steps };
        await db.query(
          'INSERT INTO onboarding_assignments(id,tenant_id,batch_id,path_version_id,membership_id,branch_id,start_date,timezone,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            assignmentId,
            a.tenant_id,
            id,
            batch.path_version_id,
            member.id,
            member.branch_id,
            batch.start,
            member.timezone,
            JSON.stringify(snapshot),
          ],
        );
        await audit(db, a, req.correlationId, 'onboarding_assignment.assigned', assignmentId, {
          membership_id: member.id,
          path_version_id: batch.path_version_id,
        });
        assignmentIds.push(assignmentId);
      }
      const result = { batch_id: id, count: assignmentIds.length, assignment_ids: assignmentIds };
      await db.query(
        'UPDATE onboarding_assignment_batches SET result=$1 WHERE tenant_id=$2 AND id=$3',
        [JSON.stringify(result), a.tenant_id, id],
      );
      return result;
    });
  }
  @Get() async list(@Req() req: ApiRequest) {
    const a = req.actor;
    const rows = (
      await this.db.query(
        `SELECT t.*,t.start_date::text AS start_date,u.full_name,m.employee_number FROM onboarding_assignments t JOIN memberships m ON m.tenant_id=t.tenant_id AND m.id=t.membership_id JOIN users u ON u.id=m.user_id WHERE t.tenant_id=$1 AND ($2 OR t.membership_id=$3 OR ($4 AND m.branch_id=ANY($5::uuid[]))) ORDER BY t.created_at DESC,t.id LIMIT 100`,
        [a.tenant_id, admins(a), a.id, a.role === 'SUPERVISOR', a.scopes],
      )
    ).rows;
    return { items: await assignmentProgress(this.db, a.tenant_id, rows) };
  }
  @Post(':id/cancel') async cancel(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    const id = z.uuid().parse(raw),
      input = z.strictObject({ reason: z.string().trim().min(10).max(1000) }).parse(body);
    return this.db.transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT * FROM onboarding_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Tugas tidak ditemukan.');
      if (row.status === 'cancelled') {
        if (row.cancel_reason !== input.reason)
          throw new ConflictException('Tugas sudah dibatalkan dengan alasan lain.');
        return { id, status: 'cancelled' };
      }
      await db.query(
        "UPDATE onboarding_assignments SET status='cancelled',cancel_reason=$1,cancelled_by=$2,cancelled_at=now() WHERE tenant_id=$3 AND id=$4",
        [input.reason, req.actor.id, req.actor.tenant_id, id],
      );
      await audit(db, req.actor, req.correlationId, 'onboarding_assignment.cancelled', id, {
        reason: input.reason,
      });
      return { id, status: 'cancelled' };
    });
  }
}
