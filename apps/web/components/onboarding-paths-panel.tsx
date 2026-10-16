'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Step = {
  version_id: string;
  due_days: number;
  prerequisite: number | null;
  practice_required: true;
  module_title?: string;
};
type Content = { title: string; description: string; steps: Step[] };
type Path = { id: string; version: number; status: string; content: Content };
type Module = { id: string; title: string; status: string; version: number };
export function OnboardingPathsPanel({ onError }: { onError: (e: Error) => void }) {
  const [items, setItems] = useState<
      { id: string; version: number; status: string; title: string }[]
    >([]),
    [modules, setModules] = useState<Module[]>([]),
    [detail, setDetail] = useState<Path | null>(null),
    [revision, setRevision] = useState<Path | null>(null),
    [serial, setSerial] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    const [paths, learning] = await Promise.all([
      api<{ items: typeof items }>('onboarding-paths'),
      api<{ items: Module[] }>('learning'),
    ]);
    setItems(paths.items);
    setModules(learning.items.filter((m) => m.status === 'published'));
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  async function open(id: string) {
    setBusy(true);
    try {
      setDetail(await api<Path>('onboarding-paths/' + id));
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function transition(action: 'publish' | 'archive') {
    if (
      !detail ||
      !window.confirm(
        action === 'publish'
          ? 'Terbitkan jalur dengan versi modul ini?'
          : 'Arsipkan versi jalur ini? Histori tetap disimpan.',
      )
    )
      return;
    setBusy(true);
    try {
      await api(`onboarding-paths/${detail.id}/${action}`, 'POST', { confirm: true });
      await load();
      await open(detail.id);
      setNotice(action === 'publish' ? 'Versi jalur diterbitkan.' : 'Versi jalur diarsipkan.');
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel">
      <div className="alert">
        Fondasi jalur onboarding. Penugasan ke staf, tenggat aktual dan observasi praktik belum
        tersedia. Publikasi jalur tidak membuat tugas atau menandai staf kompeten.
      </div>
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      <div className="learning-columns">
        <section className="panel">
          <h2>Pustaka jalur</h2>
          <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
            Perbarui daftar
          </button>
          {!items.length && <p>Belum ada jalur onboarding.</p>}
          {items.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              className="secondary learning-item"
              onClick={() => void open(p.id)}
            >
              {p.title} · v{p.version} ·{' '}
              {
                (
                  { draft: 'Draft', published: 'Terbit', archived: 'Diarsipkan' } as Record<
                    string,
                    string
                  >
                )[p.status]
              }
            </button>
          ))}
        </section>
        {detail && (
          <section className="panel">
            <h2>
              {detail.content.title} · v{detail.version}
            </h2>
            <p>{detail.content.description}</p>
            <ol>
              {detail.content.steps.map((s, i) => (
                <li key={s.version_id}>
                  <strong>{s.module_title}</strong>
                  <p>
                    Langkah {i + 1} · Tenggat H+{s.due_days} ·{' '}
                    {s.prerequisite ? `Prasyarat langkah ${s.prerequisite}` : 'Tanpa prasyarat'} ·
                    Praktik wajib
                  </p>
                  <small>Versi modul: {s.version_id}</small>
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
                      'Muat jalur ke editor? Perubahan yang belum disimpan akan diganti.',
                    )
                  ) {
                    setRevision(detail);
                    setSerial((n) => n + 1);
                    setNotice('Jalur dimuat ke editor. Revisi akan menghasilkan draft versi baru.');
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
                  Terbitkan jalur
                </button>
              )}
              {detail.status === 'published' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void transition('archive')}
                >
                  Arsipkan jalur
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      <PathEditor
        key={`${revision?.id ?? 'new'}-${serial}`}
        initial={revision}
        modules={modules}
        busy={busy}
        onCancel={() => {
          setRevision(null);
          setSerial((n) => n + 1);
        }}
        onSave={async (content) => {
          setBusy(true);
          try {
            const r = await api<{ id: string }>(
              revision ? `onboarding-paths/${revision.id}/revise` : 'onboarding-paths',
              'POST',
              content,
            );
            await load();
            await open(r.id);
            setRevision(null);
            setSerial((n) => n + 1);
            setNotice('Draft jalur tersimpan. Tinjau urutan dan tenggat sebelum publikasi.');
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
function PathEditor({
  initial,
  modules,
  busy,
  onCancel,
  onSave,
}: {
  initial: Path | null;
  modules: Module[];
  busy: boolean;
  onCancel: () => void;
  onSave: (c: Content) => Promise<void>;
}) {
  const [content, setContent] = useState<Content>(() =>
    initial
      ? {
          title: initial.content.title,
          description: initial.content.description,
          steps: initial.content.steps.map((s) => ({
            version_id: s.version_id,
            due_days: s.due_days,
            prerequisite: s.prerequisite,
            practice_required: true,
          })),
        }
      : {
          title: '',
          description: '',
          steps: [{ version_id: '', due_days: 0, prerequisite: null, practice_required: true }],
        },
  );
  function update(i: number, value: Partial<Step>) {
    setContent((c) => ({ ...c, steps: c.steps.map((s, j) => (i === j ? { ...s, ...value } : s)) }));
  }
  return (
    <section className="panel">
      <h2>{initial ? 'Revisi jalur ke draft baru' : 'Buat draft jalur'}</h2>
      <p>
        1–20 modul terbit. H+0 berarti hari mulai; tanggal aktual baru dihitung pada penugasan.
        Prasyarat diperiksa sebagai aturan jalur saat ini, belum membatasi pustaka belajar staf.
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
            Judul jalur
            <input
              required
              maxLength={200}
              value={content.title}
              onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
            />
          </label>
          <label>
            Deskripsi
            <textarea
              required
              maxLength={2000}
              rows={3}
              value={content.description}
              onChange={(e) => setContent((c) => ({ ...c, description: e.target.value }))}
            />
          </label>
          {content.steps.map((s, i) => (
            <fieldset key={i}>
              <legend>Langkah {i + 1}</legend>
              <label>
                Versi modul terbit
                <select
                  required
                  value={s.version_id}
                  onChange={(e) => update(i, { version_id: e.target.value })}
                >
                  <option value="">Pilih modul</option>
                  {s.version_id && !modules.some((m) => m.id === s.version_id) && (
                    <option value={s.version_id}>
                      Versi lama tidak tersedia — pilih pengganti
                    </option>
                  )}
                  {modules.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={content.steps.some((v, j) => j !== i && v.version_id === m.id)}
                    >
                      {m.title} · v{m.version}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tenggat (hari kalender sejak mulai)
                <input
                  type="number"
                  required
                  min={0}
                  max={365}
                  value={s.due_days}
                  onChange={(e) => update(i, { due_days: Number(e.target.value) })}
                />
              </label>
              <label>
                Prasyarat
                <select
                  value={s.prerequisite ?? ''}
                  onChange={(e) =>
                    update(i, { prerequisite: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">Tanpa prasyarat</option>
                  {Array.from({ length: i }, (_, j) => (
                    <option key={j} value={j + 1}>
                      Langkah {j + 1}
                    </option>
                  ))}
                </select>
              </label>
              <p>Observasi praktik wajib.</p>
              <button
                className="text-button"
                type="button"
                disabled={content.steps.length <= 1}
                onClick={() => {
                  if (
                    window.confirm(
                      'Hapus langkah ini? Prasyarat yang menunjuk langkah ini akan dikosongkan.',
                    )
                  )
                    setContent((c) => ({
                      ...c,
                      steps: c.steps
                        .filter((_, j) => j !== i)
                        .map((v) => ({
                          ...v,
                          prerequisite:
                            v.prerequisite === i + 1
                              ? null
                              : v.prerequisite !== null && v.prerequisite > i + 1
                                ? v.prerequisite - 1
                                : v.prerequisite,
                        })),
                    }));
                }}
              >
                Hapus langkah {i + 1}
              </button>
            </fieldset>
          ))}
          <div className="learning-actions">
            <button
              className="secondary"
              type="button"
              disabled={content.steps.length >= 20}
              onClick={() =>
                setContent((c) => ({
                  ...c,
                  steps: [
                    ...c.steps,
                    {
                      version_id: '',
                      due_days: c.steps.at(-1)?.due_days ?? 0,
                      prerequisite: null,
                      practice_required: true,
                    },
                  ],
                }))
              }
            >
              Tambah langkah ({content.steps.length}/20)
            </button>
            <button className="primary">Simpan draft jalur</button>
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
