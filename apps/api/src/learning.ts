import { cursor, beforeCursor } from './pagination';
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
  Query,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database, Executor } from './database';
import { SessionGuard } from './security';
import { admins, authors, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
import { assertLearningAccess, learningGates } from './learning-access';
import { validateLearningAssets } from './media';
import { youtubeId } from './youtube';
const text = z.string().trim().min(1).max(500);
const imageRef = z.strictObject({ asset_id: z.uuid(), alt: z.string().trim().min(1).max(500) });
const contentSchema = z
  .strictObject({
    video_url: z
      .string()
      .max(2048)
      .refine((v) => youtubeId(v) !== null, 'Gunakan tautan HTTPS YouTube yang valid.')
      .transform((v) => `https://www.youtube.com/watch?v=${youtubeId(v)}`)
      .optional(),
    youtube_video_id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{11}$/)
      .optional(),
    description: z.string().trim().max(2000).default(''),
    target_job_ids: z.array(z.uuid()).max(100).default([]),
    competency_ids: z.array(z.uuid()).max(50).default([]),
    images: z.array(imageRef).max(10).default([]),
    video_duration_seconds: z.number().int().min(1).max(300).optional(),
    title: text,
    objective: text,
    transcript: z.string().trim().min(1).max(20000),
    pass_score: z.number().int().min(1).max(100).default(80),
    questions: z
      .array(
        z.strictObject({
          prompt: text,
          prompt_image: imageRef.optional(),
          option_images: z.array(imageRef.nullable()).max(5).optional(),
          options: z.array(text).min(2).max(5),
          correct: z.number().int().min(0).max(4),
        }),
      )
      .min(1)
      .max(5),
  })
  .refine(
    (v) =>
      v.questions.every(
        (q) =>
          q.correct < q.options.length &&
          (!q.option_images || q.option_images.length === q.options.length),
      ),
    'Indeks jawaban tidak sesuai opsi',
  )
  .transform((v) => ({
    ...v,
    ...(v.video_url ? { youtube_video_id: youtubeId(v.video_url)! } : {}),
  }));
