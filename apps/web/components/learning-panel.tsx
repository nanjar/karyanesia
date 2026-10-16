'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
type Content = {
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
    [key, setKey] = useState('');
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
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setBusy(true);
    try {
      const content = {
        title: d.get('title'),
        objective: d.get('objective'),
        transcript: d.get('transcript'),
        pass_score: Number(d.get('pass_score')),
        questions: [
          {
            prompt: d.get('prompt'),
            options: [d.get('option0'), d.get('option1')],
            correct: Number(d.get('correct')),
          },
        ],
      };
      const r = await api<{ id: string }>('learning', 'POST', content);
      await load();
      await open(r.id);
      form.reset();
      setNotice('Draft tersimpan. Tinjau isi sebelum diterbitkan.');
    } catch (e) {
      onError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="learning-panel">
      <div className="alert">
        Fondasi materi teks & kuis teori. Video privat, gambar, penugasan onboarding, dan penilaian
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
              {i.title} · v{i.version} · {i.status === 'draft' ? 'Draft' : 'Terbit'}
            </button>
          ))}
        </section>
        {detail && (
          <section className="panel">
            <h2>
              {detail.content.title} · v{detail.version}
            </h2>
            <p>{detail.content.objective}</p>
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
            ) : (
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
            )}
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
        <section className="panel">
          <h2>Buat draft materi teks</h2>
          <p>
            Editor awal mendukung satu soal dengan dua opsi. API mendukung hingga lima soal. Revisi
            tersedia melalui API dan menghasilkan versi baru.
          </p>
          <form className="learning-editor" onSubmit={create}>
            <label>
              Judul
              <input name="title" required maxLength={500} />
            </label>
            <label>
              Tujuan belajar
              <input name="objective" required maxLength={500} />
            </label>
            <label>
              Materi / transkrip
              <textarea name="transcript" required maxLength={20000} rows={6} />
            </label>
            <label>
              Batas lulus (%)
              <input name="pass_score" type="number" min={1} max={100} defaultValue={80} required />
            </label>
            <label>
              Pertanyaan
              <input name="prompt" required maxLength={500} />
            </label>
            <label>
              Opsi A<input name="option0" required maxLength={500} />
            </label>
            <label>
              Opsi B<input name="option1" required maxLength={500} />
            </label>
            <label>
              Jawaban benar
              <select name="correct">
                <option value="0">A</option>
                <option value="1">B</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Simpan draft
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
