import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { Database, Executor } from './database';
import { SessionGuard } from './security';
import { admins, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
const schema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    steps: z
      .array(
        z.strictObject({
          version_id: z.uuid(),
          rubric_version_id: z.uuid().optional(),
          due_days: z.number().int().min(0).max(365),
          prerequisite: z.number().int().min(1).max(20).nullable().default(null),
          practice_required: z.literal(true).default(true),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.steps.forEach((step, i) => {
      if (seen.has(step.version_id))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', i, 'version_id'],
          message: 'Versi modul tidak boleh berulang.',
        });
      seen.add(step.version_id);
      if (
        step.prerequisite !== null &&
        (step.prerequisite > i || value.steps[step.prerequisite - 1].due_days > step.due_days)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['steps', i, 'prerequisite'],
          message: 'Prasyarat harus langkah sebelumnya dengan tenggat tidak lebih lambat.',
        });
    });
  });
function manage(req: ApiRequest) {
  if (!admins(req.actor))
    throw new ForbiddenException('Hanya admin perusahaan dapat mengelola jalur onboarding.');
}
async function snapshot(db: Executor, tenant: string, input: z.infer<typeof schema>) {
  const ids = input.steps.map((s) => s.version_id).sort();
  const modules = (
    await db.query(
      "SELECT id,checksum,content->>'title' AS title FROM learning_versions WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status='published' ORDER BY id FOR SHARE",
      [tenant, ids],
    )
  ).rows;
  if (modules.length !== ids.length)
    throw new ConflictException(
      'Semua langkah harus memakai versi modul terbit dalam perusahaan Anda.',
    );
  const rubricIds = [
    ...new Set(input.steps.flatMap((s) => (s.rubric_version_id ? [s.rubric_version_id] : []))),
  ].sort();
  const rubrics = rubricIds.length
    ? (
        await db.query(
          "SELECT id,version,checksum,content FROM practice_rubrics WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status='published' ORDER BY id FOR SHARE",
          [tenant, rubricIds],
        )
      ).rows
    : [];
  if (rubrics.length !== rubricIds.length)
    throw new ConflictException('Rubrik harus versi terbit dalam perusahaan Anda.');
  return {
    ...input,
    steps: input.steps.map((s, i) => {
      const module = modules.find((m) => m.id === s.version_id)!;
      return {
        ...s,
        position: i + 1,
        module_title: module.title,
        module_checksum: module.checksum,
        ...(s.rubric_version_id
          ? {
              practice_rubric: (() => {
                const r = rubrics.find((r) => r.id === s.rubric_version_id)!;
                return { id: r.id, version: r.version, checksum: r.checksum, ...r.content };
              })(),
            }
          : {}),
      };
    }),
  };
}
@Controller('onboarding-paths')
@UseGuards(SessionGuard)
export class OnboardingPathsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest) {
    manage(req);
    return {
      items: (
        await this.db.query(
          "SELECT id,version,status,content->>'title' AS title,created_at FROM onboarding_paths WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT 100",
          [req.actor.tenant_id],
        )
      ).rows,
    };
  }
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    manage(req);
    const row = (
      await this.db.query('SELECT * FROM onboarding_paths WHERE tenant_id=$1 AND id=$2', [
        req.actor.tenant_id,
        z.uuid().parse(raw),
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('Jalur tidak ditemukan.');
    return row;
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    manage(req);
    const input = schema.parse(body);
    return this.save(req, input);
  }
  @Post(':id/revise') async revise(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    return this.save(req, schema.parse(body), z.uuid().parse(raw));
  }
  private async save(req: ApiRequest, input: z.infer<typeof schema>, previous?: string) {
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [req.actor.tenant_id]);
      let moduleId = randomUUID(),
        version = 1;
      if (previous) {
        const old = (
          await db.query('SELECT module_id FROM onboarding_paths WHERE tenant_id=$1 AND id=$2', [
            req.actor.tenant_id,
            previous,
          ])
        ).rows[0];
        if (!old) throw new NotFoundException('Jalur tidak ditemukan.');
        moduleId = old.module_id;
        version =
          Number(
            (
              await db.query(
                'SELECT MAX(version) AS n FROM onboarding_paths WHERE tenant_id=$1 AND module_id=$2',
                [req.actor.tenant_id, moduleId],
              )
            ).rows[0].n,
          ) + 1;
      }
      const content = await snapshot(db, req.actor.tenant_id, input),
        id = randomUUID();
      await db.query(
        'INSERT INTO onboarding_paths(id,tenant_id,module_id,version,content,checksum,author_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          req.actor.tenant_id,
          moduleId,
          version,
          JSON.stringify(content),
          digest(JSON.stringify(content)),
          req.actor.id,
        ],
      );
      for (const step of content.steps)
        await db.query(
          'INSERT INTO onboarding_path_modules(tenant_id,path_id,position,version_id,rubric_version_id) VALUES($1,$2,$3,$4,$5)',
          [req.actor.tenant_id, id, step.position, step.version_id, step.rubric_version_id ?? null],
        );
      await audit(
        db,
        req.actor,
        req.correlationId,
        previous ? 'onboarding_path.revised' : 'onboarding_path.created',
        id,
        { previous_version_id: previous ?? null },
      );
      return { id, version };
    });
  }
  @Post(':id/publish') async publish(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    await this.db.transaction(async (db) => {
      const row = (
        await db.query(
          "SELECT * FROM onboarding_paths WHERE tenant_id=$1 AND id=$2 AND status='draft' FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Draft jalur tidak tersedia.');
      // Revalidate availability without modifying the saved snapshot.
      const input = schema.parse({
        title: row.content.title,
        description: row.content.description,
        steps: row.content.steps.map((s: any) => ({
          version_id: s.version_id,
          ...(s.rubric_version_id ? { rubric_version_id: s.rubric_version_id } : {}),
          due_days: s.due_days,
          prerequisite: s.prerequisite,
          practice_required: s.practice_required,
        })),
      });
      await snapshot(db, req.actor.tenant_id, input);
      await db.query(
        "UPDATE onboarding_paths SET status='published',published_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id],
      );
      await audit(db, req.actor, req.correlationId, 'onboarding_path.published', id);
    });
    return { id, status: 'published' };
  }
  @Post(':id/archive') async archive(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    await this.db.transaction(async (db) => {
      const row = (
        await db.query(
          "UPDATE onboarding_paths SET status='archived' WHERE tenant_id=$1 AND id=$2 AND status='published' RETURNING id",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Versi terbit tidak tersedia.');
      await audit(db, req.actor, req.correlationId, 'onboarding_path.archived', id);
    });
    return { id, status: 'archived' };
  }
}
