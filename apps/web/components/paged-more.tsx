'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
export function PagedMore({
  path,
  lastId,
  enabled,
  onPage,
  onError,
  field = 'items',
  pageSize = 100,
}: {
  path: string;
  lastId?: string;
  enabled: boolean;
  onPage: (items: any[]) => void;
  onError: (error: Error) => void;
  field?: string;
  pageSize?: number;
}) {
  const [busy, setBusy] = useState(false),
    [ended, setEnded] = useState(false);
  useEffect(() => setEnded(false), [path, lastId]);
  if (!enabled || ended || !lastId) return null;
  return (
    <button
      className="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await api<any>(
            path + (path.includes('?') ? '&' : '?') + 'after=' + lastId,
          );
          const rows = Array.isArray(result) ? result : result[field];
          onPage(rows);
          if (rows.length < pageSize) setEnded(true);
        } catch (error) {
          onError(error as Error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Memuat…' : 'Muat berikutnya'}
    </button>
  );
}
export async function allMembers() {
  let after: string | null = null;
  const items: any[] = [];
  do {
    const page: { items: any[]; next_cursor: string | null } = await api<{
      items: any[];
      next_cursor: string | null;
    }>('memberships?limit=100' + (after ? '&after=' + after : ''));
    items.push(...page.items);
    after = page.next_cursor;
  } while (after && items.length < 5000);
  if (after) throw new Error('Daftar melebihi 5.000 anggota; persempit scope cabang.');
  return { items };
}
