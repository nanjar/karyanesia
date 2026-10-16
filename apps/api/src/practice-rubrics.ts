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
import { admins, authors, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
const schema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(2000),
    items: z
      .array(
        z.strictObject({
          label: z.string().trim().min(1).max(500),
          required: z.boolean().default(true),
          critical: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((v) => v.items.some((i) => i.required), 'Minimal satu item wajib diperlukan.')
  .refine((v) => v.items.every((i) => !i.critical || i.required), 'Item kritis harus wajib.');
function manage(req: ApiRequest) {
  if (!authors(req.actor))
    throw new ForbiddenException('Hanya admin dapat mengelola rubrik praktik.');
}
@Controller('practice-rubrics')
@UseGuards(SessionGuard)
export class PracticeRubricsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    manage(req);
    return {
      items: (
        await this.db.query(
          `SELECT id,version,status,content->>'title' AS title,created_at FROM practice_rubrics WHERE tenant_id=$1 ${beforeCursor('practice_rubrics', 2)} ORDER BY created_at DESC,id DESC LIMIT 100`,
          [req.actor.tenant_id, cursor(after) || null],
        )
      ).rows,
    };
  }
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    manage(req);
    const row = (
      await this.db.query('SELECT * FROM practice_rubrics WHERE tenant_id=$1 AND id=$2', [
        req.actor.tenant_id,
        z.uuid().parse(raw),
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('Rubrik tidak ditemukan.');
    return row;
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    manage(req);
    return this.save(req, schema.parse(body));
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
          await db.query('SELECT module_id FROM practice_rubrics WHERE tenant_id=$1 AND id=$2', [
            req.actor.tenant_id,
            previous,
          ])
        ).rows[0];
        if (!old) throw new NotFoundException('Rubrik tidak ditemukan.');
        moduleId = old.module_id;
        version =
          Number(
            (
              await db.query(
                'SELECT MAX(version) AS n FROM practice_rubrics WHERE tenant_id=$1 AND module_id=$2',
                [req.actor.tenant_id, moduleId],
              )
            ).rows[0].n,
          ) + 1;
      }
      const id = randomUUID(),
        content = { ...input, items: input.items.map((item, i) => ({ ...item, position: i + 1 })) };
      await db.query(
        'INSERT INTO practice_rubrics(id,tenant_id,module_id,version,content,checksum,author_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
      await audit(
        db,
        req.actor,
        req.correlationId,
        previous ? 'practice_rubric.revised' : 'practice_rubric.created',
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
    return this.transition(req, raw, body, 'published');
  }
  @Post(':id/archive') async archive(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    return this.transition(req, raw, body, 'archived');
  }
  private async transition(
    req: ApiRequest,
    raw: string,
    body: unknown,
    status: 'published' | 'archived',
  ) {
    manage(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    return this.db.transaction(async (db) => {
      const row = (
        await db.query(
          `UPDATE practice_rubrics SET status=$1,published_at=CASE WHEN $1='published' THEN now() ELSE published_at END WHERE tenant_id=$2 AND id=$3 AND status=$4 RETURNING id`,
          [status, req.actor.tenant_id, id, status === 'published' ? 'draft' : 'published'],
        )
      ).rows[0];
      if (!row)
        throw new ConflictException('Versi rubrik tidak tersedia untuk perubahan status ini.');
      await audit(db, req.actor, req.correlationId, 'practice_rubric.' + status, id);
      return { id, status };
    });
  }
}
