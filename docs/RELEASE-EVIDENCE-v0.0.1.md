# Karyanesia v0.0.1 — Register bukti penerimaan

Tanggal penyusunan: 17 Oktober 2026. Status: **BELUM DITERIMA UNTUK PRODUKSI**.
Gunakan bersama [checklist rilis](RELEASE-CHECKLIST-v0.0.1.md), [PRD bagian 20](PRD-Karyanesia-v0.0.1.md#20-pengujian-dan-acceptance-rilis), dan [runbook](OPERATIONS-RUNBOOK.md).

## Identitas pelaksanaan

Isi sebelum pengujian: perusahaan pilot/alias, lingkungan dan domain, commit lengkap, image digest API/web/worker, versi migrasi, tanggal/jam beserta zona waktu, penanggung jawab UAT, operator server, dan pemberi keputusan rilis. Seluruhnya **BELUM DIISI**.
Gunakan akun sintetis dengan role/cabang yang mewakili peserta. Jangan menyimpan password, token, kunci MFA, data staf, dump database atau signed URL di repository publik ini. Bukti sensitif disimpan pada lokasi terbatas; register hanya memuat referensi aman.

## Bukti otomatis yang sudah tersedia

Baseline aplikasi: [f91c6c98a33891d5e5eb15a7add732a6159420fb](https://github.com/nanjar/karyanesia/commit/f91c6c98a33891d5e5eb15a7add732a6159420fb).
[CI run 39001938095](https://github.com/nanjar/karyanesia/actions/runs/39001938095) dikonfirmasi completed/success pada 17 Oktober 2026. Baseline mencakup 79 tes integrasi dan 15 skenario browser menurut hasil implementasi sebelumnya; lihat log run untuk rincian.

[Artifact browser-qa](https://github.com/nanjar/karyanesia/actions/runs/39001938095/artifacts/12090010567) tersedia saat pemeriksaan, berisi laporan Playwright/test-results sesuai workflow. Kedaluwarsa yang dilaporkan GitHub: **24 Oktober 2026 04:19:54 UTC (11:19:54 WIB)**. Digest arsip: `sha256:e5701295f00c5307c9bd90a0db4d6b40cc8931290b103b9952d3df268c2b00a0`.
Sebelum kedaluwarsa, operator perlu menyimpan salinan di lokasi bukti yang disetujui, memverifikasi checksum, lalu mencatat lokasi dan tanggal salinan. **Salinan permanen belum dibuat.** Tautan run bukan jaminan arsip tetap tersedia.

Untuk kandidat rilis berikutnya, catat commit, run, conclusion, artifact ID/digest/expiry dan lokasi arsipnya sendiri. CI baseline tidak membuktikan kelulusan commit baru atau server produksi.

## Cara mencatat hasil

Status yang diizinkan: BELUM DIUJI, LULUS, GAGAL, TERBLOKIR. Setiap LULUS wajib menyertakan pelaksana, waktu, perangkat/OS/browser atau host, langkah, hasil aktual dan referensi bukti. GAGAL/TERBLOKIR wajib memuat issue, pemilik dan tindak lanjut. Setelah perbaikan, simpan hasil lama dan tambahkan bukti uji ulang beserta commit.

## UAT wajib sesuai PRD

Semua baris berikut berstatus **BELUM DIUJI**. Untuk setiap baris, isi hasil aktual, bukti, pelaksana/waktu dan issue melalui format catatan di bawah.

| ID PRD | Pelaksana | Langkah dan hasil yang harus dibuktikan |
| --- | --- | --- |
| UAT-01 | Admin A/B | Coba akses objek staf, media, job, audit dan ekspor tenant lain; akses ditolak tanpa kebocoran isi. |
| UAT-02 | Admin | Preview/commit CSV duplikat dan cabang invalid; error dapat diperbaiki, retry tidak membuat staf ganda. |
| UAT-03 | Staf/admin | Putar YouTube nyata, kirim tiga jawaban gagal, reset beralasan oleh pihak berwenang, lalu lulus; nilai/riwayat bertahan setelah reload. |
| UAT-04 | Staf/assessor | Selesaikan teori saat praktik kritis belum disetujui; onboarding belum completed. Setujui dengan assessor berwenang dan periksa perubahan. |
| UAT-05 | Admin/staf | Publikasikan materi baru; assignment lama mempertahankan versi, nilai dan syarat awal. |
| UAT-06 | Operator | Pada lingkungan uji, jalankan scheduler ganda/retry setelah crash; hanya satu instance per kunci jadwal. |
| UAT-07 | Supervisor/operator | Uji shift malam lintas tanggal di WIB/WITA/WIT; bandingkan tanggal/tenggat dengan fixture yang disetujui. |
| UAT-08 | Staf | Putus jaringan saat mutasi, hubungkan lalu retry; tidak ada sukses palsu atau record ganda. |
| UAT-09 | Staf/supervisor | Gagalkan item kritis, laporkan kendala sesuai kebijakan, minta perbaikan lalu terima revisi; histori lengkap. |
| UAT-10 | Admin/staf | Pindah cabang dan nonaktifkan akun; akses berubah, sesi dicabut sesuai aturan, laporan lama tetap utuh. |
| UAT-11 | Pemilik proses | Cocokkan tepat waktu/accepted/excused/cancelled dan denominator laporan dengan contoh hitungan manual yang disetujui. |
| UAT-12 | Operator/admin | Restore database dan gambar ke lingkungan terisolasi; periksa checksum, akses tenant, histori immutable dan fungsi aplikasi. |
| UAT-13 | Staf/QA | Uji keyboard, fokus dialog/Escape, screen reader, pembesaran teks dan alternatif media di perangkat fisik. |
| UAT-14 | Assessor/staf | Koreksi penilaian dan ajukan review; record awal tetap ada dan pelaku/alasan tercatat. |

Format catatan per pelaksanaan:

- ID/sesi; status; commit/image; lingkungan:
- Pelaksana/role; waktu dan zona; perangkat/OS/browser:
- Prasyarat/data sintetis; langkah reproduksi:
- Hasil yang diharapkan; hasil aktual:
- Referensi bukti terbatas atau screenshot yang sudah disamarkan:
- Issue/severity/pemilik; hasil uji ulang bila ada:
- Persetujuan pemilik proses/tanggal:

Matriks perangkat minimal: Chrome Android fisik kelas menengah melalui 4G dengan cache dingin; Safari iOS fisik; browser desktop dengan keyboard/screen reader. Catat model/versi dan kedua bahasa Indonesia/English untuk alur yang tersedia. Ukur waktu halaman staf dapat dipakai terhadap target ≤3 detik; catat hasil aktual walau target tidak tercapai. Uji YouTube nyata, koneksi diblokir, timeout 15 detik, retry dan transkrip. WebKit mobile sintetis tidak menjadi pengganti Safari pada perangkat fisik.

## Verifikasi lingkungan tujuan

Semua baris **BELUM DIVERIFIKASI**; operator wajib melengkapi hasil aktual dan bukti.

| ID | Pemeriksaan | Bukti yang diperlukan |
| --- | --- | --- |
| PROD-01 | Domain/TLS | DNS, HTTPS, rantai sertifikat/tanggal kedaluwarsa, redirect HTTP dan origin cookie yang benar. |
| PROD-02 | Port/proxy/sesi | Port internal tidak terbuka publik; trust proxy sesuai jumlah hop; IP klien/rate limit dan cookie Secure/HttpOnly diverifikasi. |
| PROD-03 | Konfigurasi/migrasi | Referensi secret store tanpa nilai rahasia, versi migrasi, image digest, health API/web/worker setelah migrasi. |
| PROD-04 | Gambar/ClamAV | Signature siap; file uji aman diterima; skenario pemindai tidak tersedia menolak unggah; isolasi gambar teruji. |
| PROD-05 | Beban/kapasitas | Spesifikasi VPS, dataset/profil baca-tulis dan 200 pengguna serentak, p95 API terhadap target ≤800 ms, error rate, RAM/CPU/disk; video diukur terpisah. |
| PROD-06 | Worker/notifikasi | Heartbeat, job retry/dedupe, failed job dan failed notification stream; uji alarm serta bukti diterima penerima yang ditunjuk. |
| PROD-07 | Alarm operasi | Simulasikan health gagal, disk tinggi dan backup terlambat secara aman di lingkungan uji; catat delivery, waktu dan tindak lanjut. |
| PROD-08 | Backup offsite | Timer harian berhasil, enkripsi, checksum, salinan lokasi terpisah, retensi dan kunci MFA disimpan terpisah; tanpa memublikasikan isi/key. |
| PROD-09 | Restore tujuan | Restore terisolasi dari salinan offsite, titik backup, waktu mulai/selesai, kehilangan data terukur (RPO target ≤24 jam), durasi pemulihan (RTO target ≤8 jam), pemeriksaan UAT-12. |
| PROD-10 | Rollback | Image sebelumnya, kompatibilitas migrasi, cadangan pra-migrasi dan hasil latihan rollback pada lingkungan terisolasi. |
| PROD-11 | Pilot/kebijakan | Persetujuan konten/SOP, retensi, pemberitahuan staf, akses dukungan dan pemilik proses; referensi dokumen berizin. |

Gunakan prosedur runbook untuk backup/restore; jangan menjalankan tes kegagalan atau restore menimpa produksi. Keberadaan konfigurasi alarm tidak membuktikan alarm diterima. Sasaran RPO/RTO dan performa harus dibandingkan hasil pengukuran, bukan ditandai lulus berdasarkan target.

## Keputusan rilis

- Kandidat commit/image dan tanggal: BELUM DIISI.
- Ringkasan UAT lulus/gagal/terblokir/belum diuji: BELUM DIISI.
- Ringkasan PROD dan issue terbuka: BELUM DIISI.
- Pemilik proses, operator dan pemberi keputusan: BELUM DITUNJUK.
- Keputusan: **NO-GO — bukti UAT dan produksi belum tersedia**.
- Persetujuan, waktu, batasan pilot dan rencana pemantauan: BELUM DIISI.

GO hanya setelah seluruh P0 diterima, tidak ada bug kritis/tinggi pada auth, isolasi tenant, integritas dan alur inti, serta gate checklist terpenuhi. Risiko lain yang diterima harus memuat alasan, dampak, mitigasi, pemilik, pemberi persetujuan dan tanggal tinjau. Jangan mengubah status produksi berdasarkan CI hijau saja.
