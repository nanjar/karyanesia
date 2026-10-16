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
import { Database } from './database';
import { SessionGuard } from './security';
import { admins, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
import { youtubeId } from './youtube';
const text = z.string().trim().min(1).max(500);
const contentSchema = z
  .strictObject({
    video_url: z
      .string()
      .max(2048)
      .refine((v) => youtubeId(v) !== null, 'Gunakan tautan HTTPS YouTube yang valid.')
      .transform((v) => `https://www.youtube.com/watch?v=${youtubeId(v)}`)
      .optional(),
    title: text,
    objective: text,
    transcript: z.string().trim().min(1).max(20000),
    pass_score: z.number().int().min(1).max(100).default(80),
    questions: z
      .array(
        z.strictObject({
          prompt: text,
          options: z.array(text).min(2).max(5),
          correct: z.number().int().min(0).max(4),
        }),
      )
      .min(1)
      .max(5),
  })
  .refine(
    (v) => v.questions.every((q) => q.correct < q.options.length),
    'Indeks jawaban tidak sesuai opsi',
  );
function manage(req: ApiRequest) {
  if (!admins(req.actor)) throw new ForbiddenException('Hanya admin dapat mengelola materi.');
}
function visible(row: any, admin: boolean) {
  const { content, ...meta } = row;
  return {
    ...meta,
    content: admin
      ? content
      : { ...content, questions: content.questions.map(({ correct, ...q }: any) => q) },
  };
}
@Controller('learning')
@UseGuards(SessionGuard)
export class LearningController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest) {
    const r = await this.db.query(
      `SELECT id,module_id,version,status,content->>'title' AS title,created_at,published_at FROM learning_versions WHERE tenant_id=$1 AND ($2 OR status='published') ORDER BY created_at DESC,id LIMIT 100`,
      [req.actor.tenant_id, admins(req.actor)],
    );
    return { items: r.rows };
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    manage(req);
    const content = contentSchema.parse(body),
      id = randomUUID(),
      moduleId = randomUUID();
    await this.db.transaction(async (db) => {
      await db.query(
        `INSERT INTO learning_versions(id,tenant_id,module_id,version,content,checksum,author_id) VALUES($1,$2,$3,1,$4,$5,$6)`,
        [
          id,
          req.actor.tenant_id,
          moduleId,
          JSON.stringify(content),
          digest(JSON.stringify(content)),
          req.actor.id,
        ],
      );
      await audit(db, req.actor, req.correlationId, 'learning.draft_created', id);
    });
    return { id };
  }
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw),
      a = req.actor;
    const row = (
      await this.db.query(
        `SELECT * FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND ($3 OR status='published')`,
        [a.tenant_id, id, admins(a)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Materi tidak ditemukan.');
    const attempts = (
      await this.db.query(
        `SELECT id,result,created_at FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3 ORDER BY created_at,id`,
        [a.tenant_id, a.id, id],
      )
    ).rows;
    return { ...visible(row, admins(a)), attempts };
  }
  @Post(':id/revise') async revise(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    manage(req);
    const id = z.uuid().parse(raw),
      content = contentSchema.parse(body),
      newId = randomUUID();
    await this.db.transaction(async (db) => {
      // Serialize version numbering within this tenant.
      await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [req.actor.tenant_id]);
      const old = (
        await db.query('SELECT module_id FROM learning_versions WHERE tenant_id=$1 AND id=$2', [
          req.actor.tenant_id,
          id,
        ])
      ).rows[0];
      if (!old) throw new NotFoundException('Materi tidak ditemukan.');
      await db.query(
        `INSERT INTO learning_versions(id,tenant_id,module_id,version,content,checksum,author_id) SELECT $1,$2,$3,MAX(version)+1,$4,$5,$6 FROM learning_versions WHERE tenant_id=$2 AND module_id=$3`,
        [
          newId,
          req.actor.tenant_id,
          old.module_id,
          JSON.stringify(content),
          digest(JSON.stringify(content)),
          req.actor.id,
        ],
      );
      await audit(db, req.actor, req.correlationId, 'learning.revised', newId, {
        previous_version_id: id,
      });
    });
    return { id: newId };
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
          `UPDATE learning_versions SET status='published',published_at=now() WHERE tenant_id=$1 AND id=$2 AND status='draft' RETURNING id`,
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Draft tidak tersedia untuk diterbitkan.');
      await audit(db, req.actor, req.correlationId, 'learning.published', id);
    });
    return { id, status: 'published' };
  }
  @Post(':id/archive')
  async archive(@Req() req: ApiRequest, @Param('id') raw: string, @Body() body: unknown) {
    manage(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    await this.db.transaction(async (db) => {
      const row = (
        await db.query(
          "UPDATE learning_versions SET status='archived' WHERE tenant_id=$1 AND id=$2 AND status='published' RETURNING id",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Versi terbit tidak tersedia untuk diarsipkan.');
      await audit(db, req.actor, req.correlationId, 'learning.archived', id);
    });
    return { id, status: 'archived' };
  }
  @Post(':id/attempts') async submit(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      input = z
        .strictObject({
          idempotency_key: z.uuid(),
          answers: z.array(z.number().int().min(0).max(4)).min(1).max(5),
        })
        .parse(body),
      a = req.actor;
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        a.tenant_id,
        a.id,
      ]);
      const previous = (
        await db.query(
          'SELECT version_id,answers,result FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND idempotency_key=$3',
          [a.tenant_id, a.id, input.idempotency_key],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.version_id !== id ||
          JSON.stringify(previous.answers) !== JSON.stringify(input.answers)
        )
          throw new ConflictException('Kunci pengiriman sudah digunakan untuk jawaban lain.');
        return previous.result;
      }
      const row = (
        await db.query(
          `SELECT content FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND status='published'`,
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Materi terbit tidak ditemukan.');
      const content = contentSchema.parse(row.content);
      if (
        input.answers.length !== content.questions.length ||
        input.answers.some((v, i) => v >= content.questions[i].options.length)
      )
        throw new ConflictException('Jawab seluruh soal dengan opsi yang tersedia.');
      const count = Number(
        (
          await db.query(
            'SELECT count(*) AS n FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3',
            [a.tenant_id, a.id, id],
          )
        ).rows[0].n,
      );
      if (count >= 3)
        throw new ConflictException(
          'Batas tiga percobaan tercapai. Pembukaan ulang oleh supervisor belum tersedia.',
        );
      const correct = content.questions.filter((q, i) => q.correct === input.answers[i]).length,
        score = (correct / content.questions.length) * 100;
      const result = {
        id: randomUUID(),
        correct,
        total: content.questions.length,
        score,
        passed: score >= content.pass_score,
        attempt: count + 1,
        practice_status: 'not_assessed',
      };
      await db.query(
        'INSERT INTO learning_attempts(id,tenant_id,version_id,membership_id,idempotency_key,answers,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          result.id,
          a.tenant_id,
          id,
          a.id,
          input.idempotency_key,
          JSON.stringify(input.answers),
          JSON.stringify(result),
        ],
      );
      await audit(db, a, req.correlationId, 'learning.theory_submitted', result.id, {
        version_id: id,
        score,
        passed: result.passed,
      });
      return result;
    });
  }
}
