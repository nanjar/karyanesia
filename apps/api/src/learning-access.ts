import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Executor } from './database';
import { Actor } from './types';
export type LearningGate = { allowed: boolean; reason: string | null };
export function stepLearningGate(
  task: any,
  step: any,
  started: boolean,
  theory: Set<string>,
  practice: Set<number>,
): LearningGate {
  if (task.status === 'cancelled') return { allowed: false, reason: 'Tugas sudah dibatalkan.' };
  if (!started) return { allowed: false, reason: 'Tanggal mulai tugas belum tiba.' };
  const seen = new Set<number>();
  let prerequisite = step.prerequisite;
  while (prerequisite !== null && prerequisite !== undefined) {
    if (seen.has(prerequisite))
      return { allowed: false, reason: 'Rantai prasyarat tidak valid. Hubungi admin.' };
    seen.add(prerequisite);
    const previous = task.snapshot.steps.find((s: any) => s.position === prerequisite);
    if (!previous || !theory.has(previous.version_id) || !practice.has(previous.position))
      return {
        allowed: false,
        reason: `Selesaikan teori dan praktik langkah ${prerequisite} terlebih dahulu.`,
      };
    prerequisite = previous.prerequisite;
  }
  return { allowed: true, reason: null };
}
export async function learningGates(
  db: Executor,
  a: Actor,
  ids: string[],
  assignmentId?: string,
  lock = false,
) {
  const rows = (
    await db.query(
      `SELECT t.*,now()>=(t.start_date::timestamp AT TIME ZONE t.timezone) AS started FROM onboarding_assignments t WHERE t.tenant_id=$1 AND t.membership_id=$2 AND ((t.status='assigned' AND EXISTS(SELECT 1 FROM jsonb_array_elements(t.snapshot->'steps') step WHERE step->>'version_id'=ANY($3::text[]))) OR t.id=$4::uuid) ORDER BY t.created_at,t.id ${lock ? 'FOR SHARE' : ''}`,
      [a.tenant_id, a.id, ids, assignmentId ?? null],
    )
  ).rows;
  if (assignmentId && !rows.some((t) => t.id === assignmentId))
    throw new NotFoundException('Tugas tidak ditemukan.');
  const versions = [
    ...new Set<string>(rows.flatMap((t) => t.snapshot.steps.map((s: any) => s.version_id))),
  ];
  const theory = versions.length
    ? new Set<string>(
        (
          await db.query(
            "SELECT DISTINCT version_id FROM learning_attempts WHERE tenant_id=$1 AND membership_id=$2 AND version_id=ANY($3::uuid[]) AND (result->>'passed')::boolean",
            [a.tenant_id, a.id, versions],
          )
        ).rows.map((r) => r.version_id),
      )
    : new Set<string>();
  const assessed = rows.length
    ? (
        await db.query(
          'SELECT DISTINCT ON (assignment_id,step_position) assignment_id,step_position,outcome FROM practice_assessments WHERE tenant_id=$1 AND assignment_id=ANY($2::uuid[]) ORDER BY assignment_id,step_position,sequence DESC',
          [a.tenant_id, rows.map((t) => t.id)],
        )
      ).rows
    : [];
  const gates = new Map<string, LearningGate>();
  for (const id of ids) {
    const matches = rows.filter(
      (t) =>
        (!assignmentId || t.id === assignmentId) &&
        t.snapshot.steps.some((s: any) => s.version_id === id),
    );
    if (assignmentId && !matches.length)
      throw new NotFoundException('Versi modul bukan bagian dari tugas ini.');
    const choices = matches.map((t) =>
      stepLearningGate(
        t,
        t.snapshot.steps.find((s: any) => s.version_id === id),
        t.started,
        theory,
        new Set(
          assessed
            .filter((r) => r.assignment_id === t.id && r.outcome === 'competent')
            .map((r) => r.step_position),
        ),
      ),
    );
    gates.set(id, choices.find((g) => g.allowed) ?? choices[0] ?? { allowed: true, reason: null });
  }
  return gates;
}
export async function assertLearningAccess(
  db: Executor,
  a: Actor,
  id: string,
  assignmentId?: string,
) {
  const gate = (await learningGates(db, a, [id], assignmentId, true)).get(id)!;
  if (!gate.allowed) throw new ForbiddenException(gate.reason!);
}
