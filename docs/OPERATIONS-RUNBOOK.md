# Karyanesia v0.0.1 — Runbook operasi

## Mulai dan migrasi

Gunakan `.env` privat, WEB_ORIGIN HTTPS, database password acak dan MFA_ENCRYPTION_KEY 32 byte hex. Jangan menaruh credential pada argumen CLI atau commit. Jalankan build image, migrasi satu kali (`docker compose run --rm api node apps/api/dist/migrate.js`), bootstrap tenant melalui profil setup, lalu `docker compose up -d`. Worker menggunakan image API yang sama. Jangan menjalankan versi worker baru sebelum migrasi selesai.

ClamAV tidak mempublikasikan port host. Tunggu signature siap; unggah gagal tertutup sampai pemindai memberikan OK. Gambar disimpan privat di database setelah pemindaian dan normalisasi. Video tetap tautan YouTube. Ukur RAM ClamAV dan database untuk VPS yang dipilih.

## Worker dan monitoring

Worker memindai jadwal maksimal 100 tanggal per tick, termasuk catch-up, setiap 60 detik. Tanggal memakai zona jadwal; hari ISO Senin=1. Lease job lima menit; transaksi generate dan unique ledger menjaga retry setelah crash. Lima kegagalan memindahkan job ke failed; backoff 1, 2, 4, 8, 16 menit. Hentikan jadwal melalui UI/API jika sudah tidak berlaku. Histori dan tugas yang sudah dibuat dipertahankan.

`GET /api/v1/operations-health` khusus OWNER/ADMIN menampilkan heartbeat (sehat jika <3 menit) dan jumlah job per status tenant. `/operations-health/failed-jobs` menyediakan antrean gagal; `POST /operations-health/:id/retry` dengan `{reason}` mengantrekan ulang dan diaudit. Operator memeriksa log JSON `worker.job_failed`/`worker.tick_failed`, database/konektivitas dan kelayakan admin sebelum retry. Request log hanya path (tanpa query/signature), status, correlation_id dan durasi; jangan menambahkan body/token ke log.

Pasang alarm eksternal untuk heartbeat >3 menit, job failed >0, API health gagal, disk database >80%, backup terakhir >24 jam dan error rate meningkat. Konfigurasi alarm dan penerima merupakan pekerjaan deployment; kode tidak mengklaim alarm sudah aktif.

## Backup harian

Dari checkout dengan `.env` yang benar: `BACKUP_DIR=/absolute/private/backup bash scripts/backup.sh`. Skrip menulis pg_dump format custom dan checksum dengan permission privat. Pasang timer harian pada host, pantau exit code, dan salin terenkripsi ke lokasi terpisah. Simpan MFA_ENCRYPTION_KEY terpisah secara aman: dump database saja tidak cukup memulihkan MFA. Jangan memasukkan key ke arsip publik atau log.

Retensi draft (audit 12 bulan, bukti foto 90 hari, histori aktif +12 bulan) belum merupakan kebijakan yang disetujui. Jangan mengaktifkan purge sebelum persetujuan tenant/legal hold. Migrasi immutable tidak menyediakan penghapusan histori lewat UI biasa. Backup memiliki siklus retensi terpisah dan catatan penghapusan/pseudonimisasi harus diterapkan kembali setelah restore.

## Restore ke lingkungan terisolasi

1. Hentikan API/worker tujuan. Verifikasi checksum dump; jangan restore langsung menimpa produksi.
2. Buat database kosong yang terisolasi dengan PostgreSQL 16 dan role aplikasi. Restore menggunakan `pg_restore --exit-on-error --no-owner --no-privileges`. Pastikan permission role sesuai least privilege.
3. Pasang kunci MFA dan config tujuan yang benar. Verifikasi tabel, jumlah tenant/staf, checksum byte gambar, snapshot histori dan trigger immutable; jalankan API integration suite pada database uji, bukan produksi.
4. Cabut sesi/activation token yang tidak lagi semestinya berlaku sesuai incident plan, terapkan kembali deletion ledger/pseudonimisasi, dan periksa akses lintas tenant.
5. Jalankan API lalu worker; periksa backlog, notifikasi dedupe dan health. Catat durasi restore dan titik backup untuk RPO/RTO. Sasaran RPO ≤24 jam / RTO ≤8 jam belum menjadi hasil produksi.

CI `scripts/restore-smoke.mjs` memakai container PostgreSQL 16 dan database sintetis dengan nama acak. Ia dump/restore skema dan gambar, memeriksa checksum serta immutability, lalu membersihkan kedua database. Ini tidak menggantikan latihan restore server tujuan dan offsite backup.

## Rollback dan go-live

Cadangkan sebelum migrasi. Rollback aplikasi memakai image sebelumnya; jangan menghapus migrasi yang sudah diterapkan. Migrasi baru menambah tabel/kolom, tetapi penulisan schema baru perlu diperiksa kompatibilitas sebelum downgrade. Gunakan restore teruji jika rollback data diperlukan.

Go-live memerlukan bukti UAT, audit browser/aksesibilitas, load test, konten disetujui, TLS, monitoring aktif, backup offsite dan restore pada lingkungan tujuan. Lihat `IMPLEMENTATION-STATUS.md` untuk gap yang masih terbuka; jangan mengumumkan 100% hanya dari build/CI hijau.
