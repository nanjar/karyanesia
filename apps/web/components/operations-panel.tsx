'use client';
import { useEffect, useState, useRef } from 'react';
import { ImageUpload, PrivateImage } from './private-image';
import { allMembers, PagedMore } from './paged-more';
import { IssueCard } from './issue-card';
import { api } from '../app/api';
type Row = Record<string, any>;
const statusLabel: Record<string, string> = {
  open: 'Terbuka',
  unassigned: 'Tanpa penerima',
  in_progress: 'Dikerjakan',
  submitted: 'Menunggu review',
  accepted: 'Diterima',
  changes_requested: 'Perlu perbaikan',
  excused: 'Dikecualikan',
  cancelled: 'Dibatalkan',
  assigned: 'Ditugaskan',
  resolved: 'Ditangani',
  closed: 'Ditutup',
  reopened: 'Dibuka kembali',
};
export function OperationsPanel({
  actor,
  onError,
}: {
  actor: { id: string; role: string };
  onError: (e: Error) => void;
}) {
  const [request, setRequest] = useState<{ title: string; text: boolean; resolve: (value: string | null) => void } | null>(null);
  function ask(title: string, text = true): Promise<string | null> {
    return new Promise((resolve) => setRequest({ title, text, resolve }));
  }
  function finishRequest(value: string | null) {
    request?.resolve(value);
    setRequest(null);
  }
  const issueKeys = useRef(new Map<string, string>());
  const admin = ['OWNER', 'ADMIN', 'OPERATIONS'].includes(actor.role);
  const [tasks, setTasks] = useState<Row[]>([]),
    [schedules, setSchedules] = useState<Row[]>([]),
    [templates, setTemplates] = useState<Row[]>([]),
    [branches, setBranches] = useState<Row[]>([]),
    [members, setMembers] = useState<Row[]>([]),
    [issues, setIssues] = useState<Row[]>([]),
    [detail, setDetail] = useState<Row | null>(null),
    [answers, setAnswers] = useState<Record<string, boolean | number | string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [branchId, setBranchId] = useState(''),
    [recipients, setRecipients] = useState<string[]>([]),
    [days, setDays] = useState([1, 2, 3, 4, 5, 6, 7]);
  async function load() {
    const [t, i, b] = await Promise.all([
      api<Row[]>('sop-instances'),
      api<Row[]>('issues'),
      api<Row[]>('branches'),
    ]);
    setTasks(t);
    setIssues(i);
    setBranches(b);
    if (['OWNER', 'ADMIN', 'OPERATIONS', 'SUPERVISOR'].includes(actor.role))
      setMembers((await allMembers()).items);
    if (admin) {
      const [s, v, m] = await Promise.all([
        api<Row[]>('sop-schedules'),
        api<{ items: Row[] }>('sop-templates'),
        allMembers(),
      ]);
      setSchedules(s);
      setTemplates(v.items.filter((x) => x.status === 'published'));
      setMembers(m.items);
    }
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    const d = await api<Row>('sop-instances/' + id);
    setDetail(d);
    setAnswers(d.state.answers);
  }
  async function event(action: string) {
    if (!detail) return;
    const reason = ['draft', 'submit'].includes(action)
      ? undefined
      : (await ask('Alasan')) || undefined;
    if (!['draft', 'submit'].includes(action) && !reason) return;
    if (action === 'submit' && !(await ask('Ajukan checklist untuk diperiksa?', false))) return;
    await run(async () => {
      await api(`sop-instances/${detail.id}/events`, 'POST', {
        key: crypto.randomUUID(),
        revision: detail.revision,
        action,
        ...(['draft', 'submit'].includes(action) ? { answers } : { reason }),
      });
      await open(detail.id);
      setNotice(action === 'draft' ? 'Draft tersimpan di server.' : 'Status checklist diperbarui.');
    });
  }
  return (
    <section className="learning-panel sop-panel">
      {request && <OperationDialog title={request.title} text={request.text} onFinish={finishRequest} />}
      <p className="alert">
        Untuk kondisi mendesak, segera hubungi supervisor atau kontak darurat internal perusahaan.
        Pelaporan di sini bukan layanan tanggap darurat.
      </p>
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {admin && (
        <details className="panel">
          <summary>Jadwal SOP</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void run(async () => {
                await api('sop-schedules', 'POST', {
                  template_version_id: templateId,
                  branch_id: branchId,
                  start_date: d.get('start_date'),
                  end_date: d.get('end_date'),
                  weekdays: days,
                  assignee_ids: recipients,
                });
                setNotice('Jadwal dibuat.');
              });
            }}
          >
            <label>
              Versi template
              <select
                required
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setRecipients([]);
                }}
              >
                <option value="">Pilih template terbit</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} v{t.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cabang
              <select
                required
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setRecipients([]);
                }}
              >
                <option value="">Pilih cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.timezone})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tanggal mulai
              <input required type="date" name="start_date" />
            </label>
            <label>
              Tanggal akhir
              <input required type="date" name="end_date" />
            </label>
            <fieldset>
              <legend>Hari pelaksanaan</legend>
              {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, i) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={days.includes(i + 1)}
                    onChange={(e) =>
                      setDays(e.target.checked ? [...days, i + 1] : days.filter((x) => x !== i + 1))
                    }
                  />
                  {d}
                </label>
              ))}
            </fieldset>
            <label>
              Penerima eksplisit
              <select
                multiple
                value={recipients}
                onChange={(e) =>
                  setRecipients(Array.from(e.target.selectedOptions, (o) => o.value))
                }
              >
                {members
                  .filter((m) => m.role === 'STAFF' && m.active && m.branch_id === branchId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} · {m.employee_number}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              Daftar menampilkan hingga 5.000 staf sesuai scope. Server memeriksa kesesuaian jabatan
              template. Tanpa penerima menghasilkan penanda unassigned.
            </p>
            <button className="primary" disabled={busy}>
              Buat jadwal
            </button>
          </form>
          {schedules.map((s) => (
            <form
              className="panel"
              key={s.id}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void run(async () => {
                  const result = await api<Row>(`sop-schedules/${s.id}/generate`, 'POST', {
                    local_date: d.get('local_date'),
                  });
                  setNotice(
                    `${result.assigned_count} tugas; tanpa penerima: ${result.unassigned ? 'ya' : 'tidak'}.`,
                  );
                });
              }}
            >
              <strong>
                {s.content.template.content.title} · {s.content.branch.name}
                {s.stopped ? ' · Dihentikan' : ''}
              </strong>
              <p>
                {s.content.start_date} — {s.content.end_date} · {s.content.timezone}
              </p>
              <label>
                Tanggal tugas
                <input
                  type="date"
                  name="local_date"
                  required
                  min={s.content.start_date}
                  max={s.content.end_date}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Bangkitkan / periksa tugas
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  const reason = await ask('Alasan menghentikan jadwal');
                  if (reason)
                    void run(async () => {
                      await api(`sop-schedules/${s.id}/stop`, 'POST', { reason });
                      setNotice('Jadwal dihentikan untuk pembangkitan berikutnya.');
                    });
                }}
              >
                Hentikan jadwal
              </button>
            </form>
          ))}
        </details>
      )}
      <div className="learning-columns">
        <section className="panel">
          <h2>SOP harian</h2>
          <button className="secondary" disabled={busy} onClick={() => void run(load)}>
            Perbarui
          </button>
          {!tasks.length && <p>Belum ada tugas SOP.</p>}
          {tasks.map((t) => (
            <button className="module-card" key={t.id} onClick={() => void run(() => open(t.id))}>
              <strong>{t.snapshot.template.content.title}</strong>
              <span>
                {t.local_date.slice(0, 10)} · {t.snapshot.shift_label} ·{' '}
                {statusLabel[t.state.status]}
              </span>
              <small>
                Tenggat{' '}
                {new Date(t.due_at).toLocaleString('id-ID', { timeZone: t.snapshot.timezone })} (
                {t.snapshot.timezone}){t.overdue ? ' · Lewat tenggat' : ''}
              </small>
            </button>
          ))}
          <PagedMore
            path="sop-instances"
            lastId={tasks.at(-1)?.id}
            enabled={tasks.length > 0 && tasks.length % 100 === 0}
            onPage={(rows) => setTasks((old) => [...old, ...rows])}
            onError={onError}
          />
        </section>
        <section className="panel">
          {!detail ? (
            <p>Pilih tugas untuk melihat item dan histori.</p>
          ) : (
            <>
              <h2>{detail.snapshot.template.content.title}</h2>
              <p>{detail.snapshot.template.content.instructions}</p>
              <p>
                Status: {statusLabel[detail.state.status]} · Revisi {detail.revision}
              </p>
              <p>
                {detail.snapshot.recipient?.full_name || 'Tanpa penerima'} ·{' '}
                {detail.snapshot.branch.name}
              </p>
              {detail.snapshot.template.content.items.map((i: Row) => {
                const key = String(i.position),
                  editable =
                    detail.assignee_id === actor.id &&
                    ['open', 'in_progress', 'changes_requested'].includes(detail.state.status);
                return (
                  <fieldset key={key} disabled={!editable || busy}>
                    <legend>
                      {i.label} {i.required ? '(wajib)' : ''} {i.critical ? '— Kritis' : ''}
                    </legend>
                    {i.kind === 'photo' ? (
                      <>
                        {typeof answers[key] === 'string' && (
                          <PrivateImage image={{ asset_id: String(answers[key]), alt: i.label }} />
                        )}
                        {editable && (
                          <ImageUpload
                            purpose="evidence"
                            instanceId={detail.id}
                            onError={onError}
                            onUploaded={(image) =>
                              setAnswers({ ...answers, [key]: image.asset_id })
                            }
                          />
                        )}
                      </>
                    ) : i.kind === 'boolean' ? (
                      <select
                        aria-label={i.label}
                        value={answers[key] === undefined ? '' : String(answers[key])}
                        onChange={(e) =>
                          setAnswers({ ...answers, [key]: e.target.value === 'true' })
                        }
                      >
                        <option value="" disabled>
                          Pilih jawaban
                        </option>
                        <option value="true">Ya</option>
                        <option value="false">Tidak</option>
                      </select>
                    ) : (
                      <input
                        aria-label={i.label}
                        type={i.kind === 'number' ? 'number' : 'text'}
                        step="any"
                        value={String(answers[key] ?? '')}
                        onChange={(e) => {
                          const next = { ...answers };
                          if (e.target.value === '') delete next[key];
                          else
                            next[key] =
                              i.kind === 'number' ? Number(e.target.value) : e.target.value;
                          setAnswers(next);
                        }}
                      />
                    )}
                    {i.unit && (
                      <p>
                        Satuan: {i.unit} · Batas {i.min ?? '—'} sampai {i.max ?? '—'}
                      </p>
                    )}
                    {detail.assignee_id === actor.id && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          const description = await ask(
                            'Uraikan kendala',
                          );
                          if (description)
                            void run(async () => {
                              await api('issues', 'POST', {
                                idempotency_key: (() => {
                                  const key = detail.id + ':' + i.position + ':' + description;
                                  const stored = issueKeys.current.get(key) || crypto.randomUUID();
                                  issueKeys.current.set(key, stored);
                                  return stored;
                                })(),
                                branch_id: detail.branch_id,
                                instance_id: detail.id,
                                item_position: i.position,
                                category: 'SOP',
                                description,
                                priority: i.critical ? 'high' : 'normal',
                              });
                              setNotice('Kendala tercatat.');
                            });
                        }}
                      >
                        Laporkan kendala item
                      </button>
                    )}
                  </fieldset>
                );
              })}
              {detail.assignee_id === actor.id &&
                ['open', 'in_progress', 'changes_requested'].includes(detail.state.status) && (
                  <div className="actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void event('draft')}
                    >
                      Simpan draft
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void event('submit')}
                    >
                      Ajukan checklist
                    </button>
                  </div>
                )}
              {detail.assignee_id !== actor.id &&
                ['OWNER', 'ADMIN', 'SUPERVISOR', 'OPERATIONS'].includes(actor.role) && (
                  <div className="actions">
                    {(detail.state.status === 'submitted'
                      ? ['accept', 'changes_requested', 'excused', 'cancelled']
                      : ['excused', 'cancelled']
                    ).map((a) => (
                      <button
                        key={a}
                        className="secondary"
                        disabled={busy}
                        onClick={() => void event(a)}
                      >
                        {
                          {
                            accept: 'Terima',
                            changes_requested: 'Minta perbaikan',
                            excused: 'Beri pengecualian',
                            cancelled: 'Batalkan',
                          }[a]
                        }
                      </button>
                    ))}
                  </div>
                )}
              <details>
                <summary>Histori ({detail.history.length})</summary>
                {detail.history.map((h: Row) => (
                  <p key={h.revision}>
                    #{h.revision} · {statusLabel[h.state.status]} ·{' '}
                    {new Date(h.created_at).toLocaleString('id-ID')} ·{' '}
                    {h.state.reason || 'Jawaban tersimpan'}
                  </p>
                ))}
              </details>
            </>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Kendala dan tindak lanjut</h2>
        <details>
          <summary>Laporkan kendala baru</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const input = {
                branch_id: String(data.get('branch_id')),
                category: String(data.get('category')),
                description: String(data.get('description')),
                priority: String(data.get('priority')),
              };
              const identity = JSON.stringify(input);
              const key = issueKeys.current.get(identity) || crypto.randomUUID();
              issueKeys.current.set(identity, key);
              void run(async () => {
                await api('issues', 'POST', { ...input, idempotency_key: key });
                setNotice(
                  'Kendala tercatat. Hubungi kontak internal langsung untuk kondisi mendesak.',
                );
              });
            }}
          >
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
              Kategori
              <input name="category" required maxLength={100} />
            </label>
            <label>
              Uraian
              <textarea name="description" required minLength={10} maxLength={2000} />
            </label>
            <label>
              Prioritas
              <select name="priority" defaultValue="normal">
                <option value="low">Rendah</option>
                <option value="normal">Normal</option>
                <option value="high">Tinggi</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Kirim laporan kendala
            </button>
          </form>
        </details>

        {!issues.length && <p>Belum ada kendala.</p>}
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            members={members}
            actor={actor}
            busy={busy}
            onAction={run}
            onError={onError}
          />
        ))}
        <PagedMore
          path="issues"
          lastId={issues.at(-1)?.id}
          enabled={issues.length > 0 && issues.length % 100 === 0}
          onPage={(rows) => setIssues((old) => [...old, ...rows])}
          onError={onError}
        />
      </section>
    </section>
  );
}

function OperationDialog({ title, text, onFinish }: {
  title: string;
  text: boolean;
  onFinish: (value: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLElement>('textarea, button')?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return (
    <dialog ref={dialog} className="modal" aria-labelledby="operation-dialog-title"
      onCancel={(event) => { event.preventDefault(); onFinish(null); }}>
      <div className="modal-inner">
        <h2 id="operation-dialog-title">{title}</h2>
        <form noValidate onSubmit={(event) => {
          event.preventDefault();
          if (text && value.trim().length < 10) {
            setError('Isi minimal 10 karakter.');
            return;
          }
          onFinish(text ? value.trim() : 'confirmed');
        }}>
          {text && <label>Uraian
            <textarea value={value} maxLength={2000}
              aria-describedby="operation-dialog-help" aria-invalid={!!error}
              onChange={(event) => { setValue(event.target.value); setError(''); }} />
            <small id="operation-dialog-help">Minimal 10, maksimal 2.000 karakter.</small>
          </label>}
          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => onFinish(null)}>Batal</button>
            <button className="primary" type="submit">{text ? 'Kirim' : 'Konfirmasi'}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
