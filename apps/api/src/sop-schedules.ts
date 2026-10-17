import { cursor, beforeCursor } from './pagination';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Inject,
  NotFoundException,
  ConflictException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database';
import { SessionGuard } from './security';
import { admins, ApiRequest } from './types';
import { audit } from './audit';
import { sopState } from './operations';
const date = z.iso.date();
const schema = z
  .strictObject({
    template_version_id: z.uuid(),
    branch_id: z.uuid(),
    start_date: date,
    end_date: date,
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    assignee_ids: z
      .array(z.uuid().transform((v) => v.toLowerCase()))
      .max(500)
      .refine((v) => new Set(v).size === v.length),
  })
  .refine(
    (v) =>
      v.end_date >= v.start_date &&
      Date.parse(v.end_date) - Date.parse(v.start_date) <= 365 * 86400000,
    'Rentang jadwal maksimal 366 hari.',
  );
@Controller('sop-schedules')
@UseGuards(SessionGuard)
export class SopSchedulesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    if (!admins(req.actor) && req.actor.role !== 'OPERATIONS') throw new ForbiddenException();
    return (
      await this.db.query(
        `SELECT sop_schedules.*,EXISTS(SELECT 1 FROM schedule_stops x WHERE x.tenant_id=sop_schedules.tenant_id AND x.schedule_id=sop_schedules.id) stopped FROM sop_schedules WHERE tenant_id=$1 AND ($2 OR branch_id=ANY($3::uuid[])) ${beforeCursor('sop_schedules', 4)} ORDER BY created_at DESC,id DESC LIMIT 100`,
        [req.actor.tenant_id, admins(req.actor), req.actor.scopes, cursor(after) || null],
      )
    ).rows;
  }
  @Post() async create(@Body() body: unknown, @Req() req: ApiRequest) {
    const a = req.actor;
    if (!admins(a) && a.role !== 'OPERATIONS') throw new ForbiddenException();
    const input = schema.parse(body);
    if (!admins(a) && !a.scopes.includes(input.branch_id)) throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const template = (
        await db.query(
          "SELECT * FROM sop_templates WHERE tenant_id=$1 AND id=$2 AND status='published' FOR SHARE",
          [a.tenant_id, input.template_version_id],
        )
      ).rows[0];
      if (!template) throw new ConflictException('Pilih versi SOP terbit.');
      const branch = (
        await db.query('SELECT * FROM branches WHERE tenant_id=$1 AND id=$2 FOR SHARE', [
          a.tenant_id,
          input.branch_id,
        ])
      ).rows[0];
      if (!branch || !template.content.branch_ids.includes(input.branch_id))
        throw new ConflictException('Cabang tidak termasuk target template.');
      const recipients = (
        await db.query(
          "SELECT m.id,m.employee_number,m.job_id,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.id=ANY($2::uuid[]) AND m.active AND u.active AND m.role='STAFF' AND m.branch_id=$3 AND m.job_id=ANY($4::uuid[]) ORDER BY m.id FOR SHARE OF m,u",
          [a.tenant_id, input.assignee_ids, input.branch_id, template.content.job_ids],
        )
      ).rows;
      if (recipients.length !== input.assignee_ids.length)
        throw new ConflictException(
          'Penerima harus staf aktif dengan cabang dan jabatan sesuai template.',
        );
      const id = randomUUID();
      const content = {
        ...input,
        timezone: branch.timezone,
        branch: { id: branch.id, code: branch.code, name: branch.name },
        recipients,
        template: {
          id: template.id,
          version: template.version,
          checksum: template.checksum,
          content: template.content,
        },
      };
      await db.query(
        'INSERT INTO sop_schedules(id,tenant_id,template_version_id,branch_id,content) VALUES($1,$2,$3,$4,$5)',
        [id, a.tenant_id, template.id, branch.id, JSON.stringify(content)],
      );
      await audit(db, a, req.correlationId, 'sop_schedule.created', id, {
        recipient_count: recipients.length,
      });
      return { id, content };
    });
  }
  @Post(':id/stop') async stop(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor,
      id = z.uuid().parse(raw),
      input = z.strictObject({ reason: z.string().trim().min(10).max(2000) }).parse(body);
    if (!admins(a) && a.role !== 'OPERATIONS') throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT id,branch_id FROM sop_schedules WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!row || (!admins(a) && !a.scopes.includes(row.branch_id))) throw new NotFoundException();
      await db.query(
        'INSERT INTO schedule_stops(tenant_id,schedule_id,actor_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [a.tenant_id, id, a.id, input.reason],
      );
      await audit(db, a, req.correlationId, 'sop_schedule.stopped', id, { reason: input.reason });
      return { stopped: true };
    });
  }
  @Post(':id/generate') async generate(
    @Param('id') raw: string,
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const id = z.uuid().parse(raw),
      input = z.strictObject({ local_date: date }).parse(body),
      a = req.actor;
    if (!admins(a) && a.role !== 'OPERATIONS') throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const schedule = (
        await db.query('SELECT * FROM sop_schedules WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          a.tenant_id,
          id,
        ])
      ).rows[0];
      if (!schedule || (!admins(a) && !a.scopes.includes(schedule.branch_id)))
        throw new NotFoundException();
      const previous = (
        await db.query(
          'SELECT result FROM sop_schedule_runs WHERE tenant_id=$1 AND schedule_id=$2 AND local_date=$3::date',
          [a.tenant_id, id, input.local_date],
        )
      ).rows[0];
      if (previous) return previous.result;
      if (
        (
          await db.query('SELECT 1 FROM schedule_stops WHERE tenant_id=$1 AND schedule_id=$2', [
            a.tenant_id,
            id,
          ])
        ).rows.length
      )
        throw new ConflictException('Jadwal dihentikan.');
      const c = schedule.content,
        weekday = new Date(input.local_date + 'T00:00:00Z').getUTCDay() || 7;
      if (
        input.local_date < c.start_date ||
        input.local_date > c.end_date ||
        !c.weekdays.includes(weekday)
      )
        throw new ConflictException('Tanggal tidak termasuk jadwal.');
      const eligibleRows = (
        await db.query(
          "SELECT m.id,m.employee_number,m.job_id,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.id=ANY($2::uuid[]) AND m.active AND u.active AND m.role='STAFF' AND m.branch_id=$3 AND m.job_id=ANY($4::uuid[]) ORDER BY m.id FOR SHARE OF m,u",
          [a.tenant_id, c.assignee_ids, schedule.branch_id, c.template.content.job_ids],
        )
      ).rows;
      const eligible = eligibleRows.map((r) => r.id);
      const t = c.template.content;
      const times = (
        await db.query(
          'SELECT ($1::date + $2::time) AT TIME ZONE $4 AS starts_at, (($1::date + $5::integer) + $3::time) AT TIME ZONE $4 AS due_at',
          [input.local_date, t.start_time, t.due_time, c.timezone, t.due_next_day ? 1 : 0],
        )
      ).rows[0];
      const instanceIds = [];
      for (const member of eligible.length ? eligible : [null]) {
        const instanceId = randomUUID();
        instanceIds.push(instanceId);
        await db.query(
          'INSERT INTO sop_instances(id,tenant_id,schedule_id,local_date,assignee_id,branch_id,status,snapshot,starts_at,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            instanceId,
            a.tenant_id,
            id,
            input.local_date,
            member,
            schedule.branch_id,
            member ? 'open' : 'unassigned',
            JSON.stringify({
              template: c.template,
              branch: c.branch,
              timezone: c.timezone,
              shift_label: t.shift_label,
              recipient: eligibleRows.find((r: any) => r.id === member) || null,
            }),
            times.starts_at,
            times.due_at,
          ],
        );
      }
      const result = {
        instance_ids: instanceIds,
        assigned_count: eligible.length,
        unassigned: eligible.length === 0,
        skipped_assignee_ids: c.assignee_ids.filter((v: string) => !eligible.includes(v)),
      };
      await db.query(
        'INSERT INTO sop_schedule_runs(id,tenant_id,schedule_id,local_date,result) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), a.tenant_id, id, input.local_date, JSON.stringify(result)],
      );
      await audit(db, a, req.correlationId, 'sop_schedule.generated', id, {
        execution_source: req.executionSource || 'user',
        local_date: input.local_date,
        ...result,
      });
      return result;
    });
  }
}
@Controller('sop-instances')
@UseGuards(SessionGuard)
export class SopInstancesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    const a = req.actor;
    if (!admins(a) && !['STAFF', 'SUPERVISOR', 'OPERATIONS', 'HR'].includes(a.role))
      throw new ForbiddenException();
    const rows = (
      await this.db.query(
        `SELECT *, now()>due_at AS overdue FROM sop_instances WHERE tenant_id=$1 AND ($2::boolean OR ($3='STAFF' AND assignee_id=$4) OR ($3 IN ('SUPERVISOR','OPERATIONS','HR') AND branch_id=ANY($5::uuid[]))) ${beforeCursor('sop_instances', 6, 'due_at')} ORDER BY due_at DESC,id DESC LIMIT 100`,
        [a.tenant_id, admins(a), a.role, a.id, a.scopes, cursor(after) || null],
      )
    ).rows;
    return Promise.all(rows.map((row) => sopState(this.db, a.tenant_id, row)));
  }
}
