import { cursor, beforeCursor } from './pagination';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database, Executor } from './database';
import { SessionGuard } from './security';
import { Actor, admins, ApiRequest } from './types';
import { audit } from './audit';
import { token, digest } from './crypto';
const code = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1).max(120);
const branchSchema = z.strictObject({
  code,
  name,
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']),
});
const jobSchema = z.strictObject({ code, name });
const staffSchema = z.strictObject({
  employee_number: code,
  full_name: name,
  branch_id: z.uuid(),
  job_id: z.uuid(),
  role: z.enum(['STAFF', 'SUPERVISOR']).default('STAFF'),
  supervisor_id: z.uuid().nullable().optional(),
});
const pageSchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
function admin(a: Actor) {
  if (!admins(a))
    throw new ForbiddenException('Hanya admin perusahaan yang dapat mengubah organisasi.');
}
function scope(a: Actor, field: string, params: any[]): string {
  if (admins(a)) return 'TRUE';
  params.push(a.scopes);
  return `${field}=ANY($${params.length}::uuid[])`;
}
@ApiTags('Organization')
@Controller()
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('branches')
  async branches(@Req() req: ApiRequest) {
    const a = req.actor,
      params: any[] = [a.tenant_id];
    let where: string;
    if (a.role === 'STAFF') {
      params.push(a.branch_id);
      where = 'b.id=$2';
    } else where = scope(a, 'b.id', params);
    return (
      await this.db.query(
        `SELECT b.id,b.code,b.name,b.timezone FROM branches b WHERE b.tenant_id=$1 AND ${where} ORDER BY b.name LIMIT 500`,
        params,
      )
    ).rows;
  }
  @Post('branches')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name', 'timezone'],
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        timezone: { type: 'string', enum: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] },
      },
    },
  })
  async addBranch(@Body() body: unknown, @Req() req: ApiRequest) {
    admin(req.actor);
    const input = branchSchema.parse(body),
      id = randomUUID();
    return this.db.transaction(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO branches(id,tenant_id,code,name,timezone) VALUES($1,$2,$3,$4,$5) RETURNING id,code,name,timezone',
        [id, req.actor.tenant_id, input.code, input.name, input.timezone],
      );
      await audit(db, req.actor, req.correlationId, 'branch.create', id);
      return rows[0];
    });
  }
  @Get('jobs')
  async jobs(@Req() req: ApiRequest) {
    return (
      await this.db.query(
        'SELECT id,code,name FROM jobs WHERE tenant_id=$1 ORDER BY name LIMIT 500',
        [req.actor.tenant_id],
      )
    ).rows;
  }
  @Post('jobs')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name'],
      properties: { code: { type: 'string' }, name: { type: 'string' } },
    },
  })
  async addJob(@Body() body: unknown, @Req() req: ApiRequest) {
    admin(req.actor);
    const input = jobSchema.parse(body),
      id = randomUUID();
    return this.db.transaction(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO jobs(id,tenant_id,code,name) VALUES($1,$2,$3,$4) RETURNING id,code,name',
        [id, req.actor.tenant_id, input.code, input.name],
      );
      await audit(db, req.actor, req.correlationId, 'job.create', id);
      return rows[0];
    });
  }
  @Get('memberships')
  async members(@Req() req: ApiRequest, @Query() query: unknown) {
    const page = pageSchema.parse(query),
      a = req.actor,
      params: any[] = [a.tenant_id];
    let where: string;
    if (a.role === 'STAFF') {
      params.push(a.id);
      where = 'm.id=$2';
    } else where = scope(a, 'm.branch_id', params);
    if (page.after) {
      params.push(page.after);
      where += ` AND m.id>$${params.length}`;
    }
    params.push(page.limit + 1);
    const { rows } = await this.db.query(
      `SELECT m.id,m.employee_number,u.full_name,m.role,m.active,m.branch_id,m.job_id,
      b.name branch_name,j.name job_name,(u.password_hash IS NOT NULL) activated
      FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN branches b ON b.tenant_id=m.tenant_id AND b.id=m.branch_id
      LEFT JOIN jobs j ON j.tenant_id=m.tenant_id AND j.id=m.job_id WHERE m.tenant_id=$1 AND ${where} ORDER BY m.id LIMIT $${params.length}`,
      params,
    );
    return {
      items: rows.slice(0, page.limit),
      next_cursor: rows.length > page.limit ? rows[page.limit - 1].id : null,
    };
  }
  @Post('memberships')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['employee_number', 'full_name', 'branch_id', 'job_id'],
      properties: {
        employee_number: { type: 'string' },
        full_name: { type: 'string' },
        branch_id: { type: 'string', format: 'uuid' },
        job_id: { type: 'string', format: 'uuid' },
        role: { type: 'string', enum: ['STAFF', 'SUPERVISOR'] },
        supervisor_id: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  async addMember(@Body() body: unknown, @Req() req: ApiRequest) {
    admin(req.actor);
    const input = staffSchema.parse(body),
      id = randomUUID(),
      uid = randomUUID(),
      activation = token(),
      tenant = req.actor.tenant_id;
    await this.db.transaction(async (db) => {
      // Composite foreign keys reject cross-tenant branch/job/supervisor references.
      if (input.supervisor_id) {
        const { rows } = await db.query(
          `SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 AND active AND role IN ('OWNER','ADMIN','SUPERVISOR')`,
          [tenant, input.supervisor_id],
        );
        if (!rows[0]) throw new NotFoundException('Supervisor tidak ditemukan.');
      }
      await db.query('INSERT INTO users(id,full_name) VALUES($1,$2)', [uid, input.full_name]);
      await db.query(
        `INSERT INTO memberships(id,tenant_id,user_id,employee_number,branch_id,job_id,supervisor_id,role) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          tenant,
          uid,
          input.employee_number,
          input.branch_id,
          input.job_id,
          input.supervisor_id ?? null,
          input.role,
        ],
      );
      if (input.role === 'SUPERVISOR')
        await db.query(
          'INSERT INTO branch_grants(tenant_id,membership_id,branch_id) VALUES($1,$2,$3)',
          [tenant, id, input.branch_id],
        );
      await db.query(
        `INSERT INTO activation_tokens(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')`,
        [digest(activation), tenant, id],
      );
      await audit(db, req.actor, req.correlationId, 'membership.create', id, { role: input.role });
    });
    return { id, activation_token: activation, expires_in_hours: 24 };
  }
  @Post('memberships/:id/activation-token')
  async reissueActivation(@Param('id') raw: string, @Req() req: ApiRequest) {
    admin(req.actor);
    const id = z.uuid().parse(raw),
      activation = token();
    await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        `SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id
        WHERE m.tenant_id=$1 AND m.id=$2 AND m.active AND u.active AND u.password_hash IS NULL
        AND m.role IN ('STAFF','SUPERVISOR') FOR UPDATE OF m`,
        [req.actor.tenant_id, id],
      );
      if (!rows[0]) throw new NotFoundException('Akun belum aktif tidak ditemukan.');
      await db.query(
        'UPDATE activation_tokens SET used_at=now() WHERE tenant_id=$1 AND membership_id=$2 AND used_at IS NULL',
        [req.actor.tenant_id, id],
      );
      await db.query(
        `INSERT INTO activation_tokens(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')`,
        [digest(activation), req.actor.tenant_id, id],
      );
      await audit(db, req.actor, req.correlationId, 'membership.activation_reissue', id);
    });
    return { id, activation_token: activation, expires_in_hours: 24 };
  }
  @Patch('memberships/:id/deactivate')
  async deactivate(@Param('id') raw: string, @Req() req: ApiRequest) {
    admin(req.actor);
    const id = z.uuid().parse(raw);
    return this.db.transaction(async (db) => {
      const { rows } = await db.query(
        `UPDATE memberships SET active=false WHERE tenant_id=$1 AND id=$2 AND role NOT IN ('OWNER','ADMIN') RETURNING id`,
        [req.actor.tenant_id, id],
      );
      if (!rows[0]) throw new NotFoundException('Staf tidak ditemukan atau akun admin dilindungi.');
      await db.query('DELETE FROM sessions WHERE tenant_id=$1 AND membership_id=$2', [
        req.actor.tenant_id,
        id,
      ]);
      await audit(db, req.actor, req.correlationId, 'membership.deactivate', id);
      return { id, active: false };
    });
  }
  @Get('organization/summary')
  async summary(@Req() req: ApiRequest) {
    const a = req.actor,
      params: any[] = [a.tenant_id];
    const where =
      a.role === 'STAFF' ? (params.push(a.id), 'm.id=$2') : scope(a, 'm.branch_id', params);
    const { rows } = await this.db.query(
      `SELECT count(*) FILTER(WHERE m.active)::int active_staff,
      count(*) FILTER(WHERE m.active AND u.password_hash IS NULL)::int awaiting_activation,
      count(DISTINCT m.branch_id) FILTER(WHERE m.active)::int staffed_branches
      FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND ${where}`,
      params,
    );
    return { ...rows[0], as_of: new Date().toISOString() };
  }
  @Get('audit-events')
  async events(@Req() req: ApiRequest, @Query('after') after?: string) {
    admin(req.actor);
    return (
      await this.db.query(
        `SELECT id,action,object_id,created_at,correlation_id FROM audit_events WHERE tenant_id=$1 ${beforeCursor('audit_events', 2)} ORDER BY created_at DESC,id DESC LIMIT 50`,
        [req.actor.tenant_id, cursor(after) || null],
      )
    ).rows;
  }
}
