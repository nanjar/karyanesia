'use client';
import { useEffect, useState } from 'react';
import { ImageUpload, PrivateImage, ImageRef } from './private-image';
import { YouTubePlayer } from './youtube-player';
import { PagedMore } from './paged-more';
import { api } from '../app/api';
type Content = {
  video_url?: string;
  images?: ImageRef[];
  description?: string;
  target_job_ids?: string[];
  competency_ids?: string[];
  video_duration_seconds?: number;
  title: string;
  objective: string;
  transcript: string;
  pass_score: number;
  questions: {
    prompt: string;
    options: string[];
    correct?: number;
    prompt_image?: ImageRef;
    option_images?: (ImageRef | null)[];
  }[];
};
type Result = { score: number; passed: boolean; attempt: number; round?: number };
type Detail = {
  id: string;
  version: number;
  status: string;
  content: Content;
  budget: { round: number; used: number; remaining: number };
  resets: { round: number; reason: string; created_at: string }[];
  attempts: { id: string; result: Result }[];
};
export function LearningPanel({
  admin,
  canReset,
  onError,
  initialVersion,
  assignmentId,
  onAssessed,
}: {
  admin: boolean;
  canReset: boolean;
  onError: (e: Error) => void;
  initialVersion?: string;
  assignmentId?: string;
  onAssessed?: () => Promise<void>;
}) {
  const [items, setItems] = useState<
      {
        id: string;
        title: string;
        status: string;
        version: number;
        learning_available: boolean;
        learning_locked_reason: string | null;
      }[]
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
    if (!initialVersion) void load().catch(onError);
  }, []);
  useEffect(() => {
    if (initialVersion) void open(initialVersion);
  }, [initialVersion, assignmentId]);
  async function open(id: string) {
    setBusy(true);
    setDetail(null);
    try {
      setDetail(
        await api<Detail>(
          'learning/' + id + (assignmentId ? `?assignment_id=${assignmentId}` : ''),
        ),
      );
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
        Materi teks, tautan video YouTube & kuis teori. Penugasan tersedia pada menu Tugas
        onboarding. Gambar tersedia dengan akses privat; praktik dinilai melalui tugas. Lulus teori
        belum berarti kompeten.
      </div>
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      <div className={initialVersion ? 'learning-embedded' : 'learning-columns'}>
        {!initialVersion && (
          <section className="panel">
            <h2>Pustaka materi</h2>
            {!items.length && <p>Belum ada materi yang dapat ditampilkan.</p>}
            {items.map((i) => (
              <div key={i.id}>
                <button
                  className="secondary learning-item"
                  disabled={busy || !i.learning_available}
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
                {!i.learning_available && <p>{i.learning_locked_reason}</p>}
              </div>
            ))}
            <PagedMore
              path="learning"
              lastId={items.at(-1)?.id}
              enabled={items.length > 0 && items.length % 100 === 0}
              onPage={(rows) => setItems((old) => [...old, ...rows])}
              onError={onError}
            />
          </section>
        )}
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
              <YouTubePlayer
                key={detail.id}
                url={detail.content.video_url}
                versionId={detail.id}
                assignmentId={assignmentId}
              />
            )}
            {detail.content.images?.map((image) => (
              <PrivateImage key={image.asset_id} image={image} />
            ))}
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
                      ...(assignmentId ? { assignment_id: assignmentId } : {}),
                      answers,
                    });
                    setNotice(
                      `Nilai ${r.score.toFixed(1)}% — ${r.passed ? 'Lulus teori' : 'Perlu belajar lagi'}. Nilai teori tidak mengubah hasil praktik.`,
                    );
                    setDetail(
                      await api<Detail>(
                        'learning/' +
                          detail.id +
                          (assignmentId ? `?assignment_id=${assignmentId}` : ''),
                      ),
                    );
                    setKey(crypto.randomUUID());
                    setAnswers([]);
                    await onAssessed?.();
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
                    {q.prompt_image && <PrivateImage image={q.prompt_image} />}
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
                        {q.option_images?.[j] && <PrivateImage image={q.option_images[j]!} />}
                        {o}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="primary" disabled={busy || detail.budget.remaining === 0}>
                  Kirim jawaban ({detail.budget.used}/3 · rangkaian {detail.budget.round})
                </button>
              </form>
            ) : null}
            {detail.status === 'published' && detail.budget.remaining === 0 && (
              <p className="inline-help">
                Batas tiga percobaan rangkaian ini sudah tercapai. Hasil tetap tersedia pada riwayat
                teori.
              </p>
            )}
            {canReset && detail.status === 'published' && (
              <RetryPanel key={detail.id} versionId={detail.id} onError={onError} />
            )}
            <h3>Riwayat teori Anda</h3>
            {detail.resets.map((r) => (
              <p key={r.round}>
                Rangkaian {r.round} dibuka {new Date(r.created_at).toLocaleString('id-ID')}:{' '}
                {r.reason}
              </p>
            ))}
            {detail.attempts.map((a) => (
              <p key={a.id}>
                Rangkaian {a.result.round ?? 1} · percobaan {a.result.attempt}:{' '}
                {a.result.score.toFixed(1)}% · {a.result.passed ? 'Lulus teori' : 'Belum lulus'}
              </p>
            ))}
          </section>
        )}
      </div>
      {admin && (
        <LearningEditor
          key={`${revision?.id ?? 'new'}-${editorSerial}`}
          onError={onError}
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
  onError,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  onError: (e: Error) => void;
  initial: Detail | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (c: Content) => Promise<void>;
}) {
  const [jobChoices, setJobChoices] = useState<{ id: string; name: string }[]>([]),
    [skillChoices, setSkillChoices] = useState<{ id: string; content: { name: string } }[]>([]);
  useEffect(() => {
    void Promise.all([
      api<{ id: string; name: string }[]>('jobs'),
      api<{ id: string; content: { name: string } }[]>('competencies'),
    ])
      .then(([jobs, skills]) => {
        setJobChoices(jobs);
        setSkillChoices(skills);
      })
      .catch(onError);
  }, []);
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
          {content.video_url && (
            <label>
              Durasi video yang telah Anda periksa (detik; sasaran 120, maksimal 300)
              <input
                required
                type="number"
                min={1}
                max={300}
                value={content.video_duration_seconds || ''}
                onChange={(e) =>
                  setContent((c) => ({ ...c, video_duration_seconds: Number(e.target.value) }))
                }
              />
            </label>
          )}
          <ImageUpload
            onError={onError}
            onUploaded={(image) =>
              setContent((c) => ({ ...c, images: [...(c.images || []), image] }))
            }
          />
          {content.images?.map((image) => (
            <PrivateImage key={image.asset_id} image={image} />
          ))}
          <label>
            Deskripsi
            <input
              maxLength={2000}
              value={content.description || ''}
              onChange={(e) => setContent((c) => ({ ...c, description: e.target.value }))}
            />
          </label>
          <label>
            Jabatan sasaran (opsional)
            <select
              multiple
              value={content.target_job_ids || []}
              onChange={(e) =>
                setContent((c) => ({
                  ...c,
                  target_job_ids: Array.from(e.target.selectedOptions, (o) => o.value),
                }))
              }
            >
              {jobChoices.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kompetensi terkait (opsional)
            <select
              multiple
              value={content.competency_ids || []}
              onChange={(e) =>
                setContent((c) => ({
                  ...c,
                  competency_ids: Array.from(e.target.selectedOptions, (o) => o.value),
                }))
              }
            >
              {skillChoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.content.name}
                </option>
              ))}
            </select>
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
              <ImageUpload
                onError={onError}
                onUploaded={(image) => updateQuestion(i, { prompt_image: image })}
              />
              {q.prompt_image && <PrivateImage image={q.prompt_image} />}
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
                  <ImageUpload
                    onError={onError}
                    onUploaded={(image) =>
                      updateQuestion(i, {
                        option_images: q.options.map((_, k) =>
                          k === j ? image : q.option_images?.[k] || null,
                        ),
                      })
                    }
                  />
                  {q.option_images?.[j] && <PrivateImage image={q.option_images[j]!} />}
                  <button
                    className="text-button"
                    type="button"
                    disabled={q.options.length <= 2}
                    aria-label={`Hapus opsi ${String.fromCharCode(65 + j)} soal ${i + 1}`}
                    onClick={() =>
                      updateQuestion(i, {
                        options: q.options.filter((_, k) => k !== j),
                        ...(q.option_images
                          ? { option_images: q.option_images.filter((_, k) => k !== j) }
                          : {}),
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
                  onClick={() =>
                    updateQuestion(i, {
                      options: [...q.options, ''],
                      ...(q.option_images ? { option_images: [...q.option_images, null] } : {}),
                    })
                  }
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

function RetryPanel({ versionId, onError }: { versionId: string; onError: (e: Error) => void }) {
  const [items, setItems] = useState<
      { id: string; full_name: string; employee_number: string; round: number }[]
    >([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function load() {
    setItems((await api<{ items: typeof items }>(`learning/${versionId}/blocked`)).items);
  }
  useEffect(() => {
    void load().catch(onError);
  }, [versionId]);
  return (
    <section>
      <h3>Pendampingan staf</h3>
      <p>
        Daftar staf dalam scope Anda yang gagal tiga kali dan belum lulus. Alasan pembukaan ulang
        wajib dicatat. Maksimal 100 staf ditampilkan.
      </p>
      <button className="secondary" disabled={busy} onClick={() => void load().catch(onError)}>
        Perbarui daftar
      </button>
      {message && <p role="status">{message}</p>}
      {!items.length && <p>Tidak ada staf yang perlu dibuka ulang pada daftar ini.</p>}
      {items.map((item) => (
        <RetryForm
          key={item.id}
          item={item}
          disabled={busy}
          onSubmit={async (reason, idempotency_key) => {
            setBusy(true);
            try {
              await api(`learning/${versionId}/resets`, 'POST', {
                membership_id: item.id,
                reason,
                idempotency_key,
              });
              setMessage(`Tiga percobaan baru dibuka untuk ${item.full_name}.`);
              await load();
            } catch (e) {
              onError(e as Error);
            } finally {
              setBusy(false);
            }
          }}
        />
      ))}
    </section>
  );
}
function RetryForm({
  item,
  disabled,
  onSubmit,
}: {
  item: { id: string; full_name: string; employee_number: string; round: number };
  disabled: boolean;
  onSubmit: (reason: string, key: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(''),
    [key] = useState(() => crypto.randomUUID());
  return (
    <form
      className="learning-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (window.confirm(`Buka tiga percobaan baru untuk ${item.full_name}?`))
          await onSubmit(reason, key);
      }}
    >
      <fieldset disabled={disabled}>
        <legend>
          {item.full_name} · {item.employee_number} · rangkaian {item.round}
        </legend>
        <label>
          Alasan dan arahan latihan
          <textarea
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </label>
        <button className="secondary">Buka tiga percobaan baru</button>
      </fieldset>
    </form>
  );
}
