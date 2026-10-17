# Karyanesia v0.0.1 — Checklist penerimaan rilis

Status 17 Oktober 2026: implementasi dan verifikasi repository tersedia; penerimaan produksi belum 100%. Gunakan PRD sebagai baseline dan IMPLEMENTATION-STATUS sebagai catatan bukti. Tidak ada hasil UAT atau deployment yang diasumsikan.

| Kebutuhan              | Bukti implementasi/verifikasi repository                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| FR-01 Akun             | Aktivasi/reset sekali pakai, MFA admin, session revoke, rate limit; uji autentikasi dan identitas bersama  |
| FR-02 Organisasi/impor | Scope cabang, CSV preview/commit, error CSV, lifecycle akses/perpindahan; uji tenant/concurrency           |
| FR-03 Materi           | Versi/checksum immutable, YouTube tervalidasi dengan durasi deklarasi penulis, transkrip dan gambar privat |
| FR-04 Kuis             | Kuis teks/gambar + alt, grading server, batas percobaan/reset dan idempotensi                              |
| FR-05 Onboarding       | Jalur/snapshot, preview/penugasan batch, prasyarat, teori/praktik terpisah                                 |
| FR-06 Praktik          | Rubrik, scope penilai, koreksi append-only, permintaan review, bukti foto opsional                         |
| FR-07 Jadwal SOP       | Hari/shift/zona waktu, penerima eksplisit, catch-up worker, stop dan deduplikasi                           |
| FR-08 Pelaksanaan SOP  | Draft, required/critical/photo, submit/review/perbaikan, timestamp awal, excused/cancelled                 |
| FR-09 Kendala          | Pelaporan, prioritas/owner/tenggat, transisi/histori, lampiran privat                                      |
| FR-10 Kompetensi       | Bukti sesuai versi teori/praktik, expiry, kebutuhan jabatan, readiness dan koreksi                         |
| FR-11 Laporan          | Filter/scope, as_of, denominator teruji dengan fixture hasil pasti, CSV aman dan audit                     |
| FR-12 Notifikasi       | Sumber persisten, dedupe, reminder, retry/backoff, failed stream dan heartbeat                             |
| FR-13 Audit            | Histori append-only, role/scope, session revoke, ekspor, penonaktifan dan perpindahan                      |

Baseline CI d88f8f5: 79 integration tests, sembilan skenario browser (Chromium desktop/360 px dan WebKit mobile), axe, typecheck, formatting dan build lulus. Pengujian browser otomatis belum menggantikan UAT perangkat fisik. CI menjalankan suite PostgreSQL 16, profil 200 request serentak pada data 10.000 staf dan smoke test pg_dump/pg_restore termasuk byte gambar/checksum/trigger. Periksa status commit terbaru di GitHub Actions sebelum menggunakan image.

## Gate sebelum status 100% go-live

- [ ] Perusahaan pilot, pemilik proses dan peserta UAT ditunjuk; konten/skenario SOP disetujui perusahaan.
- [ ] UAT PRD 1–14 dijalankan admin, supervisor dan staf; hasil serta persetujuan dicatat.
- [ ] Audit browser 360 px/desktop, keyboard/screen reader, kontras, pembesaran teks dan Safari iOS; pemutaran YouTube nyata serta gagal jaringan diuji.
- [ ] Pengukuran cold-start Android/4G dan profil beban di VPS tujuan; hasil CI tidak diperlakukan sebagai jaminan VPS.
- [ ] Domain/TLS, secret management, trust proxy, signature ClamAV dan kapasitas memori/storage diverifikasi.
- [ ] Worker aktif, alarm heartbeat/failed job/notifikasi/disk/backup dipasang dan penerima alarm ditentukan.
- [ ] Backup harian terenkripsi di lokasi terpisah, key MFA terpisah, restore pada host tujuan dan RPO/RTO tercatat.
- [ ] Kebijakan retensi, pemberitahuan staf, hak akses dukungan dan pemrosesan data disetujui tenant; jangan mengaktifkan purge tanpa kebijakan.

Runbook teknis: OPERATIONS-RUNBOOK.md. Gate ini membutuhkan akses dan keputusan pemilik lingkungan/perusahaan; repository dan tes sintetis tidak dapat menggantikan bukti tersebut.
