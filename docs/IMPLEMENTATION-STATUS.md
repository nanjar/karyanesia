# Status implementasi Karyanesia v0.0.1

## Milestone 1: fondasi organisasi

Implementasi awal berdasarkan sprint 1 PRD. Ini belum merupakan rilis lengkap v0.0.1 dan belum siap produksi.

### Sudah diimplementasikan

- Monorepo npm workspaces, Next.js 16 dan NestJS 11 dengan TypeScript.
- Migrasi PostgreSQL transaksional dengan lock dan checksum.
- Tenant, akun, membership, cabang, jabatan, scope cabang dan audit append-only.
- Login kode perusahaan + ID karyawan + password scrypt, session opaque HttpOnly delapan jam.
- MFA TOTP untuk OWNER/ADMIN, secret terenkripsi AES-GCM, proteksi replay OTP.
- Bootstrap tenant/admin melalui CLI, tanpa password default.
- Aktivasi staf dengan token acak satu kali, tersimpan hash, kedaluwarsa 24 jam.
- Penerbitan ulang kode untuk akun belum aktif. Kode sebelumnya dibatalkan.
- Rate limit login per akun dan IP tersimpan PostgreSQL, bukan memori proses.
- Pemeriksaan Origin untuk mutasi, validasi payload ketat, error terstruktur dan correlation ID.
- API dan UI tambah/daftar cabang, jabatan, staf/supervisor; paginasi staf.
- Scope supervisor mengikuti cabang yang diberikan server. Staf hanya membaca profilnya.
- Nonaktif staf sekaligus mencabut sesi. OWNER/ADMIN tidak dapat dinonaktifkan lewat endpoint staf.
- Dashboard organisasi menggunakan angka database, tanpa metrik pelatihan fiktif.
- OpenAPI, Dockerfiles, Docker Compose dan CI dengan PostgreSQL 16.

### Batas fondasi yang masih perlu diselesaikan

- Impor CSV dua tahap (FR-02).
- Pemindahan cabang/jabatan, administrasi scope banyak cabang, pengelolaan HR/operasional, dan manajemen role melalui UI.
- Reset password, recovery/enrollment ulang MFA yang terotorisasi, serta alur email admin.
- Job cleanup sesi/rate limit kedaluwarsa dan pemantauan operasional.
- Penyempurnaan log/audit keamanan gagal login dan kebijakan retensi.

Admin saat ini dibuat melalui bootstrap CLI. Staf baru hanya dapat diberi role STAFF atau SUPERVISOR, untuk mencegah eskalasi akses lewat endpoint organisasi.

### Belum diimplementasikan

FR-03 sampai FR-12: media privat, materi versi, kuis, jalur belajar, assignment, observasi praktik, checklist, scheduler SOP, kendala, matriks kompetensi, laporan/ekspor dan notifikasi. FR-13 baru mencakup audit serta nonaktivasi pada organisasi, belum lifecycle seluruh modul.

Backup/restore, beban 200 pengguna, aksesibilitas menyeluruh, peninjauan privasi dan UAT lapangan tetap merupakan gate rilis berikutnya. Docker image belum diverifikasi di lingkungan ini jika Docker tidak tersedia. CI PostgreSQL baru dianggap lulus setelah workflow GitHub selesai.

## Panduan UI

UI fondasi mengikuti [Clean-Glassify](design/CLEAN-GLASSIFY.md), berdasarkan PDF pengguna: mesh pastel, panel kaca susu, aksen biru, serta empat kartu organisasi dengan data aktual. Layout pelatihan, SOP dan supervisi menjadi acuan modul berikutnya.

## Urutan berikutnya

1. Lengkapi siklus akun dan organisasi, termasuk impor staf serta perubahan scope.
2. Media privat dan module versioning, kemudian kuis server dan assignment.
3. Verifikasi praktik, baru onboarding end-to-end.
4. Checklist berulang, timezone cabang, review dan kendala.
5. Kompetensi, laporan, notifikasi, pengujian operasional dan pilot.

Referensi utama: [PRD v0.0.1](PRD-Karyanesia-v0.0.1.md).

## Verifikasi milestone lokal

- 16 integration tests lulus pada PGlite (mesin PostgreSQL tertanam), termasuk pemeriksaan constraint dan rollback transaksi.
- Typecheck dan production build kedua aplikasi lulus.
- Pemeriksaan format lulus dan audit dependency runtime tidak menemukan vulnerability pada lockfile milestone ini.
- Pemeriksaan browser visual belum berhasil: executable Chromium tidak tersedia dan unduhan browser gagal. Jangan menganggap UI telah lolos pengujian visual atau aksesibilitas menyeluruh.
- Uji PostgreSQL 16 sungguhan dijalankan oleh workflow CI, bukan disamakan dengan hasil PGlite lokal.
