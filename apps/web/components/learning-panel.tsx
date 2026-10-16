'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Content = {
  video_url?: string;
  title: string;
  objective: string;
  transcript: string;
  pass_score: number;
  questions: { prompt: string; options: string[]; correct?: number }[];
};
type Result = { score: number; passed: boolean; attempt: number };
type Detail = {
  id: string;
  version: number;
  status: string;
  content: Content;
  attempts: { id: string; result: Result }[];
};
export function LearningPanel({ admin, onError }: { admin: boolean; onError: (e: Error) => void }) {
  const [items, setItems] = useState<
      { id: string; title: string; status: string; version: number }[]
    >([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [answers, setAnswers] = useState<number[]>([]),
    [notice, setNotice] = useState(''),
    [key, setKey] = useState(''),
    [revision, setRevision] = useState<Detail | null>(null),
    [editorSerial, setEditorSerial] = useState(0);
  async function load() {
    setItems((await api<{ items: typeof items }>('learning')).items);
  }
  useEffect(() => {
    void load().catch(onError);
  }, []);
  async function open(id: string) {
    setBusy(true);
    try {
      setDetail(await api<Detail>('learning/' + id));
      setAnswers([]);
      setKey(crypto.randomUUID());
      setNotice('');
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel">
      <div className="alert">
        Materi teks, tautan video YouTube & kuis teori. Gambar, penugasan onboarding dan penilaian
        praktik belum tersedia. Lulus teori belum berarti kompeten.
      </div>
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      <div className="learning-columns">
        <section className="panel">
          <h2>Pustaka materi</h2>
          {!items.length && <p>Belum ada materi yang dapat ditampilkan.</p>}
          {items.map((i) => (
            <button
              className="secondary learning-item"
              disabled={busy}
              key={i.id}
              onClick={() => void open(i.id)}
            >
              {i.title} · v{i.version} ·{' '}
              {
                (
                  { draft: 'Draft', published: 'Terbit', archived: 'Diarsipkan' } as Record<
                    string,
                    string
                  >
                )[i.status]
              }
            </button>
          ))}
        </section>
        {detail && (
          <section className="panel">
            <h2>
              {detail.content.title} · v{detail.version}
            </h2>
            <p>{detail.content.objective}</p>
            {admin && (
              <div className="learning-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Muat materi ke editor? Perubahan editor yang belum disimpan akan diganti.',
                      )
                    )
                      return;
                    setRevision(detail);
                    setEditorSerial((v) => v + 1);
                    setNotice(
                      'Materi dimuat ke editor di bawah. Penyimpanan membuat versi draft baru.',
                    );
                  }}
                >
                  Revisi ke versi baru
                </button>
                {detail.status === 'published' && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Arsipkan versi ini? Versi tidak lagi tersedia di pustaka staf. Histori tetap disimpan.',
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await api(`learning/${detail.id}/archive`, 'POST', { confirm: true });
                        await load();
                        await open(detail.id);
                        setNotice('Versi diarsipkan. Histori tetap tersimpan.');
                      } catch (e) {
                        onError(e as Error);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Arsipkan versi
                  </button>
                )}
              </div>
            )}
            {detail.status === 'archived' && (
              <p className="alert">Versi ini telah diarsipkan. Pengiriman jawaban ditutup.</p>
            )}
            {detail.content.video_url && (
              <div className="learning-video">
                <p>
                  Video YouTube dimuat setelah Anda memilih buka. Ketersediaan dan izin pemutaran
                  mengikuti pengaturan pemilik video.
                </p>
                <a
                  className="secondary"
                  href={detail.content.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buka video di YouTube
                </a>
              </div>
            )}
            <p className="learning-transcript">{detail.content.transcript}</p>
            <p>Batas lulus {detail.content.pass_score}% · Maksimal 3 percobaan per versi.</p>
            {detail.status === 'draft' ? (
              <>
                <p>Draft hanya terlihat oleh admin. Kunci jawaban tersedia untuk peninjauan.</p>
                {detail.content.questions.map((q, i) => (
                  <div key={i}>
                    <strong>{q.prompt}</strong>
                    <p>Jawaban: {q.options[q.correct ?? 0]}</p>
                  </div>
                ))}
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`learning/${detail.id}/publish`, 'POST', { confirm: true });
                      await load();
                      await open(detail.id);
                    } catch (e) {
                      onError(e as Error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Terbitkan versi ini
                </button>
              </>
            ) : detail.status === 'published' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const r = await api<Result>(`learning/${detail.id}/attempts`, 'POST', {
                      idempotency_key: key,
                      answers,
                    });
                    setNotice(
                      `Nilai ${r.score.toFixed(1)}% — ${r.passed ? 'Lulus teori' : 'Perlu belajar lagi'}. Praktik belum dinilai.`,
                    );
                    setDetail(await api<Detail>('learning/' + detail.id));
                    setKey(crypto.randomUUID());
                    setAnswers([]);
                  } catch (e) {
                    onError(e as Error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {detail.content.questions.map((q, i) => (
                  <fieldset key={i}>
                    <legend>
                      {i + 1}. {q.prompt}
                    </legend>
                    {q.options.map((o, j) => (
                      <label className="learning-option" key={j}>
                        <input
                          type="radio"
                          name={'q' + i}
                          required
                          checked={answers[i] === j}
                          onChange={() =>
                            setAnswers((a) => {
                              const next = [...a];
                              next[i] = j;
                              return next;
                            })
                          }
                        />
                        {o}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="primary" disabled={busy || detail.attempts.length >= 3}>
                  Kirim jawaban ({detail.attempts.length}/3)
                </button>
              </form>
            ) : null}
            <h3>Riwayat teori Anda</h3>
            {detail.attempts.map((a) => (
              <p key={a.id}>
                Percobaan {a.result.attempt}: {a.result.score.toFixed(1)}% ·{' '}
                {a.result.passed ? 'Lulus teori' : 'Belum lulus'}
              </p>
            ))}
          </section>
        )}
      </div>
      {admin && (
        <LearningEditor
          key={`${revision?.id ?? 'new'}-${editorSerial}`}
          initial={revision}
          busy={busy}
          onCancel={() => setRevision(null)}
          onSave={async (content) => {
            setBusy(true);
            try {
              const r = await api<{ id: string }>(
                revision ? `learning/${revision.id}/revise` : 'learning',
                'POST',
                content,
              );
              await load();
              await open(r.id);
              setRevision(null);
              setEditorSerial((v) => v + 1);
              setNotice('Draft versi baru tersimpan. Tinjau sebelum diterbitkan.');
            } catch (e) {
              onError(e as Error);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
function LearningEditor({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: Detail | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (c: Content) => Promise<void>;
}) {
  const empty = (): Content => ({
    title: '',
    objective: '',
    transcript: '',
    pass_score: 80,
    questions: [{ prompt: '', options: ['', ''], correct: 0 }],
  });
  const [content, setContent] = useState<Content>(() =>
    initial ? structuredClone(initial.content) : empty(),
  );
  const updateQuestion = (index: number, change: Partial<Content['questions'][number]>) =>
    setContent((c) => ({
      ...c,
      questions: c.questions.map((q, i) => (i === index ? { ...q, ...change } : q)),
    }));
  return (
    <section className="panel">
      <h2>
        {initial ? `Revisi ${initial.content.title} · v${initial.version}` : 'Buat draft materi'}
      </h2>
      <p>
        Gunakan 1–5 soal dan 2–5 opsi per soal. Revisi selalu membuat versi baru; histori versi
        sebelumnya tetap tersimpan.
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
            Tautan video YouTube (opsional)
            <input
              type="url"
              maxLength={2048}
              value={content.video_url ?? ''}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) =>
                setContent((c) => {
                  const { video_url, ...rest } = c;
                  return e.target.value ? { ...rest, video_url: e.target.value } : rest;
                })
              }
            />
          </label>
          <label>
            Judul
            <input
              required
              maxLength={500}
              value={content.title}
              onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
            />
          </label>
          <label>
            Tujuan belajar
            <input
              required
              maxLength={500}
              value={content.objective}
              onChange={(e) => setContent((c) => ({ ...c, objective: e.target.value }))}
            />
          </label>
          <label>
            Materi / transkrip
            <textarea
              required
              rows={6}
              maxLength={20000}
              value={content.transcript}
              onChange={(e) => setContent((c) => ({ ...c, transcript: e.target.value }))}
            />
          </label>
          <label>
            Batas lulus (%)
            <input
              required
              type="number"
              min={1}
              max={100}
              value={content.pass_score}
              onChange={(e) => setContent((c) => ({ ...c, pass_score: Number(e.target.value) }))}
            />
          </label>
          {content.questions.map((q, i) => (
            <fieldset key={i}>
              <legend>Soal {i + 1}</legend>
              <label>
                Pertanyaan
                <input
                  required
                  maxLength={500}
                  value={q.prompt}
                  onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                />
              </label>
              {q.options.map((option, j) => (
                <div key={j} className="learning-option-editor">
                  <label>
                    Opsi {String.fromCharCode(65 + j)}
                    <input
                      required
                      maxLength={500}
                      value={option}
                      onChange={(e) =>
                        updateQuestion(i, {
                          options: q.options.map((v, k) => (k === j ? e.target.value : v)),
                        })
                      }
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    disabled={q.options.length <= 2}
                    aria-label={`Hapus opsi ${String.fromCharCode(65 + j)} soal ${i + 1}`}
                    onClick={() =>
                      updateQuestion(i, {
                        options: q.options.filter((_, k) => k !== j),
                        correct:
                          q.correct === j
                            ? 0
                            : (q.correct ?? 0) > j
                              ? (q.correct ?? 0) - 1
                              : q.correct,
                      })
                    }
                  >
                    Hapus opsi
                  </button>
                </div>
              ))}
              <label>
                Jawaban benar
                <select
                  value={q.correct ?? 0}
                  onChange={(e) => updateQuestion(i, { correct: Number(e.target.value) })}
                >
                  {q.options.map((_, j) => (
                    <option key={j} value={j}>
                      Opsi {String.fromCharCode(65 + j)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="learning-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={q.options.length >= 5}
                  onClick={() => updateQuestion(i, { options: [...q.options, ''] })}
                >
                  Tambah opsi
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={content.questions.length <= 1}
                  onClick={() =>
                    setContent((c) => ({ ...c, questions: c.questions.filter((_, k) => k !== i) }))
                  }
                >
                  Hapus soal {i + 1}
                </button>
              </div>
            </fieldset>
          ))}
          <div className="learning-actions">
            <button
              className="secondary"
              type="button"
              disabled={content.questions.length >= 5}
              onClick={() =>
                setContent((c) => ({
                  ...c,
                  questions: [...c.questions, { prompt: '', options: ['', ''], correct: 0 }],
                }))
              }
            >
              Tambah soal ({content.questions.length}/5)
            </button>
            <button className="primary" type="submit">
              Simpan draft versi baru
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                if (
                  window.confirm('Kosongkan editor? Perubahan yang belum disimpan akan hilang.')
                ) {
                  setContent(empty());
                  onCancel();
                }
              }}
            >
              {initial ? 'Batalkan revisi' : 'Kosongkan editor'}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
