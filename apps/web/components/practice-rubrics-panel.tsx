'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Content = {
  title: string;
  instructions: string;
  items: { label: string; required: boolean; critical: boolean }[];
};
type Rubric = { id: string; version: number; status: string; content: Content };
export function PracticeRubricsPanel({ onError }: { onError: (e: Error) => void }) {
  const [items, setItems] = useState<
      { id: string; title: string; version: number; status: string }[]
    >([]),
    [detail, setDetail] = useState<Rubric | null>(null),
    [revision, setRevision] = useState<Rubric | null>(null),
    [serial, setSerial] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    setItems((await api<{ items: typeof items }>('practice-rubrics')).items);
  }
  async function open(id: string) {
    setBusy(true);
    try {
      setDetail(await api<Rubric>('practice-rubrics/' + id));
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
          ? 'Terbitkan versi rubrik ini?'
          : 'Arsipkan rubrik? Snapshot pada tugas lama tetap disimpan.',
      )
    )
      return;
    setBusy(true);
    try {
      await api(`practice-rubrics/${detail.id}/${action}`, 'POST', { confirm: true });
      await load();
      await open(detail.id);
      setNotice('Status rubrik diperbarui.');
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel">
      <div className="alert">
        Siapkan rubrik, terbitkan, lalu pilih pada langkah jalur onboarding. Form observasi dan
        pengesahan hasil praktik belum tersedia. Rubrik tidak otomatis meluluskan staf.
      </div>
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      <div className="learning-columns">
        <section className="panel">
          <h2>Pustaka rubrik</h2>
          <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
            Perbarui daftar
          </button>
          {!items.length && <p>Belum ada rubrik praktik.</p>}
          {items.map((r) => (
            <button
              className="secondary learning-item"
              disabled={busy}
              key={r.id}
              onClick={() => void open(r.id)}
            >
              {r.title} · v{r.version} ·{' '}
              {
                (
                  { draft: 'Draft', published: 'Terbit', archived: 'Diarsipkan' } as Record<
                    string,
                    string
                  >
                )[r.status]
              }
            </button>
          ))}
        </section>
        {detail && (
          <section className="panel">
            <h2>
              {detail.content.title} · v{detail.version}
            </h2>
            <p className="learning-transcript">{detail.content.instructions}</p>
            <ol>
              {detail.content.items.map((item, i) => (
                <li key={i}>
                  <p>
                    {item.label} · {item.required ? 'Wajib' : 'Opsional'}{' '}
                    {item.critical && <span className="rubric-critical">Kritis</span>}
                  </p>
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
                      'Muat rubrik ke editor? Perubahan yang belum disimpan akan diganti.',
                    )
                  ) {
                    setRevision(detail);
                    setSerial((n) => n + 1);
                    setNotice('Revisi dimuat ke editor di bawah.');
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
                  Terbitkan rubrik
                </button>
              )}
              {detail.status === 'published' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void transition('archive')}
                >
                  Arsipkan rubrik
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      <RubricEditor
        key={`${revision?.id ?? 'new'}-${serial}`}
        initial={revision}
        busy={busy}
        onCancel={() => {
          setRevision(null);
          setSerial((n) => n + 1);
        }}
        onSave={async (content) => {
          setBusy(true);
          try {
            const r = await api<{ id: string }>(
              revision ? `practice-rubrics/${revision.id}/revise` : 'practice-rubrics',
              'POST',
              content,
            );
            await load();
            await open(r.id);
            setRevision(null);
            setSerial((n) => n + 1);
            setNotice('Draft rubrik tersimpan. Tinjau sebelum diterbitkan.');
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
function RubricEditor({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: Rubric | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (content: Content) => Promise<void>;
}) {
  const [content, setContent] = useState<Content>(() =>
    initial
      ? {
          title: initial.content.title,
          instructions: initial.content.instructions,
          items: initial.content.items.map((i) => ({
            label: i.label,
            required: i.required,
            critical: i.critical,
          })),
        }
      : { title: '', instructions: '', items: [{ label: '', required: true, critical: false }] },
  );
  function update(index: number, value: Partial<Content['items'][number]>) {
    setContent((c) => ({
      ...c,
      items: c.items.map((item, i) => (i === index ? { ...item, ...value } : item)),
    }));
  }
  return (
    <section className="panel">
      <h2>{initial ? 'Revisi rubrik ke versi baru' : 'Buat draft rubrik'}</h2>
      <p>
        Gunakan 1–20 item. Minimal satu item wajib. Item kritis selalu wajib dan harus lulus pada
        penilaian praktik.
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
            Petunjuk observasi
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={content.instructions}
              onChange={(e) => setContent((c) => ({ ...c, instructions: e.target.value }))}
            />
          </label>
          {content.items.map((item, i) => (
            <fieldset key={i}>
              <legend>Item {i + 1}</legend>
              <label>
                Kriteria yang diamati
                <input
                  required
                  maxLength={500}
                  value={item.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </label>
              <label className="learning-option">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(e) =>
                    update(i, {
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
                    update(i, {
                      critical: e.target.checked,
                      ...(e.target.checked ? { required: true } : {}),
                    })
                  }
                />
                Kritis — kegagalan menghalangi kompeten
              </label>
              <button
                className="text-button"
                type="button"
                disabled={content.items.length <= 1}
                onClick={() => {
                  if (window.confirm('Hapus item ini dari draft?'))
                    setContent((c) => ({ ...c, items: c.items.filter((_, j) => j !== i) }));
                }}
              >
                Hapus item {i + 1}
              </button>
            </fieldset>
          ))}
          <div className="learning-actions">
            <button
              className="secondary"
              type="button"
              disabled={content.items.length >= 20}
              onClick={() =>
                setContent((c) => ({
                  ...c,
                  items: [...c.items, { label: '', required: true, critical: false }],
                }))
              }
            >
              Tambah item ({content.items.length}/20)
            </button>
            <button className="primary">Simpan draft rubrik</button>
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
