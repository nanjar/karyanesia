'use client';
import { useState } from 'react';
import { api } from '../app/api';
type Row = Record<string, any>;
const labels: Record<string, string> = {
  open: 'Terbuka',
  assigned: 'Ditugaskan',
  in_progress: 'Dikerjakan',
  resolved: 'Ditangani',
  closed: 'Ditutup',
  reopened: 'Dibuka kembali',
};
export function IssueCard({
  issue,
  members,
  actor,
  busy,
  onAction,
  onError,
}: {
  issue: Row;
  members: Row[];
  actor: { id: string; role: string };
  busy: boolean;
  onAction: (fn: () => Promise<void>) => Promise<void>;
  onError: (e: Error) => void;
}) {
  const [note, setNote] = useState(''),
    [owner, setOwner] = useState(''),
    [due, setDue] = useState(''),
    [history, setHistory] = useState<Row[] | null>(null);
  const reviewer = ['OWNER', 'ADMIN', 'OPERATIONS', 'SUPERVISOR'].includes(actor.role),
    state = issue.state.status;
  const actions: Record<string, string[]> = {
    open: reviewer ? ['assigned'] : [],
    assigned: ['in_progress'],
    in_progress: ['resolved'],
    resolved: reviewer ? ['closed', 'reopened'] : ['reopened'],
    closed: ['reopened'],
    reopened: reviewer ? ['assigned', 'in_progress'] : ['in_progress'],
  };
  const mayAct = reviewer || issue.state.owner_id === actor.id || issue.reporter_id === actor.id;
  return (
    <article className="panel">
      <h3>
        {issue.content.category} ·{' '}
        {issue.content.priority === 'high'
          ? 'Prioritas tinggi'
          : issue.content.priority === 'normal'
            ? 'Prioritas normal'
            : 'Prioritas rendah'}
      </h3>
      <p>{issue.content.description}</p>
      <p>
        Status: {labels[state]} · {issue.state.note || 'Belum ada tindakan'}
      </p>
      {issue.state.due_at && <p>Tenggat: {new Date(issue.state.due_at).toLocaleString('id-ID')}</p>}
      {mayAct && Boolean(actions[state]?.length) && (
        <>
          <label>
            Catatan tindakan
            <textarea
              value={note}
              minLength={10}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {actions[state].includes('assigned') && (
            <>
              <label>
                Penanggung jawab
                <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="">Pilih anggota cabang</option>
                  {members
                    .filter((m) => m.active && m.branch_id === issue.branch_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} · {m.employee_number}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Tenggat (WIB)
                <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
            </>
          )}
          <div className="actions">
            {actions[state].map((status) => (
              <button
                className="secondary"
                key={status}
                disabled={
                  busy || note.trim().length < 10 || (status === 'assigned' && (!owner || !due))
                }
                onClick={() =>
                  void onAction(async () => {
                    await api(`issues/${issue.id}/transitions`, 'POST', {
                      key: crypto.randomUUID(),
                      revision: issue.revision,
                      status,
                      note,
                      ...(status === 'assigned'
                        ? { owner_id: owner, due_at: due + ':00+07:00' }
                        : {}),
                    });
                    setNote('');
                    setHistory(null);
                  })
                }
              >
                {labels[status]}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          try {
            const r = await api<Row>(`issues/${issue.id}`);
            setHistory(r.history);
          } catch (e) {
            onError(e as Error);
          }
        }}
      >
        Lihat histori tindakan
      </button>
      {history && (
        <ol>
          {history.map((h) => (
            <li key={h.revision}>
              {new Date(h.created_at).toLocaleString('id-ID')} · {labels[h.state.status]} ·{' '}
              {h.state.note}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
