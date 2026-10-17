'use client';
import { useEffect, useState } from 'react';
import { api } from '../app/api';
export type ImageRef = { asset_id: string; alt: string };
export function PrivateImage({ image }: { image: ImageRef }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    api<{ url: string }>(`media/${image.asset_id}/url`, 'POST', { confirm: true })
      .then((r) => {
        if (active) setUrl(r.url);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [image.asset_id, retry]);
  return error ? (
    <span>
      Gambar gagal dimuat. {image.alt}{' '}
      <button type="button" className="secondary" onClick={() => setRetry((n) => n + 1)}>
        Coba lagi
      </button>
    </span>
  ) : url ? (
    <img
      src={url}
      alt={image.alt}
      style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }}
      onError={() => setError(true)}
    />
  ) : (
    <span>Memuat gambar…</span>
  );
}
export function ImageUpload({
  purpose = 'learning',
  instanceId,
  assignmentId,
  issueId,
  onUploaded,
  onError,
}: {
  purpose?: 'learning' | 'evidence' | 'practice' | 'issue';
  assignmentId?: string;
  issueId?: string;
  instanceId?: string;
  onUploaded: (image: ImageRef) => void;
  onError: (e: Error) => void;
}) {
  const [busy, setBusy] = useState(false),
    [alt, setAlt] = useState('');
  return (
    <div>
      <label>
        Deskripsi gambar (alternatif teks)
        <input value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} />
      </label>
      <label>
        Gambar JPEG/PNG/WebP, maksimal 5 MB
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !alt.trim()}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5242880) {
              onError(new Error('Gambar maksimal 5 MB.'));
              return;
            }
            setBusy(true);
            try {
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = () => reject(new Error('File gagal dibaca.'));
                reader.readAsDataURL(file);
              });
              const r = await api<{ id: string }>('media', 'POST', {
                purpose,
                instance_id: instanceId,
                assignment_id: assignmentId,
                issue_id: issueId,
                mime: file.type,
                base64,
              });
              onUploaded({ asset_id: r.id, alt });
            } catch (error) {
              onError(error as Error);
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </label>
      {busy && <p role="status">Memeriksa dan menyimpan gambar…</p>}
    </div>
  );
}
