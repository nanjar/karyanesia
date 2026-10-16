'use client';
import { useEffect, useState } from 'react';
import { Check, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { api } from '../app/api';
type Row = {
  row_number: number;
  data: Record<string, string>;
  errors: string[];
  outcome?: 'created' | 'failed';
};
type Result = { id: string; status: 'committed'; total: number; created: number; failed: number };
type Batch = {
  id: string;
  status: 'previewed' | 'committed';
  total: number;
  valid: number;
  invalid: number;
  expires_at: string;
  rows: Row[];
  result?: Result;
};
type Recent = {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  total: number;
  result: Result | null;
};
function download(contents: Blob, name: string) {
  const url = URL.createObjectURL(contents),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function StaffImportPanel({
  onCommitted,
  onError,
}: {
  onCommitted: () => Promise<void>;
  onError: (e: Error & { status?: number }) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [batch, setBatch] = useState<Batch | null>(null),
    [recent, setRecent] = useState<Recent[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [filter, setFilter] = useState('all'),
    [limit, setLimit] = useState(100);
  async function loadRecent() {
    try {
      setRecent(await api<Recent[]>('staff-imports'));
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    void loadRecent();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function fail(e: unknown) {
    const err = e as Error & { status?: number };
    setError(err.message);
    if (err.status === 401) onError(err);
  }
  async function preview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 1024 * 1024)
        throw Error('File maksimal 1 MiB. Bagi daftar staf menjadi beberapa batch.');
      let csv: string;
      try {
        csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        throw Error('File harus menggunakan encoding UTF-8. Simpan ulang sebagai CSV UTF-8.');
      }
      setBatch(await api<Batch>('staff-imports/preview', 'POST', { csv }));
      setConfirmed(false);
      setFilter('all');
      setLimit(100);
      await loadRecent();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setBatch(await api<Batch>('staff-imports/' + id));
      setConfirmed(false);
      setLimit(100);
      setFilter('all');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!batch || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<Result>(`staff-imports/${batch.id}/commit`, 'POST', {
        confirm: true,
      });
      // Keep this batch ID on network failure. Retrying the same batch returns its stored result.
      setBatch({ ...batch, status: 'committed', result });
      const detail = await api<Batch>('staff-imports/' + batch.id);
      setBatch(detail);
      await onCommitted();
      await loadRecent();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function errors() {
    if (!batch) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/staff-imports/${batch.id}/errors.csv`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const d = await res.json();
        const err = Object.assign(new Error(d.message || 'Laporan gagal diunduh.'), {
          status: res.status,
        });
        throw err;
      }
      download(await res.blob(), `staff-import-${batch.id}-errors.csv`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const visible = batch?.rows.filter((r) => filter === 'all' || r.errors.length > 0) ?? [],
    committed = batch?.status === 'committed';
  return (
    <div className="import-workspace">
      <section className="data-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ONBOARDING TIM</span>
            <h2>Tambahkan staf dalam satu batch</h2>
            <p>
              Periksa data terlebih dahulu, lalu konfirmasi baris valid. Data staf lama tetap utuh.
            </p>
          </div>
          <FileSpreadsheet size={28} aria-hidden="true" />
        </div>
        <div className="import-body">
          <ol className="import-steps" aria-label="Tahap impor">
            <li>
              <span>1</span>Pilih CSV
            </li>
            <li>
              <span>2</span>Periksa pratinjau
            </li>
            <li>
              <span>3</span>Konfirmasi impor
            </li>
          </ol>
          <div className="import-instructions">
            <p>
              <strong>Kolom wajib</strong>
              <br />
              <code>employee_number, full_name, branch_code, job_code</code>
            </p>
            <p>
              Opsional: <code>supervisor_employee_number, email, start_date</code>. Tanggal
              menggunakan YYYY-MM-DD. Maksimal 5.000 staf dan 1 MiB. Semua akun hasil impor memiliki
              peran Staf.
            </p>
            <button
              className="secondary"
              onClick={() =>
                download(
                  new Blob(
                    [
                      '\uFEFFemployee_number,full_name,branch_code,job_code,supervisor_employee_number,email,start_date\r\nEMP001,Nama Karyawan,CB01,KASIR,,,\r\n',
                    ],
                    { type: 'text/csv;charset=utf-8' },
                  ),
                  'karyanesia-template-staf.csv',
                )
              }
            >
              <Download size={16} />
              Unduh template
            </button>
          </div>
          <form onSubmit={preview} className="import-upload">
            <label htmlFor="staff-csv">
              File CSV UTF-8
              <input
                id="staff-csv"
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setBatch(null);
                  setConfirmed(false);
                  setError('');
                }}
              />
            </label>
            <button className="primary" disabled={!file || busy}>
              <Upload size={17} />
              {busy ? 'Memproses…' : 'Buat pratinjau'}
            </button>
          </form>
          <p className="inline-help">
            Gunakan kode cabang dan jabatan yang sudah terdaftar. Supervisor harus merupakan akun
            supervisor/admin aktif yang sudah tersedia.
          </p>
          {error && (
            <div role="alert" className="alert error">
              {error}{' '}
              {batch?.status === 'previewed' &&
                'Jika koneksi terputus saat konfirmasi, ulangi batch yang sama atau muat ulang status untuk memeriksa hasil.'}
            </div>
          )}
        </div>
      </section>
      {batch && (
        <section className="data-section" aria-label="Pratinjau impor">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{committed ? 'HASIL IMPOR' : 'PRATINJAU'}</span>
              <h2>{committed ? 'Batch selesai diproses' : 'Periksa data staf'}</h2>
              <p>
                {committed
                  ? `${batch.result?.created ?? 0} staf dibuat, ${batch.result?.failed ?? 0} baris tidak diterapkan.`
                  : `${batch.total} baris: ${batch.valid} valid dan ${batch.invalid} perlu perbaikan.`}
              </p>
            </div>
            <button className="secondary" disabled={busy} onClick={() => void open(batch.id)}>
              <RefreshCw size={16} />
              Muat status
            </button>
          </div>
          <div className="import-body compact">
            <p className="import-reference">
              ID batch: <code>{batch.id}</code>
              <br />
              Batas konfirmasi: {new Date(batch.expires_at).toLocaleString('id-ID')}
            </p>
            {committed ? (
              <div role="status" className="alert success">
                <Check size={18} />
                <span>
                  Akun baru menunggu aktivasi. Buka Organisasi & staf, pilih “Kode baru” pada akun
                  terkait, lalu bagikan kodenya secara aman.
                </span>
              </div>
            ) : (
              <div className="import-confirm">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || batch.valid === 0}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Saya sudah memeriksa pratinjau dan menyetujui pembuatan {batch.valid} staf valid.
                  Baris bermasalah tidak akan diterapkan.
                </label>
                <button
                  className="primary"
                  disabled={!confirmed || busy || batch.valid === 0}
                  onClick={() => void commit()}
                >
                  {busy ? 'Memproses…' : `Impor ${batch.valid} staf valid`}
                  <Check size={17} />
                </button>
                <p className="inline-help">
                  Pratinjau berlaku 24 jam. Sistem memvalidasi ulang referensi sebelum menyimpan.
                  Mengulang konfirmasi batch yang sama tidak membuat staf ganda.
                </p>
              </div>
            )}
            <div className="import-toolbar">
              <label>
                Tampilkan
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setLimit(100);
                  }}
                >
                  <option value="all">Semua baris</option>
                  <option value="errors">Baris bermasalah</option>
                </select>
              </label>
              <button className="secondary" disabled={busy} onClick={() => void errors()}>
                <Download size={16} />
                Unduh laporan kesalahan
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Baris CSV</th>
                  <th>ID / nama staf</th>
                  <th>Cabang / jabatan</th>
                  <th>Status dan catatan</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((row) => (
                  <tr key={row.row_number}>
                    <td>{row.row_number}</td>
                    <td>
                      <strong>{row.data.full_name || 'Nama kosong'}</strong>
                      <small>{row.data.employee_number || 'ID kosong'}</small>
                    </td>
                    <td>
                      {row.data.branch_code || 'Kode kosong'}
                      <small>{row.data.job_code || 'Kode kosong'}</small>
                    </td>
                    <td>
                      <span className={`status ${row.errors.length ? 'pending' : 'ok'}`}>
                        {row.errors.length
                          ? 'Perlu perbaikan'
                          : row.outcome === 'created'
                            ? 'Staf dibuat'
                            : 'Valid'}
                      </span>
                      {row.errors.map((msg, i) => (
                        <small key={i}>{msg}</small>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="empty">Tidak ada baris untuk filter ini.</div>}
          <div className="import-pagination">
            <span>
              {Math.min(limit, visible.length)} dari {visible.length} baris ditampilkan
            </span>
            {visible.length > limit && (
              <button className="secondary" onClick={() => setLimit((v) => v + 100)}>
                Tampilkan 100 berikutnya
              </button>
            )}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="data-section">
          <div className="section-heading">
            <div>
              <h2>Batch terbaru perusahaan</h2>
              <p>Lanjutkan pratinjau atau periksa hasil ketika koneksi terputus.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dibuat</th>
                  <th>Jumlah</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {new Date(r.created_at).toLocaleString('id-ID')}
                      <small className="mono">{r.id}</small>
                    </td>
                    <td>{r.total} baris</td>
                    <td>
                      {r.status === 'committed'
                        ? `${r.result?.created ?? 0} staf dibuat`
                        : new Date(r.expires_at).getTime() < Date.now()
                          ? 'Kedaluwarsa'
                          : 'Menunggu konfirmasi'}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void open(r.id)}
                      >
                        Buka batch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
