'use client';
import { useState } from 'react';
import { ImageUpload, PrivateImage, ImageRef } from './private-image';
import { api } from '../app/api';
export type RubricSnapshot = {
  id: string;
  title: string;
  version: number;
  instructions: string;
  items: { position: number; label: string; required: boolean; critical: boolean }[];
};
export function PracticeObservation({
  assignmentId,
  position,
  rubric,
  latestId,
  onError,
  onSaved,
}: {
  assignmentId: string;
  position: number;
  rubric: RubricSnapshot;
  latestId: string | null;
  onError: (e: Error) => void;
  onSaved: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<number, boolean>>({}),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID()),
    [message, setMessage] = useState(''),
    [evidence, setEvidence] = useState<ImageRef[]>([]);
  const failed = rubric.items.some(
    (i) => (i.required || i.critical) && answers[i.position] === false,
  );
  return (
    <details>
      <summary>{latestId ? 'Nilai ulang / koreksi observasi' : 'Isi observasi praktik'}</summary>
      <p>
        Pengesahan menyimpan hasil permanen sebagai record baru. Amati kondisi kerja secara
        langsung; seluruh kriteria wajib/kritis harus lulus untuk kompeten.
      </p>
      <form
        className="learning-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (
            !window.confirm(
              'Sahkan observasi ini? Hasil tidak dapat ditimpa; koreksi harus melalui record baru.',
            )
          )
            return;
          setBusy(true);
          try {
            const result = await api<{ outcome: string }>(
              `onboarding-assignments/${assignmentId}/assessments`,
              'POST',
              {
                evidence,
                step_position: position,
                answers: rubric.items.map((i) => ({
                  position: i.position,
                  passed: answers[i.position],
                })),
                comment: data.get('comment'),
                training_instructions: data.get('training_instructions'),
                correction_reason: latestId ? data.get('correction_reason') : '',
                supersedes: latestId,
                idempotency_key: key,
              },
            );
            setMessage(
              result.outcome === 'competent'
                ? 'Observasi disahkan: kompeten.'
                : 'Observasi disahkan: perlu latihan.',
            );
            await onSaved();
          } catch (error) {
            onError(error as Error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>
            {rubric.title} · v{rubric.version}
          </legend>
          {rubric.items.map((item) => (
            <fieldset key={item.position}>
              <legend>
                {item.label} · {item.required ? 'Wajib' : 'Opsional'}{' '}
                {item.critical && <span className="rubric-critical">Kritis</span>}
              </legend>
              {[true, false].map((passed) => (
                <label className="learning-option" key={String(passed)}>
                  <input
                    type="radio"
                    required
                    name={'item' + item.position}
                    checked={answers[item.position] === passed}
                    onChange={() => setAnswers((a) => ({ ...a, [item.position]: passed }))}
                  />
                  {passed ? 'Lulus' : 'Perlu latihan'}
                </label>
              ))}
            </fieldset>
          ))}
          <p>Bukti foto opsional; hindari wajah, identitas pribadi dan data pelanggan.</p>
          {evidence.map((image) => (
            <PrivateImage key={image.asset_id} image={image} />
          ))}
          {evidence.length < 5 && (
            <ImageUpload
              purpose="practice"
              assignmentId={assignmentId}
              onError={onError}
              onUploaded={(image) => setEvidence((items) => [...items, image])}
            />
          )}
          <label>
            Komentar observasi
            <textarea required name="comment" minLength={10} maxLength={2000} rows={3} />
          </label>
          <label>
            Arahan latihan {failed ? '(wajib untuk hasil perlu latihan)' : '(opsional)'}
            <textarea
              name="training_instructions"
              required={failed}
              minLength={failed ? 10 : undefined}
              maxLength={2000}
              rows={3}
            />
          </label>
          {latestId && (
            <label>
              Alasan penilaian ulang / koreksi
              <textarea
                required
                name="correction_reason"
                minLength={10}
                maxLength={1000}
                rows={2}
              />
            </label>
          )}
          <button className="primary">Sahkan observasi</button>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
type Assessment = {
  evidence?: ImageRef[];
  id: string;
  step_position: number;
  sequence: number;
  supersedes: string | null;
  outcome: string;
  comment: string;
  training_instructions: string;
  correction_reason: string;
  assessor_name: string;
  created_at: string;
  request_id: string | null;
  answers: { position: number; passed: boolean }[];
};
export function PracticeHistory({
  assignmentId,
  onError,
}: {
  assignmentId: string;
  onError: (e: Error) => void;
}) {
  const [items, setItems] = useState<Assessment[] | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <section>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setItems(
              (
                await api<{ items: Assessment[] }>(
                  `onboarding-assignments/${assignmentId}/assessments`,
                )
              ).items,
            );
          } catch (e) {
            onError(e as Error);
          } finally {
            setBusy(false);
          }
        }}
      >
        Muat riwayat observasi
      </button>
      {items && (
        <>
          <p>
            Menampilkan maksimal 100 hasil terbaru. Hasil dengan urutan tertinggi per langkah
            berlaku; hasil lama tetap tersimpan.
          </p>
          {!items.length && <p>Belum ada observasi disahkan.</p>}
          {items.map((item) => (
            <details key={item.id}>
              <summary>
                Langkah {item.step_position} · #{item.sequence} ·{' '}
                {item.outcome === 'competent' ? 'Kompeten' : 'Perlu latihan'} · {item.assessor_name}
              </summary>
              <p>{new Date(item.created_at).toLocaleString('id-ID')}</p>
              <p>{item.comment}</p>
              {item.evidence?.map((image) => (
                <PrivateImage key={image.asset_id} image={image} />
              ))}
              {item.training_instructions && <p>Arahan latihan: {item.training_instructions}</p>}
              {item.correction_reason && <p>Alasan penilaian ulang: {item.correction_reason}</p>}
              <ul>
                {item.answers.map((a) => (
                  <li key={a.position}>
                    Item {a.position}: {a.passed ? 'Lulus' : 'Perlu latihan'}
                  </li>
                ))}
              </ul>
              {item.request_id && <p>Menjawab pengajuan {item.request_id}</p>}
              {item.supersedes && <small>Menggantikan hasil {item.supersedes}</small>}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
