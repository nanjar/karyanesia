export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api/v1/' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res
    .json()
    .catch(() => ({ message: 'Layanan belum tersedia. Periksa koneksi API.' }));
  if (!res.ok) {
    const error = new Error(data.message || 'Permintaan gagal.') as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return data;
}
