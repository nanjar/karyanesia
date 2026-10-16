import {
  Body,
  Controller,
  Get,
  Query,
  Post,
  Param,
  Req,
  Inject,
  UseGuards,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Database, Executor } from './database';
import { ApiRequest, admins } from './types';
import { SessionGuard } from './security';
import { audit } from './audit';
export async function skillsFor(db: Executor, tenant: string, member: string) {
  const skills = (
    await db.query('SELECT * FROM competencies WHERE tenant_id=$1 ORDER BY created_at,id', [tenant])
  ).rows;
  const attempts = (
    await db.query(
      "SELECT version_id,MIN(created_at) passed_at FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND (result->>'passed')::boolean GROUP BY version_id",
      [tenant, member],
    )
  ).rows;
  const started = (
    await db.query(
      'SELECT DISTINCT version_id FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2',
      [tenant, member],
    )
  ).rows;
  const assessments = (
    await db.query(
      `SELECT p.*,a.snapshot FROM practice_assessments p JOIN onboarding_assignments a ON a.tenant_id=p.tenant_id AND a.id=p.assignment_id WHERE p.tenant_id=$1 AND p.membership_id=$2 AND a.status<>'cancelled' AND NOT EXISTS(SELECT 1 FROM practice_assessments n WHERE n.tenant_id=p.tenant_id AND n.assignment_id=p.assignment_id AND n.step_position=p.step_position AND n.sequence>p.sequence) ORDER BY p.created_at DESC,p.id DESC`,
      [tenant, member],
    )
  ).rows;
  return skills.map((c) => {
    const theory = attempts.find((t) => t.version_id === c.module_version_id);
    const observation = assessments.find(
      (p) =>
        p.rubric_version_id === c.rubric_version_id &&
        p.snapshot.steps.some(
          (s: any) => s.position === p.step_position && s.version_id === c.module_version_id,
        ),
    );
    const verified = theory && observation?.outcome === 'competent';
    const verified_at = verified
      ? new Date(
          Math.max(
            new Date(theory.passed_at).getTime(),
            new Date(observation.created_at).getTime(),
          ),
        ).toISOString()
      : null;
    const expires_at =
      verified_at && c.content.validity_days
        ? new Date(Date.parse(verified_at) + c.content.validity_days * 86400000).toISOString()
        : null;
    return {
      id: c.id,
      ...c.content,
      status: verified
        ? expires_at && Date.parse(expires_at) <= Date.now()
          ? 'expired'
          : 'verified'
        : theory
          ? 'theory_passed'
          : started.some((t) => t.version_id === c.module_version_id)
            ? 'learning'
            : 'not_started',
      verified_at,
      expires_at,
      theory_passed_at: theory?.passed_at || null,
      assessment_id: observation?.id || null,
    };
  });
}
@Controller('competencies')
@UseGuards(SessionGuard)
export class CompetenciesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest) {
    return (
      await this.db.query(
        'SELECT * FROM competencies WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
        [req.actor.tenant_id],
      )
    ).rows;
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    const a = req.actor;
    if (!admins(a) && a.role !== 'HR') throw new ForbiddenException();
    const c = z
      .strictObject({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().min(1).max(2000),
        module_version_id: z.uuid(),
        rubric_version_id: z.uuid(),
        validity_days: z.number().int().min(1).max(3650).nullable().default(null),
      })
      .parse(body);
    return this.db.transaction(async (db) => {
      const refs = (
        await db.query(
          "SELECT 1 FROM learning_versions l,practice_rubrics r WHERE l.tenant_id=$1 AND r.tenant_id=$1 AND l.id=$2 AND r.id=$3 AND l.status='published' AND r.status='published' FOR SHARE OF l,r",
          [a.tenant_id, c.module_version_id, c.rubric_version_id],
        )
      ).rows;
      if (!refs.length) throw new ConflictException('Pilih versi materi dan rubrik terbit.');
      const id = randomUUID();
      await db.query(
        'INSERT INTO competencies(id,tenant_id,content,module_version_id,rubric_version_id,author_id) VALUES($1,$2,$3,$4,$5,$6)',
        [id, a.tenant_id, JSON.stringify(c), c.module_version_id, c.rubric_version_id, a.id],
      );
      await audit(db, a, req.correlationId, 'competency.created', id);
      return { id };
    });
  }
  @Get('matrix') async matrix(@Req() req: ApiRequest, @Query('after') after?: string) {
    const a = req.actor;
    const members = (
      await this.db.query(
        'SELECT m.id,m.employee_number,u.full_name,m.job_id,m.branch_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND ($2 OR (m.id=$3) OR (m.branch_id=ANY($4::uuid[]) AND $5)) AND ($6::uuid IS NULL OR m.id>$6) ORDER BY m.id LIMIT 100',
        [
          a.tenant_id,
          admins(a),
          a.id,
          a.scopes,
          ['HR', 'OPERATIONS', 'SUPERVISOR'].includes(a.role),
          z.uuid().optional().parse(after) || null,
        ],
      )
    ).rows;
    const requirements = (
      await this.db.query(
        'SELECT DISTINCT ON(job_id) * FROM job_requirement_versions WHERE tenant_id=$1 ORDER BY job_id,revision DESC',
        [a.tenant_id],
      )
    ).rows;
    return {
      as_of: new Date().toISOString(),
      requirements,
      members: await Promise.all(
        members.map(async (m) => ({ ...m, skills: await skillsFor(this.db, a.tenant_id, m.id) })),
      ),
    };
  }
  @Get('requirements') async requirements(@Req() req: ApiRequest) {
    return (
      await this.db.query(
        'SELECT DISTINCT ON(job_id) * FROM job_requirement_versions WHERE tenant_id=$1 ORDER BY job_id,revision DESC',
        [req.actor.tenant_id],
      )
    ).rows;
  }
  @Post('requirements/:job') async set(
    @Req() req: ApiRequest,
    @Param('job') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor;
    if (!admins(a) && a.role !== 'HR') throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z
        .strictObject({
          revision: z.number().int().min(0),
          requirements: z
            .array(
              z.strictObject({
                competency_id: z.uuid(),
                required: z.boolean(),
                critical: z.boolean(),
              }),
            )
            .max(50)
            .refine(
              (v) =>
                new Set(v.map((x) => x.competency_id)).size === v.length &&
                v.every((x) => !x.critical || x.required),
            ),
        })
        .parse(body);
    return this.db.transaction(async (db) => {
      if (
        !(
          await db.query('SELECT id FROM jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            a.tenant_id,
            id,
          ])
        ).rows.length
      )
        throw new NotFoundException();
      const rev = Number(
        (
          await db.query(
            'SELECT COALESCE(MAX(revision),0) n FROM job_requirement_versions WHERE tenant_id=$1 AND job_id=$2',
            [a.tenant_id, id],
          )
        ).rows[0].n,
      );
      if (rev !== input.revision) throw new ConflictException('Versi persyaratan berubah.');
      const refs = (
        await db.query('SELECT id FROM competencies WHERE tenant_id=$1 AND id=ANY($2::uuid[])', [
          a.tenant_id,
          input.requirements.map((x) => x.competency_id),
        ])
      ).rows;
      if (refs.length !== input.requirements.length)
        throw new ConflictException('Kompetensi tidak valid.');
      await db.query(
        'INSERT INTO job_requirement_versions(id,tenant_id,job_id,revision,requirements,author_id) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), a.tenant_id, id, rev + 1, JSON.stringify(input.requirements), a.id],
      );
      await audit(db, a, req.correlationId, 'job_requirements.created', id, { revision: rev + 1 });
      return { revision: rev + 1 };
    });
  }
}
@Controller('data-corrections')
@UseGuards(SessionGuard)
export class CorrectionsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest) {
    const a = req.actor;
    return (
      await this.db.query(
        'SELECT c.* FROM data_corrections c JOIN memberships m ON m.tenant_id=c.tenant_id AND m.id=c.membership_id WHERE c.tenant_id=$1 AND ($2 OR c.membership_id=$3 OR m.branch_id=ANY($4::uuid[])) ORDER BY c.created_at DESC LIMIT 100',
        [a.tenant_id, admins(a), a.id, ['HR', 'SUPERVISOR'].includes(a.role) ? a.scopes : []],
      )
    ).rows;
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    const input = z.strictObject({ reason: z.string().trim().min(10).max(2000) }).parse(body),
      id = randomUUID();
    await this.db.transaction(async (db) => {
      await db.query(
        'INSERT INTO data_corrections(id,tenant_id,membership_id,reason) VALUES($1,$2,$3,$4)',
        [id, req.actor.tenant_id, req.actor.id, input.reason],
      );
      await audit(db, req.actor, req.correlationId, 'data_correction.requested', id);
    });
    return { id };
  }
  @Post(':id/resolve') async resolve(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor,
      id = z.uuid().parse(raw),
      input = z.strictObject({ resolution: z.string().trim().min(10).max(2000) }).parse(body);
    if (!admins(a) && !['HR', 'SUPERVISOR'].includes(a.role)) throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const row = (
        await db.query(
          'SELECT c.*,m.branch_id FROM data_corrections c JOIN memberships m ON m.tenant_id=c.tenant_id AND m.id=c.membership_id WHERE c.tenant_id=$1 AND c.id=$2 FOR UPDATE OF c',
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!row || (!admins(a) && !a.scopes.includes(row.branch_id))) throw new NotFoundException();
      if (row.membership_id === a.id) throw new ForbiddenException();
      if (row.resolved_at) throw new ConflictException('Sudah diselesaikan.');
      await db.query(
        'UPDATE data_corrections SET resolution=$1,resolved_by=$2,resolved_at=now() WHERE tenant_id=$3 AND id=$4',
        [input.resolution, a.id, a.tenant_id, id],
      );
      await audit(db, a, req.correlationId, 'data_correction.resolved', id);
      return { resolved: true };
    });
  }
}
