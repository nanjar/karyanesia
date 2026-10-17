'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../app/api';
let ready: Promise<void> | null = null;
function loadYouTube() {
  if (ready) return ready;
  const win = window as any;
  if (win.YT?.Player) return Promise.resolve();
  ready = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (failed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (win.onYouTubeIframeAPIReady === onReady) delete win.onYouTubeIframeAPIReady;
      if (failed) {
        script.remove();
        ready = null;
        reject(new Error('YouTube tidak dapat dimuat.'));
      } else resolve();
    };
    const onReady = () => finish(!win.YT?.Player);
    const timeout = setTimeout(() => finish(true), 15000);
    win.onYouTubeIframeAPIReady = onReady;
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => finish(true);
    document.head.appendChild(script);
  });
  return ready;
}
export function YouTubePlayer({
  url,
  versionId,
  assignmentId,
}: {
  url: string;
  versionId: string;
  assignmentId?: string;
}) {
  const mount = useRef<HTMLDivElement>(null),
    revision = useRef(0);
  const [active, setActive] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    setError(false);
    setMessage('Memuat video YouTube…');
    let disposed = false,
      player: any,
      timer: ReturnType<typeof setInterval> | undefined,
      saving = false;
    const context = assignmentId ? '?assignment_id=' + assignmentId : '';
    async function save() {
      if (!player?.getCurrentTime || saving || disposed) return;
      saving = true;
      try {
        const result = await api<{ revision: number }>(
          `learning/${versionId}/video-progress`,
          'POST',
          {
            seconds: Math.min(300, Math.max(0, Math.floor(player.getCurrentTime()))),
            revision: revision.current,
            ...(assignmentId ? { assignment_id: assignmentId } : {}),
          },
        );
        if (disposed) return;
        revision.current = result.revision;
        if (!disposed) setMessage('Posisi video tersimpan.');
      } catch {
        if (!disposed)
          setMessage(
            'Posisi belum tersimpan. Periksa koneksi; gunakan transkrip bila video gagal.',
          );
      } finally {
        saving = false;
      }
    }
    void Promise.all([
      loadYouTube(),
      api<{ seconds: number; revision: number }>(`learning/${versionId}/video-progress` + context),
    ])
      .then(([, progress]) => {
        if (disposed || !mount.current) return;
        revision.current = progress.revision;
        const element = document.createElement('div');
        mount.current.appendChild(element);
        player = new (window as any).YT.Player(element, {
          width: '100%',
          height: '240',
          videoId: new URL(url).searchParams.get('v'),
          playerVars: { playsinline: 1, start: progress.seconds, origin: window.location.origin },
          events: {
            onReady: () => {
              if (disposed) return;
              setMessage(
                progress.seconds
                  ? `Dilanjutkan dari detik ${progress.seconds}.`
                  : 'Video siap diputar.',
              );
              timer = setInterval(() => void save(), 15000);
            },
            onStateChange: (event: any) => {
              if ([0, 2].includes(event.data)) void save();
            },
            onError: () => {
              if (!disposed) {
                setError(true);
                setMessage(
                  'Video dihapus, privat, atau tidak dapat diputar. Gunakan transkrip atau buka YouTube.',
                );
              }
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
          setMessage('Video tidak dapat dimuat. Transkrip tetap tersedia.');
        }
      });
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      player?.destroy?.();
      mount.current?.replaceChildren();
    };
  }, [active, url, versionId, assignmentId, attempt]);
  return (
    <div className="learning-video">
      <p>
        YouTube dimuat setelah Anda memilih putar. Posisi adalah sinyal keterlibatan, bukan bukti
        kelulusan.
      </p>
      {!active && (
        <button type="button" className="secondary" onClick={() => setActive(true)}>
          Putar / lanjutkan video
        </button>
      )}
      {active && error && (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Coba muat video lagi
        </button>
      )}
      <div ref={mount} style={{ minHeight: active ? 240 : 0 }} />
      {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
      <a className="secondary" href={url} target="_blank" rel="noopener noreferrer">
        Buka di YouTube
      </a>
    </div>
  );
}
