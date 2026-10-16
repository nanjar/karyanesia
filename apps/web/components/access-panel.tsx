'use client';
import { useEffect, useState } from 'react';
import { allMembers, PagedMore } from './paged-more';
import { api } from '../app/api';
type Row = Record<string, any>;
export function AccessPanel({ onError }: { onError: (e: Error) => void }) {
  const [members, setMembers] = useState<Row[]>([]),
    [branches, setBranches] = useState<Row[]>([]),
    [jobs, setJobs] = useState<Row[]>([]),
    [id, setId] = useState(''),
    [scope, setScope] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [token, setToken] = useState(''),
    [enrollment, setEnrollment] = useState(''),
    [preview, setPreview] = useState<Row | null>(null);
  async function load() {
    const [m, b, j] = await Promise.all([allMembers(), api<Row[]>('branches'), api<Row[]>('jobs')]);
    setMembers(m.items);
    setBranches(b);
    setJobs(j);
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setToken('');
    setEnrollment('');
    setMessage('');
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
    <details className="panel">
      <summary>Akses, perpindahan staf & pemulihan akun</summary>
      <p>
        Perubahan akses mencabut sesi. Riwayat tugas dan penilaian tetap disimpan. Daftar
        menampilkan hingga 5.000 anggota sesuai scope.
      </p>
      <label>
        Anggota
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setToken('');
            setPreview(null);
          }}
        >
          <option value="">Pilih anggota</option>
          {members
            .filter((m) => m.role !== 'OWNER')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} · {m.employee_number} · {m.role}
              </option>
            ))}
        </select>
      </label>
      {message && (
        <p className="alert success" role="status">
          {message}
        </p>
      )}
      {enrollment && (
        <p className="alert">
          Pendaftaran MFA admin (ditampilkan sekali). Bagikan secara aman kepada pemilik akun,
          daftarkan pada authenticator sebelum login: <code>{enrollment}</code>
        </p>
      )}
      {token && (
        <p className="alert">
          Kode aktivasi baru (berlaku 24 jam). Bagikan secara aman kepada pemilik akun:{' '}
          <code>{token}</code>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          if (!window.confirm('Ubah hak akses anggota dan cabut sesi aktifnya?')) return;
          void run(async () => {
            await api(`memberships/${id}/access`, 'POST', {
              role: d.get('role'),
              branch_ids: scope,
              assessor: d.get('assessor') === 'on',
              reason: d.get('reason'),
            });
            setMessage('Akses diperbarui; anggota perlu masuk kembali.');
          });
        }}
      >
        <fieldset disabled={busy || !id}>
          <legend>Hak akses</legend>
          <label>
            Peran
            <select name="role">
              <option value="STAFF">Staf</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="HR">HR & Pelatihan</option>
              <option value="OPERATIONS">Operasional</option>
              <option value="ADMIN">Admin (hanya pemilik)</option>
            </select>
          </label>
          <label>
            Scope cabang
            <select
              multiple
              value={scope}
              onChange={(e) => setScope(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" name="assessor" />
            Kapabilitas penilai praktik (staf tidak diizinkan)
          </label>
          <label>
            Alasan
            <input required minLength={10} maxLength={2000} name="reason" />
          </label>
          <button className="primary">Simpan akses</button>
        </fieldset>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void run(async () => {
            const target = { branch_id: d.get('branch_id'), job_id: d.get('job_id') };
            const p = await api<Row>(`memberships/${id}/transfer-preview`, 'POST', target);
            setPreview({ ...p, reason: d.get('reason') });
          });
        }}
      >
        <fieldset disabled={busy || !id}>
          <legend>Pindah cabang / jabatan staf</legend>
          <label>
            Cabang tujuan
            <select required name="branch_id">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jabatan tujuan
            <select required name="job_id">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alasan
            <input required minLength={10} name="reason" />
          </label>
          <button className="secondary">Pratinjau dampak</button>
        </fieldset>
      </form>
      {preview && (
        <div className="alert">
          <p>{preview.open_assignments.length} tugas onboarding lama dipertahankan.</p>
          <p>{preview.policy}</p>
          <p>
            {preview.requirements?.requirements.length || 0} persyaratan keterampilan jabatan
            tujuan.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`memberships/${id}/transfer`, 'POST', {
                  ...preview.target,
                  reason: preview.reason,
                  confirm_preserve_history: true,
                });
                setPreview(null);
                setMessage(
                  'Staf dipindahkan; tinjau tugas lama dan buat penugasan baru sesuai kebutuhan.',
                );
              })
            }
          >
            Konfirmasi perpindahan
          </button>
        </div>
      )}
      <button
        className="secondary"
        disabled={busy || !id}
        onClick={() => {
          const reason = window.prompt(
            'Alasan reset setelah memverifikasi identitas pemilik akun (minimal 10 karakter)',
          );
          if (reason)
            void run(async () => {
              const r = await api<Row>(`memberships/${id}/reset`, 'POST', { reason });
              setToken(r.activation_token);
              setMessage('Password dinonaktifkan dan sesi lama dicabut.');
            });
        }}
      >
        Reset password anggota
      </button>
    </details>
  );
}
