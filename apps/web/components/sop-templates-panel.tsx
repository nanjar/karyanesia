'use client';
import { useEffect, useState } from 'react';
import { PagedMore } from './paged-more';
import { api } from '../app/api';
type Kind = 'boolean' | 'number' | 'text' | 'photo';
type Item = {
  position?: number;
  label: string;
  kind: Kind;
  required: boolean;
  critical: boolean;
  issue_required: boolean;
  expected?: boolean;
  unit?: string;
  min?: number | null;
  max?: number | null;
  max_length?: number;
};
type Content = {
  title: string;
  instructions: string;
  branch_ids: string[];
  job_ids: string[];
  shift_label: string;
  start_time: string;
  due_time: string;
  due_next_day: boolean;
  auto_accept: boolean;
  items: Item[];
};
type Target = { id: string; name: string; code: string; timezone?: string };
type Detail = {
  id: string;
  version: number;
  status: string;
  content: Content & { targets: { branches: Target[]; jobs: Target[] } };
};
function newItem(kind: Kind): Item {
  return {
    kind,
    label: '',
    required: true,
    critical: false,
    issue_required: false,
    ...(kind === 'boolean'
      ? { expected: true }
      : kind === 'number'
        ? { unit: '', min: null, max: null }
        : kind === 'text'
          ? { max_length: 2000 }
          : {}),
  };
}
function cleanContent(c: Content): Content {
  return {
    title: c.title,
    instructions: c.instructions,
    branch_ids: c.branch_ids,
    job_ids: c.job_ids,
    shift_label: c.shift_label,
    start_time: c.start_time,
    due_time: c.due_time,
    due_next_day: c.due_next_day,
    auto_accept: c.auto_accept,
    items: c.items.map(({ position, ...item }) => item),
  };
}
export function SopTemplatesPanel({ onError }: { onError: (e: Error) => void }) {
  const [items, setItems] = useState<
      { id: string; title: string; version: number; status: string }[]
    >([]),
    [branches, setBranches] = useState<Target[]>([]),
    [jobs, setJobs] = useState<Target[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [revision, setRevision] = useState<Detail | null>(null),
    [serial, setSerial] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    const [t, b, j] = await Promise.all([
      api<{ items: typeof items }>('sop-templates'),
      api<Target[]>('branches'),
      api<Target[]>('jobs'),
    ]);
    setItems(t.items);
    setBranches(b);
    setJobs(j);
  }
  async function open(id: string) {
    setBusy(true);
    try {
      setDetail(await api<Detail>('sop-templates/' + id));
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  async function transition(action: 'publish' | 'archive') {
    if (
      !detail ||
      !window.confirm(
        action === 'publish'
          ? 'Terbitkan versi template SOP ini?'
          : 'Arsipkan template SOP ini? Histori tetap disimpan.',
      )
    )
      return;
    setBusy(true);
    try {
      await api(`sop-templates/${detail.id}/${action}`, 'POST', { confirm: true });
      await load();
      await open(detail.id);
      setNotice('Status template SOP diperbarui.');
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel sop-panel">
      <div className="alert">
        Kelola template SOP di sini. Buat jadwal dan jalankan tugas melalui menu SOP & kendala.
        Publikasi template saja belum membuat jadwal. Foto disimpan privat dan diperiksa sebelum
        tersedia.
      </div>
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <div className="learning-columns">
        <section className="panel">
          <h2>Pustaka template SOP</h2>
          <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
            Perbarui daftar
          </button>
          {!items.length && <p>Belum ada template SOP.</p>}
          {items.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              className="secondary learning-item"
              onClick={() => void open(t.id)}
            >
              {t.title} · v{t.version} ·{' '}
              {
                (
                  { draft: 'Draft', published: 'Terbit', archived: 'Diarsipkan' } as Record<
                    string,
                    string
                  >
                )[t.status]
              }
            </button>
          ))}
          <PagedMore
            path="sop-templates"
            lastId={items.at(-1)?.id}
            enabled={items.length > 0 && items.length % 100 === 0}
            onPage={(rows) => setItems((old) => [...old, ...rows])}
            onError={onError}
          />
        </section>
        {detail && (
          <section className="panel">
            <h2>
              {detail.content.title} · v{detail.version}
            </h2>
            <p className="learning-transcript">{detail.content.instructions}</p>
            <p>
              Shift {detail.content.shift_label} · {detail.content.start_time}–
              {detail.content.due_time}
              {detail.content.due_next_day ? ' hari berikutnya' : ''}
            </p>
            <p>
              Mode penerimaan:{' '}
              {detail.content.auto_accept
                ? 'Izinkan otomatis untuk risiko rendah'
                : 'Review manusia'}
            </p>
            <p>
              Cabang:{' '}
              {detail.content.targets.branches.map((b) => `${b.name} (${b.timezone})`).join(', ')}
            </p>
            <p>Jabatan: {detail.content.targets.jobs.map((j) => j.name).join(', ')}</p>
            <ol>
              {detail.content.items.map((i, n) => (
                <li key={n}>
                  <strong>{i.label}</strong>
                  <p>
                    {
                      (
                        {
                          boolean: 'Ya/tidak',
                          number: 'Angka',
                          text: 'Teks',
                          photo: 'Foto',
                        } as Record<Kind, string>
                      )[i.kind]
                    }{' '}
                    · {i.required ? 'Wajib' : 'Opsional'}{' '}
                    {i.critical && <span className="rubric-critical">Kritis</span>}
                  </p>
                  {i.kind === 'boolean' && <p>Jawaban sesuai: {i.expected ? 'Ya' : 'Tidak'}</p>}
                  {i.kind === 'number' && (
                    <p>
                      Rentang: {i.min ?? 'Tanpa batas bawah'} sampai {i.max ?? 'Tanpa batas atas'}{' '}
                      {i.unit}
                    </p>
                  )}
                  {i.kind === 'text' && <p>Maksimal {i.max_length} karakter.</p>}
                  {i.issue_required && (
                    <p>Pengajuan ditolak sampai kendala untuk item yang tidak sesuai dilaporkan.</p>
                  )}
                </li>
              ))}
            </ol>
            <div className="learning-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Muat template ke editor? Perubahan yang belum disimpan akan diganti.',
                    )
                  ) {
                    setRevision(detail);
                    setSerial((n) => n + 1);
                    setNotice('Template dimuat ke editor. Revisi menghasilkan draft versi baru.');
                  }
                }}
              >
                Revisi ke versi baru
              </button>
              {detail.status === 'draft' && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void transition('publish')}
                >
                  Terbitkan template
                </button>
              )}
              {detail.status === 'published' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void transition('archive')}
                >
                  Arsipkan template
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      <SopEditor
        key={`${revision?.id ?? 'new'}-${serial}`}
        initial={revision?.content ?? null}
        branches={branches}
        jobs={jobs}
        busy={busy}
        onCancel={() => {
          setRevision(null);
          setSerial((n) => n + 1);
        }}
        onSave={async (content) => {
          setBusy(true);
          try {
            const r = await api<{ id: string }>(
              revision ? `sop-templates/${revision.id}/revise` : 'sop-templates',
              'POST',
              cleanContent(content),
            );
            await load();
            await open(r.id);
            setRevision(null);
            setSerial((n) => n + 1);
            setNotice('Draft template SOP tersimpan. Tinjau sebelum diterbitkan.');
          } catch (e) {
            onError(e as Error);
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
function SopEditor({
  initial,
  branches,
  jobs,
  busy,
  onCancel,
  onSave,
}: {
  initial: Content | null;
  branches: Target[];
  jobs: Target[];
  busy: boolean;
  onCancel: () => void;
  onSave: (c: Content) => Promise<void>;
}) {
  const [content, setContent] = useState<Content>(() =>
    initial
      ? cleanContent(initial)
      : {
          title: '',
          instructions: '',
          branch_ids: [],
          job_ids: [],
          shift_label: '',
          start_time: '08:00',
          due_time: '17:00',
          due_next_day: false,
          auto_accept: false,
          items: [newItem('boolean')],
        },
  );
  function update(n: number, value: Partial<Item>) {
    setContent((c) => ({
      ...c,
      ...(value.critical ? { auto_accept: false } : {}),
      items: c.items.map((i, j) => (j === n ? { ...i, ...value } : i)),
    }));
  }
  return (
    <section className="panel">
      <h2>{initial ? 'Revisi template SOP' : 'Buat draft template SOP'}</h2>
      <p>
        1–30 item; minimal satu wajib. Item kritis selalu wajib dan menonaktifkan mode otomatis.
        Pilih maksimal 100 cabang dan 100 jabatan. Di desktop, gunakan Ctrl/Cmd untuk pilihan jamak.
      </p>
      <form
        className="learning-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave(content);
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Judul
            <input
              required
              maxLength={200}
              value={content.title}
              onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
            />
          </label>
          <label>
            Petunjuk SOP
            <textarea
              required
              maxLength={2000}
              rows={3}
              value={content.instructions}
              onChange={(e) => setContent((c) => ({ ...c, instructions: e.target.value }))}
            />
          </label>
          <label>
            Cabang sasaran
            <select
              multiple
              required
              size={4}
              value={content.branch_ids}
              onChange={(e) => {
                const ids = Array.from(e.target.selectedOptions, (o) => o.value);
                setContent((c) => ({ ...c, branch_ids: ids }));
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jabatan sasaran
            <select
              multiple
              required
              size={4}
              value={content.job_ids}
              onChange={(e) => {
                const ids = Array.from(e.target.selectedOptions, (o) => o.value);
                setContent((c) => ({ ...c, job_ids: ids }));
              }}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Label shift
            <input
              required
              maxLength={80}
              value={content.shift_label}
              onChange={(e) => setContent((c) => ({ ...c, shift_label: e.target.value }))}
            />
          </label>
          <label>
            Waktu mulai lokal
            <input
              type="time"
              required
              value={content.start_time}
              onChange={(e) => setContent((c) => ({ ...c, start_time: e.target.value }))}
            />
          </label>
          <label>
            Tenggat lokal
            <input
              type="time"
              required
              value={content.due_time}
              onChange={(e) => setContent((c) => ({ ...c, due_time: e.target.value }))}
            />
          </label>
          <label className="learning-option">
            <input
              type="checkbox"
              checked={content.due_next_day}
              onChange={(e) => setContent((c) => ({ ...c, due_next_day: e.target.checked }))}
            />
            Tenggat pada hari berikutnya (maksimal jendela 24 jam)
          </label>
          <label className="learning-option">
            <input
              type="checkbox"
              disabled={content.items.some((i) => i.critical)}
              checked={content.auto_accept}
              onChange={(e) => setContent((c) => ({ ...c, auto_accept: e.target.checked }))}
            />
            Izinkan penerimaan otomatis untuk risiko rendah
          </label>
          {content.items.map((item, n) => (
            <fieldset key={n}>
              <legend>Item {n + 1}</legend>
              <label>
                Pertanyaan/kriteria
                <input
                  required
                  maxLength={500}
                  value={item.label}
                  onChange={(e) => update(n, { label: e.target.value })}
                />
              </label>
              <label>
                Jenis jawaban
                <select
                  value={item.kind}
                  onChange={(e) => {
                    const next = newItem(e.target.value as Kind);
                    setContent((c) => ({
                      ...c,
                      items: c.items.map((i, j) =>
                        j === n
                          ? { ...next, label: i.label, required: i.required, critical: i.critical }
                          : i,
                      ),
                    }));
                  }}
                >
                  <option value="boolean">Ya/tidak</option>
                  <option value="number">Angka</option>
                  <option value="photo">Foto</option>
                  <option value="text">Teks</option>
                </select>
              </label>
              {item.kind === 'boolean' && (
                <label>
                  Jawaban sesuai SOP
                  <select
                    value={String(item.expected)}
                    onChange={(e) => update(n, { expected: e.target.value === 'true' })}
                  >
                    <option value="true">Ya</option>
                    <option value="false">Tidak</option>
                  </select>
                </label>
              )}
              {item.kind === 'number' && (
                <>
                  <label>
                    Satuan
                    <input
                      required
                      maxLength={40}
                      value={item.unit}
                      onChange={(e) => update(n, { unit: e.target.value })}
                    />
                  </label>
                  <label>
                    Batas minimum
                    <input
                      type="number"
                      step="any"
                      min={-1e9}
                      max={1e9}
                      value={item.min ?? ''}
                      onChange={(e) =>
                        update(n, { min: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Batas maksimum
                    <input
                      type="number"
                      step="any"
                      min={-1e9}
                      max={1e9}
                      value={item.max ?? ''}
                      onChange={(e) =>
                        update(n, { max: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  </label>
                  <p>Isi minimal satu batas. Nilai harus antara -1 miliar dan 1 miliar.</p>
                </>
              )}
              {item.kind === 'text' && (
                <label>
                  Maksimal karakter
                  <input
                    required
                    type="number"
                    min={1}
                    max={4000}
                    value={item.max_length}
                    onChange={(e) => update(n, { max_length: Number(e.target.value) })}
                  />
                </label>
              )}
              <label className="learning-option">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(e) =>
                    update(n, {
                      required: e.target.checked,
                      ...(!e.target.checked ? { critical: false } : {}),
                    })
                  }
                />
                Wajib
              </label>
              <label className="learning-option">
                <input
                  type="checkbox"
                  checked={item.critical}
                  onChange={(e) =>
                    update(n, {
                      critical: e.target.checked,
                      ...(e.target.checked ? { required: true } : {}),
                    })
                  }
                />
                Kritis — memerlukan review manusia
              </label>
              {!['text', 'photo'].includes(item.kind) && (
                <label className="learning-option">
                  <input
                    type="checkbox"
                    checked={item.issue_required}
                    onChange={(e) => update(n, { issue_required: e.target.checked })}
                  />
                  Wajib laporkan kendala bila jawaban tidak sesuai
                </label>
              )}
              <button
                className="text-button"
                type="button"
                disabled={content.items.length <= 1}
                onClick={() => {
                  if (window.confirm('Hapus item ini dari draft?'))
                    setContent((c) => ({ ...c, items: c.items.filter((_, j) => j !== n) }));
                }}
              >
                Hapus item {n + 1}
              </button>
            </fieldset>
          ))}
          <div className="learning-actions">
            <button
              className="secondary"
              type="button"
              disabled={content.items.length >= 30}
              onClick={() => setContent((c) => ({ ...c, items: [...c.items, newItem('boolean')] }))}
            >
              Tambah item ({content.items.length}/30)
            </button>
            <button className="primary">Simpan draft SOP</button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                if (window.confirm('Kosongkan editor? Perubahan yang belum disimpan akan hilang.'))
                  onCancel();
              }}
            >
              Kosongkan editor
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
