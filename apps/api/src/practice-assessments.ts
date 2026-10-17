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
import { admins, assessors, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
import { stepLearningGate } from './learning-access';
import { assignmentProgress } from './onboarding-progress';
const schema = z.strictObject({
  evidence: z
    .array(z.strictObject({ asset_id: z.uuid(), alt: z.string().trim().min(1).max(500) }))
    .max(5)
    .default([]),
  step_position: z.number().int().min(1).max(20),
  answers: z
    .array(z.strictObject({ position: z.number().int().min(1).max(20), passed: z.boolean() }))
    .min(1)
    .max(20),
  comment: z.string().trim().min(10).max(2000),
  training_instructions: z.string().trim().max(2000).default(''),
  correction_reason: z.string().trim().max(1000).default(''),
  supersedes: z.uuid().nullable().default(null),
  idempotency_key: z.uuid(),
});
export async function scopedPracticeAssignment(
  db: Executor,
  req: ApiRequest,
  id: string,
  write = false,
) {
  const a = req.actor;
  const row = (
    await db.query(
      `SELECT t.* FROM onboarding_assignments t JOIN memberships m ON m.tenant_id=t.tenant_id AND m.id=t.membership_id WHERE t.tenant_id=$1 AND t.id=$2 AND ($3 OR t.membership_id=$4 OR ($5 AND m.branch_id=ANY($6::uuid[])))`,
      [
        a.tenant_id,
        id,
        admins(a),
        a.id,
        ['SUPERVISOR', 'HR', 'OPERATIONS'].includes(a.role) || a.assessor === true,
        a.scopes,
      ],
    )
  ).rows[0];
  if (!row) throw new NotFoundException('Tugas tidak ditemukan dalam scope Anda.');
  if (write) {
    const member = (
      await db.query(
        'SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 AND active AND EXISTS(SELECT 1 FROM users u WHERE u.id=memberships.user_id AND u.active) AND ($3 OR branch_id=ANY($4::uuid[])) FOR SHARE',
        [a.tenant_id, row.membership_id, admins(a), a.scopes],
      )
    ).rows[0];
    if (!member) throw new NotFoundException('Staf tidak aktif atau di luar scope.');
    return (
      await db.query(
        'SELECT *,start_date::text AS start_date FROM onboarding_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [a.tenant_id, id],
      )
    ).rows[0];
  }
  return row;
}
@Controller('onboarding-assignments')
@UseGuards(SessionGuard)
export class PracticeAssessmentsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get(':id/assessments') async history(@Req() req: ApiRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw);
    await scopedPracticeAssignment(this.db, req, id);
    return {
      items: (
        await this.db.query(
          `SELECT p.id,p.step_position,p.rubric_version_id,p.sequence,p.supersedes,p.answers,p.comment,p.training_instructions,p.correction_reason,p.outcome,p.request_id,p.evidence,p.created_at,u.full_name AS assessor_name FROM practice_assessments p JOIN memberships m ON m.tenant_id=p.tenant_id AND m.id=p.assessor_id JOIN users u ON u.id=m.user_id WHERE p.tenant_id=$1 AND p.assignment_id=$2 ORDER BY p.created_at DESC,p.sequence DESC,p.id LIMIT 100`,
          [req.actor.tenant_id, id],
        )
      ).rows,
    };
  }
  @Post(':id/assessments') async assess(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor;
    if (!assessors(a)) throw new ForbiddenException('Akses penilai diperlukan.');
    const id = z.uuid().parse(raw),
      input = schema.parse(body),
      hash = digest(
        id +
          ':' +
          JSON.stringify(
            input.evidence.length ? input : (({ evidence, ...legacy }) => legacy)(input),
          ),
      );
    return this.db.transaction(async (db) => {
      const task = await scopedPracticeAssignment(db, req, id, true);
      if (task.membership_id === a.id)
        throw new ForbiddenException('Tidak boleh menilai diri sendiri.');
      const previousKey = (
        await db.query(
          'SELECT id,sequence,outcome,supersedes,rubric_version_id,request_id,input_hash FROM practice_assessments WHERE tenant_id=$1 AND assessor_id=$2 AND idempotency_key=$3',
          [a.tenant_id, a.id, input.idempotency_key],
        )
      ).rows[0];
      if (previousKey) {
        const { input_hash, ...result } = previousKey;
        if (input_hash !== hash)
          throw new ConflictException('Kunci pengiriman digunakan untuk isi lain.');
        return result;
      }
      for (const image of input.evidence) {
        if (
          !(
            await db.query(
              "SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2 AND assignment_id=$3 AND purpose='practice'",
              [a.tenant_id, image.asset_id, id],
            )
          ).rows.length
        )
          throw new ConflictException('Bukti praktik tidak sesuai tugas.');
      }
      if (task.status === 'cancelled') throw new ConflictException('Tugas sudah dibatalkan.');
      if (
        (
          await db.query('SELECT now() < ($1::date::timestamp AT TIME ZONE $2) AS early', [
            task.start_date,
            task.timezone,
          ])
        ).rows[0].early
      )
        throw new ConflictException('Tanggal mulai tugas belum tiba.');
      const step = task.snapshot.steps.find((s: any) => s.position === input.step_position),
        rubric = step?.practice_rubric;
      if (!rubric) throw new ConflictException('Langkah ini belum memiliki rubrik pada snapshot.');
      const progress = (await assignmentProgress(db, a.tenant_id, [task]))[0];
      if (progress.progress.steps[input.step_position - 1].theory_status !== 'passed')
        throw new ConflictException('Teori langkah ini harus lulus sebelum praktik disahkan.');
      const gate = stepLearningGate(
        task,
        step,
        true,
        new Set(
          progress.progress.steps
            .filter((s: any) => s.theory_status === 'passed')
            .map((s: any) => s.version_id),
        ),
        new Set(
          progress.progress.steps
            .filter((s: any) => s.practice_status === 'competent')
            .map((s: any) => s.position),
        ),
      );
      if (!gate.allowed) throw new ConflictException(gate.reason!);
      const old = (
        await db.query(
          'SELECT id,sequence FROM practice_assessments WHERE tenant_id=$1 AND assignment_id=$2 AND step_position=$3 ORDER BY sequence DESC LIMIT 1',
          [a.tenant_id, id, input.step_position],
        )
      ).rows[0];
      if ((old?.id ?? null) !== input.supersedes)
        throw new ConflictException(
          'Histori berubah. Muat ulang hasil terbaru sebelum mengesahkan.',
        );
      if (old && input.correction_reason.length < 10)
        throw new ConflictException('Penilaian ulang wajib alasan minimal 10 karakter.');
      const answers = new Map(input.answers.map((v) => [v.position, v.passed]));
      if (
        answers.size !== input.answers.length ||
        answers.size !== rubric.items.length ||
        rubric.items.some((item: any) => !answers.has(item.position))
      )
        throw new ConflictException('Jawab tepat seluruh item pada versi rubrik tugas.');
      const outcome = rubric.items.every(
        (item: any) => (!item.required && !item.critical) || answers.get(item.position) === true,
      )
        ? 'competent'
        : 'needs_practice';
      if (outcome === 'needs_practice' && input.training_instructions.length < 10)
        throw new ConflictException(
          'Hasil belum kompeten wajib menyertakan arahan latihan minimal 10 karakter.',
        );
      const pending = (
        await db.query(
          'SELECT r.id FROM practice_requests r LEFT JOIN practice_assessments p ON p.tenant_id=r.tenant_id AND p.request_id=r.id WHERE r.tenant_id=$1 AND r.assignment_id=$2 AND r.step_position=$3 AND p.id IS NULL ORDER BY r.sequence DESC LIMIT 1',
          [a.tenant_id, id, input.step_position],
        )
      ).rows[0];
      const result = {
        id: randomUUID(),
        sequence: (old?.sequence ?? 0) + 1,
        outcome,
        supersedes: input.supersedes,
        rubric_version_id: rubric.id,
        request_id: pending?.id ?? null,
      };
      await db.query(
        'INSERT INTO practice_assessments(id,tenant_id,assignment_id,membership_id,assessor_id,step_position,rubric_version_id,sequence,supersedes,answers,comment,training_instructions,correction_reason,outcome,idempotency_key,input_hash,request_id,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
        [
          result.id,
          a.tenant_id,
          id,
          task.membership_id,
          a.id,
          input.step_position,
          rubric.id,
          result.sequence,
          input.supersedes,
          JSON.stringify(input.answers),
          input.comment,
          input.training_instructions,
          input.correction_reason,
          outcome,
          input.idempotency_key,
          hash,
          result.request_id,
          JSON.stringify(input.evidence),
        ],
      );
      await audit(db, a, req.correlationId, 'practice_assessment.signed', result.id, {
        assignment_id: id,
        step_position: input.step_position,
        outcome,
        supersedes: input.supersedes,
        rubric_version_id: rubric.id,
        request_id: result.request_id,
      });
      return result;
    });
  }
}
