'use client';
import { useEffect, useState } from 'react';
import { PagedMore, allMembers } from './paged-more';
import { api } from '../app/api';
import { PracticeObservation, PracticeHistory } from './practice-observation';
import { PracticeRequest, PracticeRequestHistory, RequestState } from './practice-request';
import { LearningPanel } from './learning-panel';
type Assignment = {
  id: string;
  membership_id: string;
  progress: {
    theory_passed: number;
    total: number;
    practice_passed: number;
    steps: {
      position: number;
      theory_status: string;
      attempts: number;
      best_score: number | null;
      practice_status: string;
      latest_assessment_id: string | null;
      practice_request: RequestState | null;
      module_available: boolean;
      learning_available: boolean;
      practice_eligible: boolean;
      learning_locked_reason: string | null;
      overdue: boolean;
    }[];
  };
  full_name: string;
  employee_number: string;
  start_date: string;
  timezone: string;
  status: string;
  cancel_reason: string | null;
  snapshot: {
    title: string;
    version: number;
    steps: {
      practice_rubric?: {
        id: string;
        title: string;
        version: number;
        instructions: string;
        items: { position: number; label: string; required: boolean; critical: boolean }[];
      };
      version_id: string;
      position: number;
      module_title: string;
      prerequisite: number | null;
      due_at: string;
    }[];
  };
};
type Preview = {
  id: string;
  count: number;
  start_date: string;
  path: { title: string; version: number };
  items: {
    id: string;
    full_name: string;
    employee_number: string;
    branch_name: string;
    timezone: string;
  }[];
};
export function OnboardingAssignmentsPanel({
  admin,
  actorId,
  canAssess,
  onError,
}: {
  admin: boolean;
  actorId: string;
  canAssess: boolean;
  onError: (e: Error) => void;
}) {
  const [items, setItems] = useState<Assignment[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [module, setModule] = useState<{ versionId: string; assignmentId: string } | null>(null),
    [onlyPending, setOnlyPending] = useState(false);
  async function load() {
    setItems(
      (
        await api<{ items: Assignment[] }>(
          onlyPending ? 'onboarding-assignments/practice-queue' : 'onboarding-assignments',
        )
      ).items,
    );
  }
  useEffect(() => {
    void load().catch(onError);
  }, [onlyPending]);
  return (
    <section className="learning-panel">
      <div className="alert">
        Progres teori dihitung dari hasil kuis pada versi modul yang sama, termasuk hasil sebelum
        penugasan. Praktik mengikuti rubrik snapshot dan disahkan penilai dalam scope. Tugas selesai
        hanya setelah seluruh teori dan praktik lulus. Akses materi/kuis mengikuti tanggal mulai dan
        seluruh rantai prasyarat tugas.
      </div>
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {admin && (
        <AssignmentForm
          onError={onError}
          onCommitted={async (count) => {
            setNotice(`${count} tugas onboarding tersimpan.`);
            await load();
          }}
        />
      )}
      <section className="panel">
        <h2>Tugas onboarding</h2>
        {canAssess && (
          <label className="learning-option">
            <input
              type="checkbox"
              checked={onlyPending}
              disabled={busy}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            Hanya pengajuan menunggu (maksimal 100 tugas)
          </label>
        )}
        <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
          Perbarui tugas
        </button>
        <p>
          {onlyPending
            ? 'Antrean maksimal 100 tugas tertua yang memiliki pengajuan menunggu.'
            : 'Menampilkan maksimal 100 tugas terbaru sesuai akses Anda.'}
        </p>
        {!items.length && <p>Belum ada tugas onboarding.</p>}
        {items.map((item) => (
          <details className="assignment-card" key={item.id}>
            <summary>
              {item.snapshot.title} · v{item.snapshot.version} · {item.full_name} (
              {item.employee_number}) ·{' '}
              {
                (
                  {
                    assigned: 'Ditugaskan',
                    in_progress: 'Sedang belajar',
                    awaiting_assessment: 'Menunggu penilaian praktik',
                    cancelled: 'Dibatalkan',
                    completed: 'Selesai',
                  } as Record<string, string>
                )[item.status]
              }
            </summary>
            <p>
              Mulai {item.start_date} · {item.timezone}
            </p>
            <p>
              Teori lulus {item.progress.theory_passed}/{item.progress.total} · Praktik disetujui{' '}
              {item.progress.practice_passed}/{item.progress.total}
            </p>
            {item.cancel_reason && <p>Alasan pembatalan: {item.cancel_reason}</p>}
            <ol>
              {item.snapshot.steps.map((s, i) => (
                <li key={s.position}>
                  <strong>{s.module_title}</strong>
                  <p>
                    Tenggat sebelum{' '}
                    {new Date(s.due_at).toLocaleString('id-ID', { timeZone: item.timezone })} (
                    {item.timezone}){item.progress.steps[i].overdue ? ' · Lewat tenggat' : ''} ·{' '}
                    {s.prerequisite ? `Prasyarat langkah ${s.prerequisite}` : 'Tanpa prasyarat'} ·
                    Praktik:{' '}
                    {
                      (
                        {
                          not_assessed: 'Belum dinilai',
                          competent: 'Kompeten',
                          needs_practice: 'Perlu latihan',
                        } as Record<string, string>
                      )[item.progress.steps[i].practice_status]
                    }
                  </p>
                  {s.practice_rubric ? (
                    <details>
                      <summary>
                        Rubrik: {s.practice_rubric.title} · v{s.practice_rubric.version}
                      </summary>
                      <p className="learning-transcript">{s.practice_rubric.instructions}</p>
                      <ul>
                        {s.practice_rubric.items.map((r) => (
                          <li key={r.position}>
                            {r.label} · {r.required ? 'Wajib' : 'Opsional'}{' '}
                            {r.critical && <span className="rubric-critical">Kritis</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p>
                      Belum ada rubrik pada snapshot tugas ini. Admin perlu membuat versi jalur
                      dengan rubrik dan menugaskan ulang sebelum penilaian praktik.
                    </p>
                  )}
                  <p>
                    Teori:{' '}
                    {
                      (
                        {
                          passed: 'Lulus',
                          needs_review: 'Perlu belajar lagi',
                          not_started: 'Belum mulai',
                        } as Record<string, string>
                      )[item.progress.steps[i].theory_status]
                    }{' '}
                    · {item.progress.steps[i].attempts} percobaan
                    {item.progress.steps[i].best_score !== null
                      ? ` · Nilai terbaik ${item.progress.steps[i].best_score}%`
                      : ''}
                  </p>
                  {item.progress.steps[i].practice_request && (
                    <p className="alert">
                      Pengajuan{' '}
                      {item.progress.steps[i].practice_request!.kind === 'review'
                        ? 'peninjauan'
                        : 'praktik'}{' '}
                      ·{' '}
                      {
                        (
                          {
                            pending: 'Menunggu penilai',
                            answered: 'Dijawab observasi',
                            cancelled: 'Tugas dibatalkan',
                          } as Record<string, string>
                        )[item.progress.steps[i].practice_request!.status]
                      }
                      : {item.progress.steps[i].practice_request!.reason}
                    </p>
                  )}
                  {item.membership_id === actorId &&
                    item.status !== 'cancelled' &&
                    s.practice_rubric &&
                    item.progress.steps[i].practice_eligible &&
                    item.progress.steps[i].practice_request?.status !== 'pending' && (
                      <PracticeRequest
                        key={`${item.progress.steps[i].latest_assessment_id ?? 'none'}-${item.progress.steps[i].practice_request?.id ?? 'none'}`}
                        assignmentId={item.id}
                        position={s.position}
                        latestId={item.progress.steps[i].latest_assessment_id}
                        competent={item.progress.steps[i].practice_status === 'competent'}
                        onError={onError}
                        onSaved={async () => {
                          setNotice('Pengajuan tersimpan dan menunggu penilai.');
                          await load();
                        }}
                      />
                    )}
                  {canAssess &&
                    item.membership_id !== actorId &&
                    item.status !== 'cancelled' &&
                    s.practice_rubric &&
                    (item.progress.steps[i].practice_eligible ? (
                      <PracticeObservation
                        key={item.progress.steps[i].latest_assessment_id ?? 'first'}
                        assignmentId={item.id}
                        position={s.position}
                        rubric={s.practice_rubric}
                        latestId={item.progress.steps[i].latest_assessment_id}
                        onError={onError}
                        onSaved={async () => {
                          setNotice('Observasi tersimpan. Progres tugas diperbarui.');
                          await load();
                        }}
                      />
                    ) : (
                      <p>
                        Observasi dapat disahkan setelah teori langkah ini lulus dan praktik
                        prasyarat kompeten.
                      </p>
                    ))}
                  {item.membership_id === actorId &&
                    item.status !== 'cancelled' &&
                    (item.progress.steps[i].learning_available ? (
                      <button
                        className="secondary"
                        onClick={() =>
                          setModule({ versionId: s.version_id, assignmentId: item.id })
                        }
                      >
                        Buka materi & kuis
                      </button>
                    ) : (
                      <p>
                        {item.progress.steps[i].learning_locked_reason} Bukti teori lama tetap
                        tersimpan.
                      </p>
                    ))}
                </li>
              ))}
            </ol>
            <PracticeHistory assignmentId={item.id} onError={onError} />
            <PracticeRequestHistory assignmentId={item.id} onError={onError} />
            {admin && item.status !== 'cancelled' && (
              <form
                className="learning-editor"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const reason = String(new FormData(e.currentTarget).get('reason'));
                  if (!window.confirm('Batalkan tugas ini? Histori tetap disimpan.')) return;
                  setBusy(true);
                  try {
                    await api(`onboarding-assignments/${item.id}/cancel`, 'POST', { reason });
                    setNotice('Tugas dibatalkan dan histori dipertahankan.');
                    await load();
                  } catch (error) {
                    onError(error as Error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Alasan pembatalan
                  <textarea name="reason" required minLength={10} maxLength={1000} rows={2} />
                </label>
                <button className="secondary" disabled={busy}>
                  Batalkan tugas
                </button>
              </form>
            )}
          </details>
        ))}
        <PagedMore
          path="onboarding-assignments"
          lastId={items.at(-1)?.id}
          enabled={!canAssess && items.length > 0 && items.length % 100 === 0}
          onPage={(rows) => setItems((old) => [...old, ...rows])}
          onError={onError}
        />
      </section>
      {module && (
        <section className="panel">
          <button className="secondary" onClick={() => setModule(null)}>
            Tutup materi
          </button>
          <LearningPanel
            key={module.assignmentId + module.versionId}
            admin={false}
            canReset={false}
            initialVersion={module.versionId}
            assignmentId={module.assignmentId}
            onError={onError}
            onAssessed={load}
          />
        </section>
      )}
    </section>
  );
}
function AssignmentForm({
  onError,
  onCommitted,
}: {
  onError: (e: Error) => void;
  onCommitted: (count: number) => Promise<void>;
}) {
  const [paths, setPaths] = useState<
      { id: string; title: string; version: number; status: string }[]
    >([]),
    [options, setOptions] = useState<Record<string, { id: string; name: string }[]>>({
      staff: [],
      branch: [],
      job: [],
    }),
    [kind, setKind] = useState('staff'),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState('');
  useEffect(() => {
    void Promise.all([
      api<{ items: typeof paths }>('onboarding-paths'),
      allMembers(),
      api<{ id: string; name: string }[]>('branches'),
      api<{ id: string; name: string }[]>('jobs'),
    ])
      .then(([p, m, b, j]) => {
        setPaths(p.items.filter((v) => v.status === 'published'));
        setOptions({
          staff: m.items
            .filter((v) => v.active && v.role === 'STAFF')
            .map((v) => ({ id: v.id, name: `${v.employee_number} · ${v.full_name}` })),
          branch: b,
          job: j,
        });
      })
      .catch(onError);
  }, []);
  return (
    <section className="panel">
      <h2>Tugaskan jalur onboarding</h2>
      <p>
        Pratinjau berlaku 24 jam. Maksimum 500 staf per batch. Pemilih staf menampilkan hingga 100
        anggota pertama; gunakan target cabang/jabatan untuk kelompok lebih besar. Batch baru dapat
        membuat penugasan tambahan untuk staf yang sama.
      </p>
      <form
        className="learning-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setPreview(null);
          setResult('');
          const d = new FormData(e.currentTarget);
          try {
            setPreview(
              await api<Preview>('onboarding-assignments/preview', 'POST', {
                path_version_id: d.get('path'),
                start_date: d.get('start_date'),
                target: { kind, ids: d.getAll('targets') },
              }),
            );
          } catch (error) {
            onError(error as Error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Versi jalur terbit
            <select name="path" required>
              <option value="">Pilih jalur</option>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · v{p.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tanggal mulai
            <input type="date" name="start_date" required min="2000-01-01" max="2100-12-31" />
          </label>
          <label>
            Jenis target
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPreview(null);
              }}
            >
              <option value="staff">Staf</option>
              <option value="branch">Cabang</option>
              <option value="job">Jabatan</option>
            </select>
          </label>
          <label>
            Pilih satu atau beberapa target
            <select key={kind} name="targets" multiple size={5} required>
              {options[kind].map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Di desktop, gunakan Ctrl/Cmd untuk memilih beberapa target. Tinjau daftar staf sebelum
            konfirmasi.
          </p>
          <button className="secondary">Buat pratinjau</button>
        </fieldset>
      </form>
      {preview && (
        <section>
          <h3>
            Pratinjau: {preview.path.title} · v{preview.path.version}
          </h3>
          <p>
            {preview.count} staf · mulai {preview.start_date}. Konfirmasi hanya menggunakan daftar
            di bawah, meskipun isian form telah berubah.
          </p>
          <ul>
            {preview.items.map((m) => (
              <li key={m.id}>
                {m.full_name} · {m.employee_number} · {m.branch_name} · {m.timezone}
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={busy || !!result}
            onClick={async () => {
              if (
                !window.confirm(`Tugaskan jalur ini kepada ${preview.count} staf pada pratinjau?`)
              )
                return;
              setBusy(true);
              try {
                const r = await api<{ count: number }>(
                  `onboarding-assignments/batches/${preview.id}/commit`,
                  'POST',
                  { confirm: true },
                );
                setResult(`Batch tersimpan untuk ${r.count} staf.`);
                await onCommitted(r.count);
              } catch (error) {
                onError(error as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Konfirmasi {preview.count} staf
          </button>
          <p>
            Saat koneksi gagal, ulangi konfirmasi pratinjau yang sama untuk mengambil hasil tanpa
            membuat tugas ganda.
          </p>
        </section>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
