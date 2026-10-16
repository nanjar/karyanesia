import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Inject,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './database';
import { ApiRequest, admins } from './types';
import { SessionGuard } from './security';
import { audit } from './audit';
import { assignmentProgress } from './onboarding-progress';
import { csvCell } from './staff-imports';
const filters = z
  .strictObject({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    branch_id: z.uuid().optional(),
    job_id: z.uuid().optional(),
    path_version_id: z.uuid().optional(),
    status: z.string().max(40).optional(),
  })
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    'Periode maksimal 366 hari.',
  );
@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(@Inject(Database) private db: Database) {}
  private async report(req: ApiRequest, input: z.infer<typeof filters>) {
    const a = req.actor;
    if (!admins(a) && !['HR', 'OPERATIONS', 'SUPERVISOR'].includes(a.role))
      throw new ForbiddenException();
    if (input.branch_id && !admins(a) && !a.scopes.includes(input.branch_id))
      throw new ForbiddenException();
    const scoped = admins(a) ? null : a.scopes;
    const rows = (
      await this.db.query(
        `SELECT * FROM sop_instances WHERE tenant_id=$1 AND due_at>=$2 AND due_at<$3 AND due_at<=now() AND ($4::uuid[] IS NULL OR branch_id=ANY($4)) AND ($5::uuid IS NULL OR branch_id=$5) AND ($6::uuid IS NULL OR snapshot->'recipient'->>'job_id'=$6::text)`,
        [a.tenant_id, input.from, input.to, scoped, input.branch_id || null, input.job_id || null],
      )
    ).rows;
    const events = (
      await this.db.query(
        'SELECT DISTINCT ON(instance_id) instance_id,state FROM sop_events WHERE tenant_id=$1 AND instance_id=ANY($2::uuid[]) ORDER BY instance_id,revision DESC',
        [a.tenant_id, rows.map((r) => r.id)],
      )
    ).rows;
    const states = new Map(events.map((r) => [r.instance_id, r.state]));
    const detail = rows
      .map((r) => ({ ...r, current: states.get(r.id) || { status: r.status } }))
      .filter((r) => !input.status || r.current.status === input.status);
    const denominator = detail.filter(
      (r) =>
        r.current.status !== 'cancelled' ||
        Date.parse(r.current.reviewed_at) >= new Date(r.starts_at).getTime(),
    );
    const ontime = denominator.filter(
      (r) =>
        r.current.first_submitted_at &&
        Date.parse(r.current.first_submitted_at) <= new Date(r.due_at).getTime(),
    ).length;
    const assignments = (
      await this.db.query(
        `SELECT a.*,a.start_date::text AS start_date FROM onboarding_assignments a WHERE a.tenant_id=$1 AND ($2::uuid[] IS NULL OR a.branch_id=ANY($2)) AND ($3::uuid IS NULL OR a.branch_id=$3) AND ($4::uuid IS NULL OR a.path_version_id=$4) AND ($5::uuid IS NULL OR a.job_id=$5)`,
        [
          a.tenant_id,
          scoped,
          input.branch_id || null,
          input.path_version_id || null,
          input.job_id || null,
        ],
      )
    ).rows;
    const onboarding = (await assignmentProgress(this.db, a.tenant_id, assignments))
      .filter((a) =>
        a.snapshot.steps.some(
          (s: any) =>
            Date.parse(s.due_at) >= Date.parse(input.from) &&
            Date.parse(s.due_at) < Date.parse(input.to),
        ),
      )
      .filter((a) => !input.status || a.status === input.status);
    const issues = (
      await this.db.query(
        `SELECT i.*,COALESCE(e.state->>'status','open') status FROM issues i LEFT JOIN LATERAL(SELECT state FROM issue_events WHERE tenant_id=i.tenant_id AND issue_id=i.id ORDER BY revision DESC LIMIT 1)e ON true WHERE i.tenant_id=$1 AND i.created_at>=$2 AND i.created_at<$3 AND ($4::uuid[] IS NULL OR i.branch_id=ANY($4)) AND ($5::uuid IS NULL OR i.branch_id=$5)`,
        [a.tenant_id, input.from, input.to, scoped, input.branch_id || null],
      )
    ).rows;
    const expired = Number(
      (
        await this.db.query(
          `SELECT count(*)::int n FROM memberships m CROSS JOIN competencies c
 JOIN LATERAL(SELECT MIN(t.created_at) passed_at FROM learning_attempts t WHERE t.tenant_id=$1 AND t.membership_id=m.id AND t.version_id=c.module_version_id AND (t.result->>'passed')::boolean) theory ON theory.passed_at IS NOT NULL
 JOIN LATERAL(SELECT p.created_at,p.outcome FROM practice_assessments p JOIN onboarding_assignments a ON a.tenant_id=p.tenant_id AND a.id=p.assignment_id WHERE p.tenant_id=$1 AND p.membership_id=m.id AND p.rubric_version_id=c.rubric_version_id AND a.status<>'cancelled' AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.snapshot->'steps') s WHERE (s->>'position')::integer=p.step_position AND s->>'version_id'=c.module_version_id::text) ORDER BY p.created_at DESC,p.id DESC LIMIT 1) practice ON practice.outcome='competent'
 WHERE m.tenant_id=$1 AND c.tenant_id=$1 AND m.active AND m.role='STAFF' AND c.content->>'validity_days' IS NOT NULL AND ($4::uuid[] IS NULL OR m.branch_id=ANY($4)) AND ($5::uuid IS NULL OR m.branch_id=$5) AND ($6::uuid IS NULL OR m.job_id=$6)
 AND greatest(theory.passed_at,practice.created_at)+(c.content->>'validity_days')::integer*interval '1 day' BETWEEN $2::timestamptz AND LEAST($3::timestamptz,now())`,
          [
            a.tenant_id,
            input.from,
            input.to,
            scoped,
            input.branch_id || null,
            input.job_id || null,
          ],
        )
      ).rows[0].n,
    );
    const onboardingDenominator = onboarding.filter(
      (r) =>
        r.status !== 'cancelled' ||
        new Date(r.cancelled_at).getTime() >=
          Date.parse(
            r.start_date +
              'T00:00:00' +
              (
                {
                  'Asia/Jakarta': '+07:00',
                  'Asia/Makassar': '+08:00',
                  'Asia/Jayapura': '+09:00',
                } as Record<string, string>
              )[r.timezone],
          ),
    );
    return {
      as_of: new Date().toISOString(),
      filters: input,
      definitions: {
        sop_on_time:
          'Pengajuan lengkap pertama <= tenggat / instance jatuh tempo; cancelled sebelum mulai dikeluarkan.',
        accepted: 'Status review terbaru; accepted bukan bukti kehadiran fisik.',
        onboarding: 'Teori dan praktik wajib snapshot; pembatalan dilaporkan terpisah.',
      },
      summary: {
        sop_due: denominator.length,
        sop_on_time: ontime,
        sop_on_time_percent: denominator.length
          ? Math.round((10000 * ontime) / denominator.length) / 100
          : null,
        sop_accepted: denominator.filter((r) => r.current.status === 'accepted').length,
        sop_accepted_late: denominator.filter(
          (r) =>
            r.current.status === 'accepted' &&
            (!r.current.first_submitted_at ||
              Date.parse(r.current.first_submitted_at) > new Date(r.due_at).getTime()),
        ).length,
        sop_excused: denominator.filter((r) => r.current.status === 'excused').length,
        sop_cancelled: detail.filter((r) => r.current.status === 'cancelled').length,
        sop_unassigned: denominator.filter((r) => r.current.status === 'unassigned').length,
        skills_expired: expired,
        sop_submitted_late: denominator.filter(
          (r) =>
            r.current.first_submitted_at &&
            Date.parse(r.current.first_submitted_at) > new Date(r.due_at).getTime(),
        ).length,
        onboarding_due: onboardingDenominator.length,
        onboarding_completed: onboarding.filter((r) => r.status === 'completed').length,
        onboarding_cancelled: onboarding.filter((r) => r.status === 'cancelled').length,
        theory_failed: onboarding.reduce(
          (n, r) =>
            n + r.progress.steps.filter((s: any) => s.theory_status === 'needs_review').length,
          0,
        ),
        practice_waiting: onboarding.reduce(
          (n, r) =>
            n +
            r.progress.steps.filter(
              (s: any) => s.theory_status === 'passed' && s.practice_status !== 'competent',
            ).length,
          0,
        ),
        issues_open: issues.filter((r) => !['resolved', 'closed'].includes(r.status)).length,
      },
      sop: detail,
      onboarding,
      issues,
    };
  }
  @Get('summary') async summary(@Req() req: ApiRequest, @Query() query: unknown) {
    return this.report(req, filters.parse(query));
  }
  @Post('export') async export(@Req() req: ApiRequest, @Body() body: unknown) {
    if (!admins(req.actor) && !['HR', 'OPERATIONS'].includes(req.actor.role))
      throw new ForbiddenException();
    const report = await this.report(req, filters.parse(body));
    const lines = [
      ['type', 'id', 'status', 'local_date', 'due_at', 'submitted_at'],
      ...report.sop.map((r) => [
        'sop',
        r.id,
        r.current.status,
        String(r.local_date),
        new Date(r.due_at).toISOString(),
        r.current.first_submitted_at || '',
      ]),
      ...report.onboarding.map((r) => ['onboarding', r.id, r.status, String(r.start_date), '', '']),
    ];
    await audit(this.db, req.actor, req.correlationId, 'report.exported', req.actor.id, {
      filters: report.filters,
      rows: lines.length - 1,
    });
    return {
      filename: 'karyanesia-report.csv',
      csv:
        '\uFEFF' + lines.map((line) => line.map((v) => csvCell(String(v))).join(',')).join('\r\n'),
      as_of: report.as_of,
    };
  }
}
