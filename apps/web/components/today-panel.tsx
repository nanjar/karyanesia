'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Task = { id: string; title: string; due: string; zone: string; kind: string; status: string };
export function TodayPanel({
  onError,
  onNavigate,
}: {
  onError: (e: Error) => void;
  onNavigate: (tab: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => {
    void Promise.all([api<any[]>('sop-instances'), api<{ items: any[] }>('onboarding-assignments')])
      .then(([sop, onboarding]) => {
        const rows: Task[] = [
          ...sop
            .filter((t) => !['accepted', 'excused', 'cancelled'].includes(t.state.status))
            .map((t) => ({
              id: t.id,
              title: t.snapshot.template.content.title,
              due: t.due_at,
              zone: t.snapshot.timezone,
              kind: 'operations',
              status:
                t.state.status === 'changes_requested'
                  ? 'Perlu perbaikan'
                  : t.state.status === 'submitted'
                    ? 'Menunggu review'
                    : 'SOP',
            })),
          ...onboarding.items
            .filter((t) => !['completed', 'cancelled'].includes(t.status))
            .map((t) => ({
              id: t.id,
              title: t.snapshot.title,
              due: t.snapshot.steps.map((s: any) => s.due_at).sort()[0],
              zone: t.timezone,
              kind: 'assignments',
              status: 'Onboarding',
            })),
        ];
        setTasks(rows.sort((a, b) => Date.parse(a.due) - Date.parse(b.due)));
      })
      .catch(onError);
  }, []);
  return (
    <section className="panel">
      <h2>Hari Ini</h2>
      <p>Prioritaskan tugas yang perlu dikerjakan atau diperbaiki. Waktu mengikuti zona cabang.</p>
      {tasks === null ? (
        <p role="status">Memuat tugas…</p>
      ) : !tasks.length ? (
        <p>Belum ada tugas aktif dalam daftar Anda.</p>
      ) : (
        tasks.slice(0, 8).map((t) => (
          <article className="assignment-card" key={t.id}>
            <strong>{t.title}</strong>
            <p>
              {t.status} · Tenggat {new Date(t.due).toLocaleString('id-ID', { timeZone: t.zone })} (
              {t.zone}){Date.parse(t.due) < Date.now() ? ' · Lewat tenggat' : ''}
            </p>
            <button className="secondary" onClick={() => onNavigate(t.kind)}>
              Buka tugas
            </button>
          </article>
        ))
      )}
      <div className="actions">
        <button className="secondary" onClick={() => onNavigate('assignments')}>
          Semua onboarding
        </button>
        <button className="secondary" onClick={() => onNavigate('operations')}>
          Semua SOP
        </button>
      </div>
      <p>
        Ringkasan dari 100 tugas terbaru per jenis. Buka daftar lengkap untuk halaman berikutnya.
      </p>
    </section>
  );
}
