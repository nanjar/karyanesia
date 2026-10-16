'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { PracticeRubricsPanel } from '../components/practice-rubrics-panel';
import { OnboardingAssignmentsPanel } from '../components/onboarding-assignments-panel';
import { OnboardingPathsPanel } from '../components/onboarding-paths-panel';
import { LearningPanel } from '../components/learning-panel';
import { StaffImportPanel } from '../components/staff-import-panel';
import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
  X,
  BriefcaseBusiness,
  RefreshCw,
  Upload,
} from 'lucide-react';
type Actor = {
  id: string;
  full_name: string;
  role: string;
  employee_number: string;
  tenant_name: string;
};
type Branch = { id: string; code: string; name: string; timezone: string };
type Job = { id: string; code: string; name: string };
type Staff = {
  id: string;
  employee_number: string;
  full_name: string;
  role: string;
  active: boolean;
  activated: boolean;
  branch_name: string | null;
  job_name: string | null;
};
type Summary = {
  active_staff: number;
  awaiting_activation: number;
  staffed_branches: number;
  as_of: string;
};
type EventRow = { id: string; action: string; created_at: string; correlation_id: string };
const labels: Record<string, string> = {
  OWNER: 'Pemilik',
  ADMIN: 'Admin',
  HR: 'HR & Pelatihan',
  OPERATIONS: 'Operasional',
  SUPERVISOR: 'Supervisor',
  STAFF: 'Staf',
};
export default function Page() {
  const [actor, setActor] = useState<Actor | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    api<Actor>('auth/me')
      .then(setActor)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <main className="loading" aria-live="polite">
        <div className="brand-symbol">k</div>
        <p>Membuka ruang kerja…</p>
      </main>
    );
  return actor ? (
    <Workspace actor={actor} onExit={() => setActor(null)} />
  ) : (
    <Auth initialError={error} onLogin={setActor} />
  );
}
function Auth({ onLogin, initialError }: { onLogin: (a: Actor) => void; initialError: string }) {
  const [activate, setActivate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [message, setMessage] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const d = new FormData(e.currentTarget);
    try {
      if (activate) {
        const result = await api<{ message: string }>('auth/activate', 'POST', {
          token: d.get('token'),
          password: d.get('password'),
        });
        setMessage(result.message);
        setActivate(false);
      } else {
        await api('auth/login', 'POST', {
          company_code: d.get('company_code'),
          employee_number: d.get('employee_number'),
          password: d.get('password'),
          ...(d.get('otp') ? { otp: d.get('otp') } : {}),
        });
        onLogin(await api<Actor>('auth/me'));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-symbol">k</span>Karyanesia<span className="brand-dot">.</span>
        </a>
        <div>
          <span className="eyebrow light">RUANG UNTUK BERTUMBUH</span>
          <h1>
            Siap kerja.
            <br />
            Terampil
            <br />
            <em>berkarya.</em>
          </h1>
          <p>Bangun tim yang siap menjalankan standar kerja, di setiap lokasi.</p>
        </div>
        <div className="story-footer">
          <ShieldCheck size={20} />
          <span>Ruang kerja pribadi untuk perusahaan Anda</span>
        </div>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <span className="eyebrow">SELAMAT DATANG DI KARYANESIA</span>
          <h2>{activate ? 'Aktifkan akun Anda' : 'Masuk ke ruang kerja'}</h2>
          <p>
            {activate
              ? 'Gunakan kode yang diberikan admin perusahaan.'
              : 'Gunakan kode perusahaan dan ID karyawan Anda.'}
          </p>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="alert success">
              {message}
            </div>
          )}
          <form onSubmit={submit} key={activate ? 'activation' : 'login'}>
            {activate ? (
              <label>
                Kode aktivasi
                <input name="token" required autoComplete="off" spellCheck={false} />
              </label>
            ) : (
              <>
                <label>
                  Kode perusahaan
                  <input
                    name="company_code"
                    required
                    autoComplete="organization"
                    maxLength={64}
                    placeholder="Kode dari admin perusahaan"
                  />
                </label>
                <label>
                  ID karyawan
                  <input name="employee_number" required autoComplete="username" maxLength={64} />
                </label>
              </>
            )}
            <label>
              {activate ? 'Buat password' : 'Password'}
              <input
                name="password"
                type="password"
                required
                minLength={activate ? 12 : 1}
                maxLength={128}
                autoComplete={activate ? 'new-password' : 'current-password'}
              />
              {activate && <small>Minimal 12 karakter. Gunakan password unik.</small>}
            </label>
            {!activate && (
              <label>
                Kode autentikator <small>(wajib untuk admin)</small>
                <input
                  name="otp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="6 digit"
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Memproses…' : activate ? 'Aktifkan akun' : 'Masuk'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setActivate(!activate);
              setError('');
              setMessage('');
            }}
          >
            {activate ? 'Kembali ke halaman masuk' : 'Pekerja baru? Aktifkan akun Anda'}
          </button>
          <p className="help">
            Belum punya kode atau perlu reset password? Hubungi admin perusahaan Anda.
          </p>
        </div>
        <span className="version">Karyanesia v0.0.1 · Fondasi organisasi</span>
      </section>
    </main>
  );
}
function Workspace({ actor, onExit }: { actor: Actor; onExit: () => void }) {
  const admin = ['OWNER', 'ADMIN'].includes(actor.role);
  const [tab, setTab] = useState('overview'),
    [modal, setModal] = useState(''),
    [branches, setBranches] = useState<Branch[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [staff, setStaff] = useState<Staff[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [events, setEvents] = useState<EventRow[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [activation, setActivation] = useState(''),
    [notice, setNotice] = useState('');
  const handleError = useCallback(
    (e: Error & { status?: number }) => {
      if (e.status === 401) {
        onExit();
        return;
      }
      setError(e.message);
    },
    [onExit],
  );
  const load = useCallback(async () => {
    setError('');
    try {
      const [b, j, m, s] = await Promise.all([
        api<Branch[]>('branches'),
        api<Job[]>('jobs'),
        api<{ items: Staff[]; next_cursor: string | null }>('memberships'),
        api<Summary>('organization/summary'),
      ]);
      setBranches(b);
      setJobs(j);
      setStaff(m.items);
      setCursor(m.next_cursor);
      setSummary(s);
      if (admin) setEvents(await api<EventRow[]>('audit-events'));
      setReady(true);
    } catch (e) {
      handleError(e as Error);
    }
  }, [admin, handleError]);
  // Reload only when authenticated identity changes. Mutations call load explicitly.
  useEffect(() => {
    void load();
  }, [actor.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const d = new FormData(e.currentTarget),
      kind = modal;
    try {
      if (kind === 'branch')
        await api('branches', 'POST', {
          code: d.get('code'),
          name: d.get('name'),
          timezone: d.get('timezone'),
        });
      if (kind === 'job') await api('jobs', 'POST', { code: d.get('code'), name: d.get('name') });
      if (kind === 'staff') {
        const r = await api<{ activation_token: string }>('memberships', 'POST', {
          employee_number: d.get('employee_number'),
          full_name: d.get('full_name'),
          branch_id: d.get('branch_id'),
          job_id: d.get('job_id'),
          role: d.get('role'),
        });
        setActivation(r.activation_token);
      }
      setModal('');
      setNotice(
        kind === 'staff'
          ? 'Staf berhasil ditambahkan. Bagikan kode aktivasi secara aman.'
          : 'Data berhasil disimpan.',
      );
      await load();
    } catch (e) {
      handleError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(id: string) {
    if (!window.confirm('Nonaktifkan staf ini? Seluruh sesi login staf akan dicabut.')) return;
    setBusy(true);
    try {
      await api(`memberships/${id}/deactivate`, 'PATCH');
      setNotice('Staf dinonaktifkan dan sesi dicabut.');
      await load();
    } catch (e) {
      handleError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function reissue(id: string) {
    if (!window.confirm('Buat kode aktivasi baru? Kode sebelumnya tidak akan berlaku.')) return;
    setBusy(true);
    try {
      const r = await api<{ activation_token: string }>(
        `memberships/${id}/activation-token`,
        'POST',
      );
      setActivation(r.activation_token);
      setNotice('Kode aktivasi baru dibuat. Kode sebelumnya dibatalkan.');
    } catch (e) {
      handleError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const r = await api<{ items: Staff[]; next_cursor: string | null }>(
        `memberships?after=${cursor}`,
      );
      setStaff((v) => [...v, ...r.items]);
      setCursor(r.next_cursor);
    } catch (e) {
      handleError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  const title: Record<string, string> = {
    overview: 'Ringkasan organisasi',
    staff: 'Organisasi & staf',
    branches: 'Cabang perusahaan',
    jobs: 'Jabatan',
    audit: 'Riwayat aktivitas',
    import: 'Impor staf CSV',
    learning: 'Materi & kuis teori',
    paths: 'Jalur onboarding',
    rubrics: 'Rubrik praktik',
    assignments: 'Tugas onboarding',
  };
  const nav = [
    { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'learning', label: 'Materi & kuis', icon: GraduationCap },
    { id: 'assignments', label: 'Tugas onboarding', icon: ClipboardCheck },
    ...(admin
      ? [
          { id: 'paths', label: 'Jalur onboarding', icon: GraduationCap },
          { id: 'rubrics', label: 'Rubrik praktik', icon: ClipboardCheck },
        ]
      : []),
    {
      id: 'staff',
      label: actor.role === 'STAFF' ? 'Profil staf' : 'Organisasi & staf',
      icon: Users,
    },
    ...(admin ? [{ id: 'import', label: 'Impor staf CSV', icon: Upload }] : []),
    { id: 'branches', label: 'Cabang', icon: Building2 },
    { id: 'jobs', label: 'Jabatan', icon: BriefcaseBusiness },
    ...(admin ? [{ id: 'audit', label: 'Riwayat aktivitas', icon: ShieldCheck }] : []),
  ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-symbol">k</span>Karyanesia<span className="brand-dot">.</span>
        </a>
        <div className="company">
          <div className="company-icon">
            <Building2 size={21} />
          </div>
          <div>
            <strong>{actor.tenant_name}</strong>
            <small>Ruang kerja perusahaan</small>
          </div>
        </div>
        <span className="nav-heading">RUANG KERJA</span>
        <nav aria-label="Navigasi utama">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? 'active' : ''}
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => {
                setTab(n.id);
                setActivation('');
                setNotice('');
              }}
            >
              <n.icon size={19} />
              {n.label}
              {tab === n.id && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="coming">
          <span className="nav-heading">TAHAP BERIKUTNYA</span>
          <span>
            <GraduationCap size={18} />
            Bukti & permintaan review
          </span>
          <span>
            <ClipboardCheck size={18} />
            SOP harian
          </span>
          <small>Pengembangan mengikuti PRD v0.0.1</small>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">{actor.full_name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{actor.full_name}</strong>
            <small>{labels[actor.role]}</small>
          </div>
          <button
            aria-label="Keluar"
            disabled={busy}
            onClick={async () => {
              try {
                await api('auth/logout', 'POST');
                onExit();
              } catch (e) {
                handleError(e as Error);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Ruang kerja</span>
            <ChevronRight size={14} />
            <span>{title[tab]}</span>
          </div>
          <div className="topbar-account">
            <span className="system-status">
              <span />
              Sesi aktif
            </span>
            <button
              className="mobile-logout"
              aria-label="Keluar"
              disabled={busy}
              onClick={async () => {
                try {
                  await api('auth/logout', 'POST');
                  onExit();
                } catch (e) {
                  handleError(e as Error);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {new Date().toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <h1>
                {tab === 'overview'
                  ? `Selamat datang, ${actor.full_name.split(' ')[0]}.`
                  : title[tab]}
              </h1>
              <p>
                {tab === 'overview'
                  ? 'Persiapkan fondasi tim untuk tumbuh bersama.'
                  : 'Kelola data dengan akses sesuai peran Anda.'}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => void load()}
              disabled={busy}
              aria-label="Perbarui data"
            >
              <RefreshCw size={17} />
              Perbarui
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button className="text-button" onClick={() => void load()}>
                Coba lagi
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <Check size={18} />
              {notice}
            </div>
          )}
          {activation && (
            <section className="activation-box">
              <div>
                <strong>Kode aktivasi sekali pakai</strong>
                <p>Berlaku 24 jam. Kode ini hanya tampil setelah staf dibuat.</p>
                <code>{activation}</code>
              </div>
              <button aria-label="Tutup kode aktivasi" onClick={() => setActivation('')}>
                <X size={20} />
              </button>
            </section>
          )}
          {!ready ? (
            <div className="empty">
              {error ? 'Data belum dapat dimuat.' : 'Memuat data organisasi…'}
            </div>
          ) : (
            <>
              {tab === 'assignments' && (
                <OnboardingAssignmentsPanel
                  admin={admin}
                  actorId={actor.id}
                  canAssess={admin || actor.role === 'SUPERVISOR'}
                  onError={handleError}
                />
              )}
              {tab === 'rubrics' && admin && <PracticeRubricsPanel onError={handleError} />}
              {tab === 'paths' && admin && <OnboardingPathsPanel onError={handleError} />}
              {tab === 'learning' && (
                <LearningPanel
                  admin={admin}
                  canReset={admin || actor.role === 'SUPERVISOR'}
                  onError={handleError}
                />
              )}
              {tab === 'import' && admin && (
                <StaffImportPanel onCommitted={load} onError={handleError} />
              )}
              {tab === 'overview' && (
                <>
                  <section className="stats" aria-label="Statistik organisasi">
                    <article className="stat-blue">
                      <span>Staf aktif</span>
                      <Users size={20} />
                      <strong>{summary?.active_staff ?? 0}</strong>
                      <small>Dalam cakupan akses Anda</small>
                    </article>
                    <article className="stat-violet">
                      <span>Menunggu aktivasi</span>
                      <ShieldCheck size={20} />
                      <strong>{summary?.awaiting_activation ?? 0}</strong>
                      <small>Akun belum membuat password</small>
                    </article>
                    <article className="stat-mint">
                      <span>Cabang dengan staf</span>
                      <Building2 size={20} />
                      <strong>{summary?.staffed_branches ?? 0}</strong>
                      <small>Memiliki staf aktif</small>
                    </article>
                    <article className="stat-amber">
                      <span>Jabatan terlihat</span>
                      <BriefcaseBusiness size={20} />
                      <strong>{jobs.length}</strong>
                      <small>Dalam daftar akses Anda</small>
                    </article>
                  </section>
                  <section className="overview-grid">
                    <div className="setup-block">
                      <span className="eyebrow">LANGKAH AWAL</span>
                      <h2>
                        Tim yang siap berawal
                        <br />
                        dari organisasi yang rapi.
                      </h2>
                      <p>
                        Tambahkan cabang dan jabatan, lalu undang staf untuk mengaktifkan akun
                        mereka.
                      </p>
                      {admin ? (
                        <button
                          className="primary"
                          onClick={() =>
                            setModal(
                              branches.length === 0
                                ? 'branch'
                                : jobs.length === 0
                                  ? 'job'
                                  : 'staff',
                            )
                          }
                        >
                          Siapkan organisasi
                          <ArrowUpRight size={18} />
                        </button>
                      ) : (
                        <p className="scope-note">Hubungi admin untuk perubahan data organisasi.</p>
                      )}
                    </div>
                    <div className="setup-list">
                      <h3>Kesiapan organisasi</h3>
                      {[
                        [branches.length > 0, 'Cabang terdaftar', 'Lokasi kerja dan zona waktu'],
                        [jobs.length > 0, 'Jabatan tersedia', 'Peran operasional perusahaan'],
                        [
                          (summary?.active_staff ?? 0) > 1,
                          'Staf terdaftar',
                          'Akun individu untuk tim',
                        ],
                      ].map(([ok, label, desc]) => (
                        <div className="setup-item" key={String(label)}>
                          <span className={ok ? 'step-check done' : 'step-check'}>
                            {ok ? <Check size={17} /> : <span />}
                          </span>
                          <div>
                            <strong>{label}</strong>
                            <small>{desc}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="footnote">
                    Statistik organisasi aktual · Diperbarui{' '}
                    {summary ? new Date(summary.as_of).toLocaleTimeString('id-ID') : ''}. Metrik
                    pelatihan tersedia setelah modul terkait diimplementasikan.
                  </div>
                </>
              )}
              {tab === 'staff' && (
                <section className="data-section">
                  <div className="section-heading">
                    <div>
                      <h2>{actor.role === 'STAFF' ? 'Profil Anda' : 'Direktori staf'}</h2>
                      <p>Data staf dan status aktivasi akun.</p>
                    </div>
                    {admin && (
                      <button
                        className="primary"
                        onClick={() => setModal('staff')}
                        disabled={!branches.length || !jobs.length}
                      >
                        <Plus size={18} />
                        Tambah staf
                      </button>
                    )}
                  </div>
                  {admin && (!branches.length || !jobs.length) && (
                    <p className="inline-help">Tambahkan cabang dan jabatan terlebih dahulu.</p>
                  )}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nama karyawan</th>
                          <th>Cabang / jabatan</th>
                          <th>Peran</th>
                          <th>Status</th>
                          {admin && <th>Aksi</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {staff.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.full_name}</strong>
                              <small>{m.employee_number}</small>
                            </td>
                            <td>
                              {m.branch_name || 'Belum ditetapkan'}
                              <small>{m.job_name || 'Belum ditetapkan'}</small>
                            </td>
                            <td>{labels[m.role]}</td>
                            <td>
                              <span
                                className={`status ${!m.active ? 'inactive' : m.activated ? 'ok' : 'pending'}`}
                              >
                                {!m.active
                                  ? 'Nonaktif'
                                  : m.activated
                                    ? 'Aktif'
                                    : 'Menunggu aktivasi'}
                              </span>
                            </td>
                            {admin && (
                              <td>
                                {m.active && !m.activated && (
                                  <button
                                    className="text-button"
                                    disabled={busy}
                                    onClick={() => void reissue(m.id)}
                                  >
                                    Kode baru
                                  </button>
                                )}
                                {m.active && !['OWNER', 'ADMIN'].includes(m.role) && (
                                  <button
                                    className="danger-link"
                                    disabled={busy}
                                    onClick={() => void deactivate(m.id)}
                                  >
                                    Nonaktifkan
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!staff.length && (
                    <div className="empty">Belum ada staf dalam cakupan akses Anda.</div>
                  )}
                  {cursor && (
                    <button
                      className="secondary load-more"
                      disabled={busy}
                      onClick={() => void more()}
                    >
                      Muat staf berikutnya
                    </button>
                  )}
                </section>
              )}
              {tab === 'branches' && (
                <section className="data-section">
                  <div className="section-heading">
                    <div>
                      <h2>Daftar cabang</h2>
                      <p>Lokasi kerja dan zona waktu operasional.</p>
                    </div>
                    {admin && (
                      <button className="primary" onClick={() => setModal('branch')}>
                        <Plus size={18} />
                        Tambah cabang
                      </button>
                    )}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Kode</th>
                          <th>Nama cabang</th>
                          <th>Zona waktu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map((b) => (
                          <tr key={b.id}>
                            <td>{b.code}</td>
                            <td>
                              <strong>{b.name}</strong>
                            </td>
                            <td>{b.timezone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!branches.length && (
                    <div className="empty">
                      <Building2 size={32} />
                      <h3>Belum ada cabang</h3>
                      <p>
                        {admin
                          ? 'Tambahkan lokasi kerja pertama perusahaan Anda.'
                          : 'Belum ada cabang pada cakupan akses Anda.'}
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab === 'jobs' && (
                <section className="data-section">
                  <div className="section-heading">
                    <div>
                      <h2>Jabatan operasional</h2>
                      <p>Fondasi untuk jalur pelatihan sesuai pekerjaan.</p>
                    </div>
                    {admin && (
                      <button className="primary" onClick={() => setModal('job')}>
                        <Plus size={18} />
                        Tambah jabatan
                      </button>
                    )}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Kode</th>
                          <th>Nama jabatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((j) => (
                          <tr key={j.id}>
                            <td>{j.code}</td>
                            <td>
                              <strong>{j.name}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!jobs.length && (
                    <div className="empty">
                      <BriefcaseBusiness size={32} />
                      <h3>Belum ada jabatan</h3>
                      <p>
                        {admin
                          ? 'Mulai dengan kasir, pramuniaga, atau kepala shift.'
                          : 'Admin belum menambahkan jabatan.'}
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab === 'audit' && admin && (
                <section className="data-section">
                  <div className="section-heading">
                    <div>
                      <h2>Jejak aktivitas organisasi</h2>
                      <p>50 kejadian terbaru dalam perusahaan Anda.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Aktivitas</th>
                          <th>Waktu</th>
                          <th>Referensi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((ev) => (
                          <tr key={ev.id}>
                            <td>
                              <strong>{ev.action}</strong>
                            </td>
                            <td>{new Date(ev.created_at).toLocaleString('id-ID')}</td>
                            <td>
                              <small className="mono">{ev.correlation_id}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!events.length && <div className="empty">Belum ada aktivitas tercatat.</div>}
                </section>
              )}
            </>
          )}
        </main>
        <footer>
          Karyanesia <span>Siap Kerja. Terampil Berkarya.</span>
          <small>v0.0.1 · Fondasi organisasi</small>
        </footer>
      </div>
      {modal && (
        <ModalFrame busy={busy} onClose={() => setModal('')}>
          <div className="modal-inner">
            <button
              className="close"
              aria-label="Tutup formulir"
              disabled={busy}
              onClick={() => setModal('')}
            >
              <X size={22} />
            </button>
            <span className="eyebrow">ORGANISASI</span>
            <h2 id="modal-title">
              Tambah {modal === 'staff' ? 'staf' : modal === 'branch' ? 'cabang' : 'jabatan'}
            </h2>
            {error && (
              <div role="alert" className="alert error">
                {error}
              </div>
            )}
            <form onSubmit={submit}>
              {modal === 'staff' ? (
                <>
                  <label>
                    ID karyawan
                    <input
                      name="employee_number"
                      required
                      pattern="[a-zA-Z0-9_-]+"
                      maxLength={64}
                      autoFocus
                    />
                  </label>
                  <label>
                    Nama lengkap
                    <input name="full_name" required maxLength={120} />
                  </label>
                  <label>
                    Cabang
                    <select name="branch_id" required>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Jabatan
                    <select name="job_id" required>
                      {jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Peran akses
                    <select name="role">
                      <option value="STAFF">Staf</option>
                      <option value="SUPERVISOR">Supervisor cabang</option>
                    </select>
                  </label>
                  <p className="inline-help">
                    Kode aktivasi akan tampil satu kali setelah disimpan. Bagikan melalui kanal
                    internal yang aman.
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Kode
                    <input name="code" required pattern="[a-zA-Z0-9_-]+" maxLength={64} autoFocus />
                  </label>
                  <label>
                    Nama {modal === 'branch' ? 'cabang' : 'jabatan'}
                    <input name="name" required maxLength={120} />
                  </label>
                  {modal === 'branch' && (
                    <label>
                      Zona waktu
                      <select name="timezone">
                        <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                        <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                        <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal('')}
                >
                  Batal
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Menyimpan…' : 'Simpan'}
                  <Check size={17} />
                </button>
              </div>
            </form>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

function ModalFrame({
  children,
  busy,
  onClose,
}: {
  children: React.ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
