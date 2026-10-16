import { stepLearningGate } from './learning-access';
import { Executor } from './database';
/** Read model only: immutable quiz evidence never changes assignment snapshots. */
export async function assignmentProgress(db: Executor, tenant: string, assignments: any[]) {
  if (!assignments.length) return [];
  const wanted = assignments.flatMap((a) =>
    a.snapshot.steps.map((s: any) => ({
      assignment_id: a.id,
      membership_id: a.membership_id,
      version_id: s.version_id,
    })),
  );
  const evidence = (
    await db.query(
      `SELECT wanted.assignment_id,t.version_id,COUNT(*) AS attempts,
    MAX((t.result->>'score')::numeric) AS best_score,
    MIN(t.created_at) FILTER (WHERE (t.result->>'passed')::boolean) AS passed_at
    FROM jsonb_to_recordset($2::jsonb) AS wanted(assignment_id uuid,membership_id uuid,version_id uuid)
    JOIN onboarding_assignments a ON a.tenant_id=$1 AND a.id=wanted.assignment_id AND a.membership_id=wanted.membership_id
    JOIN learning_attempts t ON t.tenant_id=$1 AND t.membership_id=wanted.membership_id AND t.version_id=wanted.version_id
    AND (a.cancelled_at IS NULL OR t.created_at<=a.cancelled_at)
    GROUP BY wanted.assignment_id,t.version_id`,
      [tenant, JSON.stringify(wanted)],
    )
  ).rows;
  const index = new Map(evidence.map((r) => [r.assignment_id + ':' + r.version_id, r]));
  const ids = [...new Set(wanted.map((w) => w.version_id))];
  const versions = (
    await db.query(
      'SELECT id,status FROM learning_versions WHERE tenant_id=$1 AND id=ANY($2::uuid[])',
      [tenant, ids],
    )
  ).rows;
  const availability = new Map(versions.map((r) => [r.id, r.status === 'published']));
  const assessments = (
    await db.query(
      `SELECT DISTINCT ON (assignment_id,step_position) assignment_id,step_position,id,outcome,sequence FROM practice_assessments WHERE tenant_id=$1 AND assignment_id=ANY($2::uuid[]) ORDER BY assignment_id,step_position,sequence DESC`,
      [tenant, assignments.map((a) => a.id)],
    )
  ).rows;
  const practice = new Map(assessments.map((r) => [r.assignment_id + ':' + r.step_position, r]));
  const requests = (
    await db.query(
      `SELECT DISTINCT ON (r.assignment_id,r.step_position) r.id,r.assignment_id,r.step_position,r.kind,r.reason,r.sequence,r.created_at,p.id AS answer_assessment_id FROM practice_requests r LEFT JOIN practice_assessments p ON p.tenant_id=r.tenant_id AND p.request_id=r.id WHERE r.tenant_id=$1 AND r.assignment_id=ANY($2::uuid[]) ORDER BY r.assignment_id,r.step_position,r.sequence DESC`,
      [tenant, assignments.map((a) => a.id)],
    )
  ).rows;
  const latestRequest = new Map(requests.map((r) => [r.assignment_id + ':' + r.step_position, r]));
  const startRows = (
    await db.query(
      'SELECT id,now()>=(start_date::timestamp AT TIME ZONE timezone) AS started FROM onboarding_assignments WHERE tenant_id=$1 AND id=ANY($2::uuid[])',
      [tenant, assignments.map((a) => a.id)],
    )
  ).rows;
  const started = new Map(startRows.map((r) => [r.id, r.started]));
  return assignments.map((a) => {
    const theoryForTask = new Set<string>(
      a.snapshot.steps
        .filter((s: any) => index.get(a.id + ':' + s.version_id)?.passed_at)
        .map((s: any) => s.version_id),
    );
    const practiceForTask = new Set<number>(
      a.snapshot.steps
        .filter((s: any) => practice.get(a.id + ':' + s.position)?.outcome === 'competent')
        .map((s: any) => s.position),
    );
    const steps = a.snapshot.steps.map((s: any) => {
      const gate = stepLearningGate(
        a,
        s,
        started.get(a.id) === true,
        theoryForTask,
        practiceForTask,
      );
      const result = index.get(a.id + ':' + s.version_id);
      const observation = practice.get(a.id + ':' + s.position);
      const competent = observation?.outcome === 'competent';
      const request = latestRequest.get(a.id + ':' + s.position);
      return {
        position: s.position,
        version_id: s.version_id,
        theory_status: result?.passed_at ? 'passed' : result ? 'needs_review' : 'not_started',
        attempts: result ? Number(result.attempts) : 0,
        best_score: result ? Number(result.best_score) : null,
        passed_at: result?.passed_at ?? null,
        practice_status: observation?.outcome ?? 'not_assessed',
        latest_assessment_id: observation?.id ?? null,
        assessment_sequence: observation?.sequence ?? 0,
        practice_request: request
          ? {
              id: request.id,
              kind: request.kind,
              reason: request.reason,
              sequence: request.sequence,
              created_at: request.created_at,
              status: request.answer_assessment_id
                ? 'answered'
                : a.status === 'cancelled'
                  ? 'cancelled'
                  : 'pending',
              answer_assessment_id: request.answer_assessment_id,
            }
          : null,
        module_available: availability.get(s.version_id) === true,
        practice_eligible: gate.allowed && Boolean(s.practice_rubric) && Boolean(result?.passed_at),
        learning_available: availability.get(s.version_id) === true && gate.allowed,
        learning_locked_reason:
          availability.get(s.version_id) !== true ? 'Versi materi telah diarsipkan.' : gate.reason,
        overdue:
          a.status !== 'cancelled' &&
          !(result?.passed_at && competent) &&
          new Date(s.due_at).getTime() <= Date.now(),
      };
    });
    const theoryPassed = steps.filter((s: any) => s.theory_status === 'passed').length;
    const practicePassed = steps.filter((s: any) => s.practice_status === 'competent').length;
    const completedSteps = steps.filter(
      (s: any) => s.practice_status === 'competent' && s.theory_status === 'passed',
    ).length;
    const status =
      a.status === 'cancelled'
        ? 'cancelled'
        : completedSteps === steps.length
          ? 'completed'
          : theoryPassed === steps.length
            ? 'awaiting_assessment'
            : steps.some((s: any) => s.attempts > 0)
              ? 'in_progress'
              : 'assigned';
    return {
      ...a,
      status,
      progress: {
        theory_passed: theoryPassed,
        total: steps.length,
        practice_passed: practicePassed,
        completed_steps: completedSteps,
        overdue: steps.some((s: any) => s.overdue),
        steps,
      },
    };
  });
}