function manage(req: ApiRequest) {
  if (!authors(req.actor)) throw new ForbiddenException('Hanya admin dapat mengelola materi.');
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
async function budget(db: Executor, tenant: string, member: string, version: string) {
  const round = Number(
    (
      await db.query(
        'SELECT COALESCE(MAX(round),1) AS n FROM learning_resets WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3',
        [tenant, member, version],
      )
    ).rows[0].n,
  );
  const attempts = (
    await db.query(
      'SELECT result FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3 AND round=$4',
      [tenant, member, version, round],
    )
  ).rows;
  return {
    round,
    used: attempts.length,
    remaining: Math.max(0, 3 - attempts.length),
    passed: attempts.some((v) => v.result.passed === true),
  };
}
function assessor(req: ApiRequest) {
  if (!authors(req.actor) && req.actor.role !== 'SUPERVISOR')
    throw new ForbiddenException('Akses supervisor diperlukan.');
}
@Controller('learning')
@UseGuards(SessionGuard)
export class LearningController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    const r = await this.db.query(
      `SELECT id,module_id,version,status,content->>'title' AS title,created_at,published_at FROM learning_versions WHERE tenant_id=$1 AND ($2 OR status='published') ${beforeCursor('learning_versions', 3)} ORDER BY created_at DESC,id DESC LIMIT 100`,
      [req.actor.tenant_id, authors(req.actor), cursor(after) || null],
    );
    const gates = authors(req.actor)
      ? null
      : await learningGates(
          this.db,
          req.actor,
          r.rows.map((row) => row.id),
        );
    return {
      items: r.rows.map((row) => ({
        ...row,
        learning_available: gates?.get(row.id)?.allowed ?? true,
        learning_locked_reason: gates?.get(row.id)?.reason ?? null,
      })),
    };
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    manage(req);
    const content = contentSchema.parse(body),
      id = randomUUID(),
      moduleId = randomUUID();
    await this.db.transaction(async (db) => {
      await validateLearningAssets(db, req.actor.tenant_id, content);
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
  @Get(':id') async detail(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Query('assignment_id') context?: string,
  ) {
    const assignmentId = z.uuid().optional().parse(context);
    const id = z.uuid().parse(raw),
      a = req.actor;
    const row = (
      await this.db.query(
        `SELECT * FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND ($3 OR status='published')`,
        [a.tenant_id, id, authors(a)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Materi tidak ditemukan.');
    if (!authors(a) || assignmentId) await assertLearningAccess(this.db, a, id, assignmentId);
    const attempts = (
      await this.db.query(
        `SELECT id,result,round,created_at FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3 ORDER BY created_at,id`,
        [a.tenant_id, a.id, id],
      )
    ).rows;
    return {
      ...visible(row, authors(a)),
      attempts,
      budget: await budget(this.db, a.tenant_id, a.id, id),
      resets: (
        await this.db.query(
          'SELECT round,reason,created_at FROM learning_resets WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3 ORDER BY round',
          [a.tenant_id, a.id, id],
        )
      ).rows,
    };
  }
  @Get(':id/blocked') async blocked(@Req() req: ApiRequest, @Param('id') raw: string) {
    assessor(req);
    const id = z.uuid().parse(raw),
      a = req.actor;
    const rows = (
      await this.db.query(
        `SELECT m.id,m.employee_number,u.full_name,COALESCE(r.round,1) AS round
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN (SELECT membership_id,MAX(round) AS round FROM learning_resets WHERE tenant_id=$1 AND version_id=$2 GROUP BY membership_id) r ON r.membership_id=m.id
      WHERE m.tenant_id=$1 AND m.active AND u.active AND m.role='STAFF' AND m.id<>$3 AND ($4 OR m.branch_id=ANY($5::uuid[]))
      AND EXISTS(SELECT 1 FROM learning_versions v WHERE v.tenant_id=$1 AND v.id=$2 AND v.status='published')
      AND (SELECT count(*) FROM learning_attempts t WHERE t.tenant_id=$1 AND t.version_id=$2 AND t.membership_id=m.id AND t.round=COALESCE(r.round,1))>=3
      AND NOT EXISTS(SELECT 1 FROM learning_attempts t WHERE t.tenant_id=$1 AND t.version_id=$2 AND t.membership_id=m.id AND (t.result->>'passed')::boolean)
      ORDER BY m.employee_number,m.id LIMIT 100`,
        [a.tenant_id, id, a.id, admins(a), a.scopes],
      )
    ).rows;
    return { items: rows };
  }
  @Post(':id/resets') async reset(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    assessor(req);
    const id = z.uuid().parse(raw),
      a = req.actor,
      input = z
        .strictObject({
          membership_id: z.uuid(),
          reason: z.string().trim().min(10).max(1000),
          idempotency_key: z.uuid(),
        })
        .parse(body);
    if (input.membership_id === a.id)
      throw new ForbiddenException('Tidak dapat membuka percobaan sendiri.');
    return this.db.transaction(async (db) => {
      const target = (
        await db.query(
          `SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 AND active AND EXISTS(SELECT 1 FROM users u WHERE u.id=memberships.user_id AND u.active) AND role='STAFF' AND ($3 OR branch_id=ANY($4::uuid[])) FOR UPDATE`,
          [a.tenant_id, input.membership_id, admins(a), a.scopes],
        )
      ).rows[0];
      if (!target) throw new NotFoundException('Staf tidak ditemukan dalam scope Anda.');
      const old = (
        await db.query(
          'SELECT * FROM learning_resets WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3',
          [a.tenant_id, a.id, input.idempotency_key],
        )
      ).rows[0];
      if (old) {
        if (
          old.version_id !== id ||
          old.membership_id !== input.membership_id ||
          old.reason !== input.reason
        )
          throw new ConflictException('Kunci telah digunakan untuk permintaan lain.');
        return { id: old.id, round: old.round };
      }
      if (
        !(
          await db.query(
            "SELECT id FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND status='published'",
            [a.tenant_id, id],
          )
        ).rows[0]
      )
        throw new NotFoundException('Materi terbit tidak ditemukan.');
      const current = await budget(db, a.tenant_id, input.membership_id, id);
      const passed =
        (
          await db.query(
            "SELECT id FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3 AND (result->>'passed')::boolean LIMIT 1",
            [a.tenant_id, input.membership_id, id],
          )
        ).rows.length > 0;
      if (current.used !== 3 || passed)
        throw new ConflictException(
          'Pembukaan ulang hanya untuk staf yang gagal tiga kali dan belum lulus versi ini.',
        );
      const result = { id: randomUUID(), round: current.round + 1 };
      await db.query(
        'INSERT INTO learning_resets(id,tenant_id,version_id,membership_id,actor_id,round,reason,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          result.id,
          a.tenant_id,
          id,
          input.membership_id,
          a.id,
          result.round,
          input.reason,
          input.idempotency_key,
        ],
      );
      await audit(db, a, req.correlationId, 'learning.attempts_reset', result.id, {
        version_id: id,
        membership_id: input.membership_id,
        round: result.round,
        reason: input.reason,
      });
      return result;
    });
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
      await validateLearningAssets(db, req.actor.tenant_id, content);
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
      const draft = (
        await db.query(
          "SELECT content FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND status='draft' FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!draft) throw new ConflictException('Draft tidak tersedia.');
      await validateLearningAssets(db, req.actor.tenant_id, draft.content);
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
          assignment_id: z.uuid().optional(),
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
          'SELECT version_id,assignment_id,answers,result FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND idempotency_key=$3',
          [a.tenant_id, a.id, input.idempotency_key],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.version_id !== id ||
          (previous.assignment_id ?? null) !== (input.assignment_id ?? null) ||
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
      await assertLearningAccess(db, a, id, input.assignment_id);
      const content = contentSchema.parse(row.content);
      if (
        input.answers.length !== content.questions.length ||
        input.answers.some((v, i) => v >= content.questions[i].options.length)
      )
        throw new ConflictException('Jawab seluruh soal dengan opsi yang tersedia.');
      const current = await budget(db, a.tenant_id, a.id, id);
      const count = current.used;
      if (count >= 3)
        throw new ConflictException(
          'Batas tiga percobaan tercapai. Hubungi supervisor untuk pembukaan ulang.',
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
        round: current.round,
        practice_status: 'not_assessed',
      };
      await db.query(
        'INSERT INTO learning_attempts(id,tenant_id,version_id,membership_id,idempotency_key,answers,result,round,assignment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          result.id,
          a.tenant_id,
          id,
          a.id,
          input.idempotency_key,
          JSON.stringify(input.answers),
          JSON.stringify(result),
          current.round,
          input.assignment_id ?? null,
        ],
      );
      await audit(db, a, req.correlationId, 'learning.theory_submitted', result.id, {
        version_id: id,
        assignment_id: input.assignment_id ?? null,
        score,
        passed: result.passed,
      });
      return result;
    });
  }
}
