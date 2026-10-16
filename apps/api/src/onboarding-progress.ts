import { Executor } from './database';
/** Read model only: immutable quiz evidence never changes assignment snapshots. */
export async function assignmentProgress(db: Executor, tenant: string, assignments: any[]) {
  if (!assignments.length) return [];
  const wanted = assignments.flatMap((a) =>
    a.snapshot.steps.map((s: any) => ({
      assignment_id: a.id,
      membership_id: a.membership_id,
      version_id: s.version_id,
      cutoff: a.status === 'cancelled' ? a.cancelled_at : null,
    })),
  );
  const evidence = (
    await db.query(
      `SELECT wanted.assignment_id,t.version_id,COUNT(*) AS attempts,
    MAX((t.result->>'score')::numeric) AS best_score,
    MIN(t.created_at) FILTER (WHERE (t.result->>'passed')::boolean) AS passed_at
    FROM jsonb_to_recordset($2::jsonb) AS wanted(assignment_id uuid,membership_id uuid,version_id uuid,cutoff timestamptz)
    JOIN learning_attempts t ON t.tenant_id=$1 AND t.membership_id=wanted.membership_id AND t.version_id=wanted.version_id
    AND (wanted.cutoff IS NULL OR t.created_at<=wanted.cutoff)
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
  return assignments.map((a) => {
    const steps = a.snapshot.steps.map((s: any) => {
      const result = index.get(a.id + ':' + s.version_id);
      return {
        position: s.position,
        version_id: s.version_id,
        theory_status: result?.passed_at ? 'passed' : result ? 'needs_review' : 'not_started',
        attempts: result ? Number(result.attempts) : 0,
        best_score: result ? Number(result.best_score) : null,
        passed_at: result?.passed_at ?? null,
        practice_status: 'not_assessed',
        module_available: availability.get(s.version_id) === true,
        overdue: a.status !== 'cancelled' && new Date(s.due_at).getTime() <= Date.now(),
      };
    });
    const theoryPassed = steps.filter((s: any) => s.theory_status === 'passed').length;
    const status =
      a.status === 'cancelled'
        ? 'cancelled'
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
        practice_passed: 0,
        completed_steps: 0,
        overdue: steps.some((s: any) => s.overdue),
        steps,
      },
    };
  });
}
