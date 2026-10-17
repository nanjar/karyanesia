'use client';
import { useEffect, useState } from 'react';
import { PagedMore } from './paged-more';
import { api } from '../app/api';
type Row = Record<string, any>;
const skillLabels: Record<string, string> = {
  not_started: 'Belum dimulai',
  learning: 'Belajar',
  theory_passed: 'Teori lulus',
  verified: 'Terverifikasi',
  expired: 'Kedaluwarsa',
};
export function InsightsPanel({
  actor,
  onError,
  mode,
  onNavigate,
}: {
  actor: { id: string; role: string };
  onError: (e: Error) => void;
  mode: string;
  onNavigate: (tab: string) => void;
}) {
  const admin = ['OWNER', 'ADMIN'].includes(actor.role);
  const manager = admin || ['HR', 'OPERATIONS', 'SUPERVISOR'].includes(actor.role);
  const [matrix, setMatrix] = useState<Row | null>(null),
    [notices, setNotices] = useState<Row[]>([]),
    [report, setReport] = useState<Row | null>(null),
    [jobs, setJobs] = useState<Row[]>([]),
    [reportBranches, setReportBranches] = useState<Row[]>([]),
    [reportPaths, setReportPaths] = useState<Row[]>([]),
    [modules, setModules] = useState<Row[]>([]),
    [rubrics, setRubrics] = useState<Row[]>([]),
    [corrections, setCorrections] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [requirements, setRequirements] = useState<
      Record<string, { required: boolean; critical: boolean }>
    >({}),
    [jobId, setJobId] = useState('');
  async function load() {
    if (mode === 'reports' && manager) {
      const [b, j, p] = await Promise.all([
        api<Row[]>('branches'),
        api<Row[]>('jobs'),
        api<{ items: Row[] }>('onboarding-paths'),
      ]);
      setReportBranches(b);
      setJobs(j);
      setReportPaths(p.items.filter((r) => r.status === 'published'));
    }
    if (mode === 'notifications') setNotices(await api<Row[]>('notifications'));
    if (mode === 'skills') {
      const [m, j, c] = await Promise.all([
        api<Row>('competencies/matrix'),
        api<Row[]>('jobs'),
        api<Row[]>('data-corrections'),
      ]);
      setMatrix(m);
      setJobs(j);
      setCorrections(c);
      if (admin || actor.role === 'HR') {
        const [l, r] = await Promise.all([
          api<{ items: Row[] }>('learning'),
          api<{ items: Row[] }>('practice-rubrics'),
        ]);
        setModules(l.items.filter((x) => x.status === 'published'));
        setRubrics(r.items.filter((x) => x.status === 'published'));
      }
    }
  }
  useEffect(() => {
    void load().catch(onError);
  }, [mode]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel">
      {message && (
        <p role="status" className="alert success">
          {message}
        </p>
      )}
      {mode === 'notifications' && (
        <section className="panel">
          <h2>Notifikasi</h2>
          <button className="secondary" disabled={busy} onClick={() => void run(load)}>
            Perbarui
          </button>
          {!notices.length && <p>Belum ada notifikasi.</p>}
          {notices.map((n) => (
            <article className="panel" key={n.id}>
              <strong>{n.title}</strong>
              <p>
                {new Date(n.created_at).toLocaleString('id-ID')} ·{' '}
                {n.read_at ? 'Dibaca' : 'Belum dibaca'}
              </p>
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    await api(`notifications/${n.id}/read`, 'POST', { confirm: true });
                    onNavigate(n.target);
                  })
                }
              >
                Buka tugas
              </button>
            </article>
          ))}
          <PagedMore
            path="notifications"
            lastId={notices.at(-1)?.id}
            enabled={notices.length > 0 && notices.length % 100 === 0}
            onPage={(rows) => setNotices((old) => [...old, ...rows])}
            onError={onError}
          />
        </section>
      )}
      {mode === 'skills' && (
        <>
          <section className="panel">
            <h2>Matriks keterampilan</h2>
            <p>
              Teori dan observasi praktik harus sesuai definisi keterampilan. Promosi tetap
              keputusan manusia.
            </p>
            {matrix?.members.map((m: Row) => (
              <article className="panel" key={m.id}>
                <h3>
                  {m.full_name} · {m.employee_number}
                </h3>
                <p>
                  {m.readiness?.ready === null
                    ? 'Belum cukup data kesiapan kerja'
                    : m.readiness?.ready
                      ? 'Persyaratan kesiapan kerja terpenuhi'
                      : 'Masih ada persyaratan kesiapan kerja'}{' '}
                  · {m.readiness?.onboarding_incomplete || 0} onboarding belum selesai
                </p>
                {!m.skills.length && <p>Belum ada definisi keterampilan.</p>}
                {m.skills.map((s: Row) => (
                  <p key={s.id}>
                    <strong>{s.name}</strong> · {skillLabels[s.status]}
                    {s.expires_at
                      ? ' · Berlaku sampai ' + new Date(s.expires_at).toLocaleDateString('id-ID')
                      : ''}
                  </p>
                ))}
                <details>
                  <summary>Kesiapan jabatan berikutnya</summary>
                  {jobs.map((j) => {
                    const defs =
                      matrix.requirements.find((r: Row) => r.job_id === j.id)?.requirements || [];
                    const required = defs.filter((r: Row) => r.required);
                    const missing = required.filter(
                      (r: Row) =>
                        m.skills.find((s: Row) => s.id === r.competency_id)?.status !== 'verified',
                    );
                    return (
                      <p key={j.id}>
                        {j.name}:{' '}
                        {!required.length
                          ? 'Persyaratan belum ditetapkan'
                          : missing.length
                            ? `${missing.length} dari ${required.length} persyaratan belum terpenuhi`
                            : 'Seluruh persyaratan keterampilan terpenuhi'}
                      </p>
                    );
                  })}
                </details>
              </article>
            ))}
            <PagedMore
              path="competencies/matrix"
              field="members"
              lastId={matrix?.members.at(-1)?.id}
              enabled={Boolean(matrix?.members.length && matrix.members.length % 100 === 0)}
              onPage={(rows) =>
                setMatrix((old) => (old ? { ...old, members: [...old.members, ...rows] } : old))
              }
              onError={onError}
            />
            <small>
              Data{' '}
              {matrix?.as_of ? new Date(matrix.as_of).toLocaleString('id-ID') : 'sedang dimuat'} ·
              100 anggota per halaman
            </small>
          </section>
          {(admin || actor.role === 'HR') && (
            <>
              <details className="panel">
                <summary>Tambah definisi keterampilan immutable</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void run(async () => {
                      await api('competencies', 'POST', {
                        name: d.get('name'),
                        description: d.get('description'),
                        module_version_id: d.get('module'),
                        rubric_version_id: d.get('rubric'),
                        validity_days: d.get('validity') ? Number(d.get('validity')) : null,
                      });
                      setMessage('Definisi keterampilan disimpan.');
                    });
                  }}
                >
                  <label>
                    Nama
                    <input required name="name" maxLength={200} />
                  </label>
                  <label>
                    Deskripsi
                    <textarea required name="description" maxLength={2000} />
                  </label>
                  <label>
                    Versi materi
                    <select required name="module">
                      <option value="">Pilih</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title} v{m.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Versi rubrik
                    <select required name="rubric">
                      <option value="">Pilih</option>
                      {rubrics.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} v{r.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Masa berlaku (hari, kosong tanpa kedaluwarsa)
                    <input type="number" min={1} max={3650} name="validity" />
                  </label>
                  <button className="primary" disabled={busy}>
                    Simpan definisi
                  </button>
                </form>
              </details>
              <details className="panel">
                <summary>Persyaratan keterampilan jabatan</summary>
                <label>
                  Jabatan
                  <select
                    value={jobId}
                    onChange={(e) => {
                      setJobId(e.target.value);
                      const r = matrix?.requirements.find((r: Row) => r.job_id === e.target.value);
                      setRequirements(
                        Object.fromEntries(
                          (r?.requirements || []).map((v: Row) => [
                            v.competency_id,
                            { required: v.required, critical: v.critical },
                          ]),
                        ),
                      );
                    }}
                  >
                    <option value="">Pilih jabatan</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </label>
                {(matrix?.members[0]?.skills || []).map((s: Row) => (
                  <fieldset key={s.id}>
                    <legend>{s.name}</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(requirements[s.id])}
                        onChange={(e) => {
                          const next = { ...requirements };
                          if (e.target.checked) next[s.id] = { required: true, critical: false };
                          else delete next[s.id];
                          setRequirements(next);
                        }}
                      />
                      Termasuk persyaratan
                    </label>
                    {requirements[s.id] && (
                      <>
                        <label>
                          <input
                            type="checkbox"
                            checked={requirements[s.id].required}
                            onChange={(e) =>
                              setRequirements({
                                ...requirements,
                                [s.id]: { required: e.target.checked, critical: false },
                              })
                            }
                          />
                          Wajib
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={requirements[s.id].critical}
                            onChange={(e) =>
                              setRequirements({
                                ...requirements,
                                [s.id]: { required: true, critical: e.target.checked },
                              })
                            }
                          />
                          Kritis
                        </label>
                      </>
                    )}
                  </fieldset>
                ))}
                <button
                  className="primary"
                  disabled={busy || !jobId}
                  onClick={() =>
                    void run(async () => {
                      await api('competencies/requirements/' + jobId, 'POST', {
                        revision:
                          matrix?.requirements.find((r: Row) => r.job_id === jobId)?.revision || 0,
                        requirements: Object.entries(requirements).map(([competency_id, r]) => ({
                          competency_id,
                          ...r,
                        })),
                      });
                      setMessage('Persyaratan jabatan diperbarui.');
                    })
                  }
                >
                  Simpan versi persyaratan
                </button>
              </details>
            </>
          )}
          <section className="panel">
            <h2>Koreksi data</h2>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(
                  'Jelaskan data/bukti yang perlu dikoreksi (minimal 10 karakter)',
                );
                if (reason)
                  void run(async () => {
                    await api('data-corrections', 'POST', { reason });
                    setMessage('Permintaan koreksi tercatat.');
                  });
              }}
            >
              Ajukan koreksi data saya
            </button>
            {corrections.map((c) => (
              <article key={c.id}>
                <p>
                  {c.reason} ·{' '}
                  {c.resolved_at ? 'Diselesaikan: ' + c.resolution : 'Menunggu pemeriksaan'}
                </p>
                {manager && c.membership_id !== actor.id && !c.resolved_at && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      const resolution = window.prompt(
                        'Catatan penyelesaian (minimal 10 karakter)',
                      );
                      if (resolution)
                        void run(async () => {
                          await api(`data-corrections/${c.id}/resolve`, 'POST', { resolution });
                        });
                    }}
                  >
                    Catat penyelesaian
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {mode === 'reports' && manager && (
        <section className="panel">
          <h2>Laporan operasional</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const filters = {
                from: d.get('from') + 'T00:00:00+07:00',
                to: d.get('to') + 'T00:00:00+07:00',
                ...(d.get('branch_id') ? { branch_id: d.get('branch_id') } : {}),
                ...(d.get('status') ? { status: d.get('status') } : {}),
                ...(d.get('job_id') ? { job_id: d.get('job_id') } : {}),
                ...(d.get('path_version_id') ? { path_version_id: d.get('path_version_id') } : {}),
              };
              void run(async () => {
                setReport(
                  await api<Row>(
                    'reports/summary?' + new URLSearchParams(filters as Record<string, string>),
                  ),
                );
              });
            }}
          >
            <label>
              Mulai (WIB)
              <input
                required
                name="from"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 7) + '-01'}
              />
            </label>
            <label>
              Akhir eksklusif (WIB)
              <input
                required
                name="to"
                type="date"
                defaultValue={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Cabang (opsional)
              <select name="branch_id">
                <option value="">Semua cabang dalam scope</option>
                {reportBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jabatan (opsional)
              <select name="job_id">
                <option value="">Semua jabatan</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jalur onboarding (opsional)
              <select name="path_version_id">
                <option value="">Semua jalur</option>
                {reportPaths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} v{p.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status (opsional)
              <select name="status">
                <option value="">Semua status</option>
                {[
                  'open',
                  'submitted',
                  'accepted',
                  'excused',
                  'cancelled',
                  'unassigned',
                  'completed',
                  'awaiting_assessment',
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Tampilkan laporan
            </button>
          </form>
          {report && (
            <>
              <p>Data per {new Date(report.as_of).toLocaleString('id-ID')}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Metrik</th>
                      <th>Hasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.summary).map(([key, value]) => (
                      <tr key={key}>
                        <td>
                          {{
                            skills_expired: 'Keterampilan kedaluwarsa dalam periode',
                            sop_submitted_late: 'SOP diajukan terlambat',
                            sop_due: 'SOP jatuh tempo',
                            sop_on_time: 'SOP diajukan tepat waktu',
                            sop_on_time_percent: 'Persentase tepat waktu',
                            sop_accepted: 'SOP diterima',
                            sop_accepted_late: 'SOP diterima, pengajuan terlambat',
                            sop_excused: 'Pengecualian SOP',
                            sop_cancelled: 'Pembatalan SOP',
                            sop_unassigned: 'SOP tanpa penerima',
                            onboarding_due: 'Onboarding jatuh tempo',
                            onboarding_completed: 'Onboarding selesai',
                            onboarding_cancelled: 'Onboarding dibatalkan',
                            theory_failed: 'Langkah teori belum lulus',
                            practice_waiting: 'Langkah menunggu praktik',
                            issues_open: 'Kendala terbuka',
                          }[key] || key}
                        </td>
                        <td>{value === null ? 'Belum ada data' : String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.values(report.definitions).map((v: any) => (
                <p key={v}>{v}</p>
              ))}
              {(admin || ['HR', 'OPERATIONS'].includes(actor.role)) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await api<Row>('reports/export', 'POST', report.filters);
                      const url = URL.createObjectURL(
                        new Blob([r.csv], { type: 'text/csv;charset=utf-8' }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = r.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                      setMessage('Ekspor diunduh dan dicatat pada audit.');
                    })
                  }
                >
                  Unduh CSV
                </button>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
