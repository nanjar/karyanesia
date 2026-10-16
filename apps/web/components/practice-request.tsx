'use client';
import { useState } from 'react';
import { api } from '../app/api';
export type RequestState = {
  id: string;
  kind: string;
  reason: string;
  sequence: number;
  created_at: string;
  status: string;
  answer_assessment_id: string | null;
};
export function PracticeRequest({
  assignmentId,
  position,
  latestId,
  competent,
  onError,
  onSaved,
}: {
  assignmentId: string;
  position: number;
  latestId: string | null;
  competent: boolean;
  onError: (e: Error) => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState(competent ? 'review' : 'practice'),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  return (
    <details>
      <summary>Ajukan praktik / peninjauan hasil</summary>
      <p>
        Pengajuan dicatat untuk ditindaklanjuti penilai. Permintaan review tidak membatalkan hasil
        kompeten yang sudah disahkan.
      </p>
      <form
        className="learning-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          const reason = String(new FormData(e.currentTarget).get('reason'));
          if (!window.confirm('Kirim pengajuan ini kepada penilai?')) return;
          setBusy(true);
          try {
            await api(`onboarding-assignments/${assignmentId}/practice-requests`, 'POST', {
              step_position: position,
              kind,
              reason,
              based_on: latestId,
              idempotency_key: key,
            });
            await onSaved();
          } catch (error) {
            onError(error as Error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Jenis pengajuan
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {!competent && <option value="practice">Siap observasi / praktik ulang</option>}
              {latestId && <option value="review">Minta peninjauan hasil terakhir</option>}
            </select>
          </label>
          <label>
            Alasan / kesiapan dan latihan yang sudah dilakukan
            <textarea name="reason" required minLength={10} maxLength={2000} rows={3} />
          </label>
          <button className="primary">Kirim pengajuan</button>
        </fieldset>
      </form>
    </details>
  );
}
export function PracticeRequestHistory({
  assignmentId,
  onError,
}: {
  assignmentId: string;
  onError: (e: Error) => void;
}) {
  const [items, setItems] = useState<
      (RequestState & { step_position: number; based_on: string | null })[] | null
    >(null),
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
                await api<{ items: NonNullable<typeof items> }>(
                  `onboarding-assignments/${assignmentId}/practice-requests`,
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
        Muat riwayat pengajuan
      </button>
      {items && (
        <>
          <p>Maksimal 100 pengajuan terbaru.</p>
          {!items.length && <p>Belum ada pengajuan.</p>}
          {items.map((r) => (
            <details key={r.id}>
              <summary>
                Langkah {r.step_position} · #{r.sequence} ·{' '}
                {r.kind === 'review' ? 'Peninjauan' : 'Praktik'} ·{' '}
                {
                  (
                    {
                      pending: 'Menunggu penilai',
                      answered: 'Dijawab observasi',
                      cancelled: 'Tugas dibatalkan',
                    } as Record<string, string>
                  )[r.status]
                }
              </summary>
              <p>{r.reason}</p>
              <p>{new Date(r.created_at).toLocaleString('id-ID')}</p>
              {r.based_on && <small>Hasil yang dirujuk: {r.based_on}</small>}
              {r.answer_assessment_id && <p>Dijawab oleh observasi {r.answer_assessment_id}</p>}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
