import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database';
import { SessionGuard } from './security';
import { ApiRequest, admins } from './types';
import { audit } from './audit';
import { digest } from './crypto';
import { assignmentProgress } from './onboarding-progress';
import { scopedPracticeAssignment } from './practice-assessments';
const schema = z.strictObject({
  step_position: z.number().int().min(1).max(20),
  kind: z.enum(['practice', 'review']),
  reason: z.string().trim().min(10).max(2000),
  based_on: z.uuid().nullable().default(null),
  idempotency_key: z.uuid(),
});
@Controller('onboarding-assignments')
@UseGuards(SessionGuard)
export class PracticeRequestsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('practice-queue') async queue(@Req() req: ApiRequest) {
    const a = req.actor;
    if (!admins(a) && a.role !== 'SUPERVISOR')
      throw new ForbiddenException('Akses penilai diperlukan.');
    const rows = (
      await this.db.query(
        `SELECT t.*,t.start_date::text AS start_date,u.full_name,m.employee_number FROM onboarding_assignments t JOIN memberships m ON m.tenant_id=t.tenant_id AND m.id=t.membership_id JOIN users u ON u.id=m.user_id WHERE t.tenant_id=$1 AND t.status<>'cancelled' AND m.active AND u.active AND t.membership_id<>$2 AND ($3 OR m.branch_id=ANY($4::uuid[])) AND EXISTS(SELECT 1 FROM practice_requests r LEFT JOIN practice_assessments p ON p.tenant_id=r.tenant_id AND p.request_id=r.id WHERE r.tenant_id=t.tenant_id AND r.assignment_id=t.id AND p.id IS NULL) ORDER BY t.created_at,t.id LIMIT 100`,
        [a.tenant_id, a.id, admins(a), a.scopes],
      )
    ).rows;
    return { items: await assignmentProgress(this.db, a.tenant_id, rows) };
  }
  @Get(':id/practice-requests') async history(@Req() req: ApiRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw);
    await scopedPracticeAssignment(this.db, req, id);
    return {
      items: (
        await this.db.query(
          `SELECT r.id,r.step_position,r.sequence,r.kind,r.reason,r.based_on,r.created_at,p.id AS answer_assessment_id,CASE WHEN p.id IS NOT NULL THEN 'answered' WHEN t.status='cancelled' THEN 'cancelled' ELSE 'pending' END AS status FROM practice_requests r JOIN onboarding_assignments t ON t.tenant_id=r.tenant_id AND t.id=r.assignment_id LEFT JOIN practice_assessments p ON p.tenant_id=r.tenant_id AND p.request_id=r.id WHERE r.tenant_id=$1 AND r.assignment_id=$2 ORDER BY r.created_at DESC,r.sequence DESC,r.id LIMIT 100`,
          [req.actor.tenant_id, id],
        )
      ).rows,
    };
  }
  @Post(':id/practice-requests') async request(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      input = schema.parse(body),
      a = req.actor,
      hash = digest(id + ':' + JSON.stringify(input));
    return this.db.transaction(async (db) => {
      const task = (
        await db.query(
          'SELECT *,start_date::text AS start_date FROM onboarding_assignments WHERE tenant_id=$1 AND id=$2 AND membership_id=$3 FOR UPDATE',
          [a.tenant_id, id, a.id],
        )
      ).rows[0];
      if (!task)
        throw new NotFoundException(
          'Hanya pemilik tugas dapat mengajukan praktik atau peninjauan.',
        );
      const previous = (
        await db.query(
          'SELECT id,kind,sequence,based_on,input_hash FROM practice_requests WHERE tenant_id=$1 AND membership_id=$2 AND idempotency_key=$3',
          [a.tenant_id, a.id, input.idempotency_key],
        )
      ).rows[0];
      if (previous) {
        const { input_hash, ...result } = previous;
        if (input_hash !== hash)
          throw new ConflictException('Kunci pengiriman digunakan untuk isi lain.');
        return result;
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
      const step = task.snapshot.steps.find((s: any) => s.position === input.step_position);
      if (!step?.practice_rubric)
        throw new ConflictException('Langkah belum memiliki rubrik pada snapshot.');
      const progress = (await assignmentProgress(db, a.tenant_id, [task]))[0],
        state = progress.progress.steps[input.step_position - 1];
      if (state.theory_status !== 'passed')
        throw new ConflictException(
          'Teori langkah harus lulus sebelum mengajukan praktik atau peninjauan.',
        );
      if (
        step.prerequisite &&
        progress.progress.steps[step.prerequisite - 1].practice_status !== 'competent'
      )
        throw new ConflictException('Praktik prasyarat belum kompeten.');
      if (state.latest_assessment_id !== input.based_on)
        throw new ConflictException(
          'Hasil observasi berubah. Muat ulang tugas sebelum mengajukan.',
        );
      if (input.kind === 'review' && !input.based_on)
        throw new ConflictException('Peninjauan memerlukan hasil observasi yang sudah disahkan.');
      if (input.kind === 'practice' && state.practice_status === 'competent')
        throw new ConflictException(
          'Praktik sudah kompeten; gunakan permintaan peninjauan bila diperlukan.',
        );
      const last = (
        await db.query(
          'SELECT r.id,r.sequence,p.id AS answer FROM practice_requests r LEFT JOIN practice_assessments p ON p.tenant_id=r.tenant_id AND p.request_id=r.id WHERE r.tenant_id=$1 AND r.assignment_id=$2 AND r.step_position=$3 ORDER BY r.sequence DESC LIMIT 1',
          [a.tenant_id, id, input.step_position],
        )
      ).rows[0];
      if (last && !last.answer)
        throw new ConflictException('Masih ada pengajuan yang menunggu observasi.');
      const result = {
        id: randomUUID(),
        kind: input.kind,
        sequence: (last?.sequence ?? 0) + 1,
        based_on: input.based_on,
      };
      await db.query(
        'INSERT INTO practice_requests(id,tenant_id,assignment_id,membership_id,step_position,sequence,kind,reason,based_on,idempotency_key,input_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          result.id,
          a.tenant_id,
          id,
          a.id,
          input.step_position,
          result.sequence,
          input.kind,
          input.reason,
          input.based_on,
          input.idempotency_key,
          hash,
        ],
      );
      await audit(db, a, req.correlationId, 'practice_request.submitted', result.id, {
        assignment_id: id,
        step_position: input.step_position,
        kind: input.kind,
        based_on: input.based_on,
      });
      return result;
    });
  }
}
