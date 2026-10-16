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
const base = {
  label: z.string().trim().min(1).max(500),
  required: z.boolean().default(true),
  critical: z.boolean().default(false),
  issue_required: z.boolean().default(false),
};
const item = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('boolean'), expected: z.boolean().default(true) }),
  z.strictObject({
    ...base,
    kind: z.literal('number'),
    unit: z.string().trim().min(1).max(40),
    min: z.number().min(-1e9).max(1e9).nullable().default(null),
    max: z.number().min(-1e9).max(1e9).nullable().default(null),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('text'),
    max_length: z.number().int().min(1).max(4000).default(2000),
  }),
]);
const ids = z
  .array(z.uuid().transform((v) => v.toLowerCase()))
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length, 'Target tidak boleh berulang.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Gunakan waktu HH:mm.');
const schema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(2000),
    branch_ids: ids,
    job_ids: ids,
    shift_label: z.string().trim().min(1).max(80),
    start_time: time,
    due_time: time,
    due_next_day: z.boolean().default(false),
    auto_accept: z.boolean().default(false),
    items: z.array(item).min(1).max(30),
  })
  .superRefine((v, ctx) => {
    if (!v.items.some((i) => i.required))
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Minimal satu item wajib.' });
    if (
      (!v.due_next_day && v.due_time <= v.start_time) ||
      (v.due_next_day && v.due_time > v.start_time)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['due_time'],
        message:
          'Jendela shift harus lebih dari nol dan maksimal 24 jam; gunakan hari berikutnya untuk melewati tengah malam.',
      });
    if (v.auto_accept && v.items.some((i) => i.critical))
      ctx.addIssue({
        code: 'custom',
        path: ['auto_accept'],
        message: 'Item kritis memerlukan review manusia.',
      });
    v.items.forEach((i, n) => {
      if (i.critical && !i.required)
        ctx.addIssue({
          code: 'custom',
          path: ['items', n, 'critical'],
          message: 'Item kritis harus wajib.',
        });
      if (
        i.kind === 'number' &&
        ((i.min === null && i.max === null) || (i.min !== null && i.max !== null && i.min > i.max))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['items', n, 'min'],
          message: 'Tentukan minimal satu batas angka dengan min tidak lebih dari max.',
        });
      if (i.kind === 'text' && i.issue_required)
        ctx.addIssue({
          code: 'custom',
          path: ['items', n, 'issue_required'],
          message: 'Kewajiban kendala otomatis belum tersedia untuk teks.',
        });
    });
  });
async function refs(db: Executor, tenant: string, input: z.infer<typeof schema>) {
  const branches = (
    await db.query(
      'SELECT id,code,name,timezone FROM branches WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',
      [tenant, [...input.branch_ids].sort()],
    )
  ).rows;
  const jobs = (
    await db.query(
      'SELECT id,code,name FROM jobs WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',
      [tenant, [...input.job_ids].sort()],
    )
  ).rows;
  if (branches.length !== input.branch_ids.length || jobs.length !== input.job_ids.length)
    throw new ConflictException('Cabang/jabatan sasaran harus berada dalam perusahaan Anda.');
  return { branches, jobs };
}
function manage(req: ApiRequest) {
  if (!admins(req.actor)) throw new ForbiddenException('Hanya admin dapat mengelola template SOP.');
}
@Controller('sop-templates')
@UseGuards(SessionGuard)
export class SopTemplatesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest) {
    manage(req);
    return {
      items: (
        await this.db.query(
          "SELECT id,version,status,content->>'title' AS title,created_at FROM sop_templates WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT 100",
          [req.actor.tenant_id],
        )
      ).rows,
    };
  }
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    manage(req);
    const row = (
      await this.db.query('SELECT * FROM sop_templates WHERE tenant_id=$1 AND id=$2', [
        req.actor.tenant_id,
        z.uuid().parse(raw),
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('Template SOP tidak ditemukan.');
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
          await db.query('SELECT module_id FROM sop_templates WHERE tenant_id=$1 AND id=$2', [
            req.actor.tenant_id,
            previous,
          ])
        ).rows[0];
        if (!old) throw new NotFoundException('Template SOP tidak ditemukan.');
        moduleId = old.module_id;
        version =
          Number(
            (
              await db.query(
                'SELECT MAX(version) AS n FROM sop_templates WHERE tenant_id=$1 AND module_id=$2',
                [req.actor.tenant_id, moduleId],
              )
            ).rows[0].n,
          ) + 1;
      }
      const id = randomUUID(),
        content = {
          ...input,
          targets: await refs(db, req.actor.tenant_id, input),
          items: input.items.map((item, i) => ({ ...item, position: i + 1 })),
        };
      await db.query(
        'INSERT INTO sop_templates(id,tenant_id,module_id,version,content,checksum,author_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
      await db.query(
        'INSERT INTO sop_template_branches(tenant_id,template_version_id,branch_id) SELECT $1,$2,UNNEST($3::uuid[])',
        [req.actor.tenant_id, id, input.branch_ids],
      );
      await db.query(
        'INSERT INTO sop_template_jobs(tenant_id,template_version_id,job_id) SELECT $1,$2,UNNEST($3::uuid[])',
        [req.actor.tenant_id, id, input.job_ids],
      );
      await audit(
        db,
        req.actor,
        req.correlationId,
        previous ? 'sop_template.revised' : 'sop_template.created',
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
      if (status === 'published') {
        const draft = (
          await db.query(
            "SELECT content FROM sop_templates WHERE tenant_id=$1 AND id=$2 AND status='draft' FOR UPDATE",
            [req.actor.tenant_id, id],
          )
        ).rows[0];
        if (!draft) throw new ConflictException('Draft template SOP tidak tersedia.');
        const { targets, items, ...fields } = draft.content;
        const input = schema.parse({
          ...fields,
          items: items.map(({ position, ...item }: any) => item),
        });
        await refs(db, req.actor.tenant_id, input);
      }
      const row = (
        await db.query(
          `UPDATE sop_templates SET status=$1,published_at=CASE WHEN $1='published' THEN now() ELSE published_at END WHERE tenant_id=$2 AND id=$3 AND status=$4 RETURNING id`,
          [status, req.actor.tenant_id, id, status === 'published' ? 'draft' : 'published'],
        )
      ).rows[0];
      if (!row)
        throw new ConflictException(
          'Versi template SOP tidak tersedia untuk perubahan status ini.',
        );
      await audit(db, req.actor, req.correlationId, 'sop_template.' + status, id);
      return { id, status };
    });
  }
}
