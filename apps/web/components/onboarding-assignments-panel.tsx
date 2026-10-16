'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Assignment = {
  id: string;
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
  onError,
}: {
  admin: boolean;
  onError: (e: Error) => void;
}) {
  const [items, setItems] = useState<Assignment[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    setItems((await api<{ items: Assignment[] }>('onboarding-assignments')).items);
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  return (
    <section className="learning-panel">
      <div className="alert">
        Penugasan dan tenggat sudah tersimpan. Integrasi progres kuis, pembatasan tugas berdasarkan
        prasyarat dan observasi praktik belum tersedia. Status tetap ditugaskan sampai integrasi
        tersebut berjalan; kelulusan teori tidak berarti kompeten.
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
        <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
          Perbarui tugas
        </button>
        <p>Menampilkan maksimal 100 tugas terbaru sesuai akses Anda.</p>
        {!items.length && <p>Belum ada tugas onboarding.</p>}
        {items.map((item) => (
          <details className="assignment-card" key={item.id}>
            <summary>
              {item.snapshot.title} · v{item.snapshot.version} · {item.full_name} (
              {item.employee_number}) · {item.status === 'cancelled' ? 'Dibatalkan' : 'Ditugaskan'}
            </summary>
            <p>
              Mulai {item.start_date} · {item.timezone}
            </p>
            {item.cancel_reason && <p>Alasan pembatalan: {item.cancel_reason}</p>}
            <ol>
              {item.snapshot.steps.map((s) => (
                <li key={s.position}>
                  <strong>{s.module_title}</strong>
                  <p>
                    Tenggat sebelum{' '}
                    {new Date(s.due_at).toLocaleString('id-ID', { timeZone: item.timezone })} (
                    {item.timezone})
                    {item.status !== 'cancelled' && new Date(s.due_at).getTime() <= Date.now()
                      ? ' · Lewat tenggat'
                      : ''}{' '}
                    · {s.prerequisite ? `Prasyarat langkah ${s.prerequisite}` : 'Tanpa prasyarat'} ·
                    Praktik wajib, belum dinilai
                  </p>
                </li>
              ))}
            </ol>
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
      </section>
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
      api<{
        items: {
          id: string;
          full_name: string;
          employee_number: string;
          active: boolean;
          role: string;
        }[];
      }>('memberships?limit=100'),
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
