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

## Milestone 2: impor staf CSV (FR-02)

- Menu Impor staf CSV untuk OWNER/ADMIN, template UTF-8 dan pratinjau tanpa pembuatan akun.
- Batas 1 MiB, 5.000 record, dan 16 KiB per record. Mendukung BOM, CRLF, serta nama berkutip/koma.
- Validasi ID duplikat, kode cabang/jabatan, supervisor aktif dan kolom opsional email/tanggal mulai.
- Semua akun CSV memiliki role STAFF. Impor tidak mengubah akun yang sudah terdaftar dan tidak menerima kolom role/tenant/password.
- Konfirmasi eksplisit hanya menerapkan kandidat valid. Server memeriksa ulang referensi dan ID untuk perubahan sejak preview.
- Lock batch, hasil tersimpan dan savepoint per record menjaga retry, batch tumpang tindih dan kegagalan parsial agar tidak menggandakan akun atau meninggalkan user tanpa membership.
- Pratinjau berlaku 24 jam. Riwayat sepuluh batch terbaru tersedia untuk melanjutkan pemeriksaan setelah koneksi terputus.
- Laporan kesalahan CSV menggunakan encoding UTF-8, escaping tanda kutip dan pencegahan formula spreadsheet.
- Akun hasil impor menunggu aktivasi. Admin menerbitkan kode melalui tombol Kode baru di direktori staf, tanpa password default atau token massal dalam file.
- Migrasi `002_staff_imports.sql` menambah metadata impor, email user dan tanggal mulai membership.
- Suite lokal menjadi 26 integration tests, termasuk concurrent commit, overlap batch, batas payload dan validasi ulang saat data berubah.

Batas yang masih berlaku: impor diproses dalam transaksi API, belum melalui worker job. Kinerja maksimal 5.000 staf belum diukur sebagai SLA. Preview kedaluwarsa memblokir commit, namun pembersihan fisik metadata/PII masih membutuhkan lifecycle retensi sebelum produksi. Verifikasi visual browser belum selesai.

## Milestone 3A: fondasi materi dan teori (sebagian FR-03/FR-04)

- Menu materi mengikuti Clean Glassify. Admin membuat draft teks dengan tujuan, transkrip, ambang lulus dan 1–5 soal dengan 2–5 opsi, melalui UI maupun API.
- Draft hanya terlihat admin. Versi terbit tersedia sebagai pustaka belajar bagi anggota aktif tenant; belum merupakan assignment onboarding. Kunci jawaban hanya diberikan pada akses pengelola, bukan respons staf.
- API revisi membuat draft versi baru dengan nomor berurutan. Checksum SHA-256 konten, penulis, waktu terbit dan audit disimpan. Trigger database melindungi konten terbit dan histori penilaian dari mutasi/penghapusan.
- Penilaian teori dihitung server, batas lulus default 80%, maksimum tiga percobaan per versi. Idempotency key disimpan per anggota; replay identik mengembalikan hasil lama, payload berbeda ditolak. Lock anggota menyerialkan submit dan pemeriksaan batas percobaan.
- API arsip menghentikan akses pustaka/submission baru, sementara histori tetap tersimpan. Replay submission lama tetap tersedia melalui key yang sama.
- Lulus teori tidak menandai praktik atau onboarding selesai. Hasil eksplisit `practice_status: not_assessed`.

Belum selesai: aset gambar privat dan validasi file, signed URL gambar, kompetensi dan jabatan sasaran, jalur/assignment/snapshot, observasi praktik. Tidak ada klaim durasi video atau kompetensi staf. Daftar pustaka awal dibatasi 100 versi terbaru; pagination belum tersedia. Visual QA browser masih perlu dijalankan sebelum pilot.

API tambahan (memerlukan sesi dan Origin untuk POST): `GET/POST /api/v1/learning`, `GET /api/v1/learning/:id`, `POST .../:id/revise`, `POST .../:id/publish`, `POST .../:id/archive`, `POST .../:id/attempts`. Publikasi/arsip memakai `{ "confirm": true }`; submit memakai UUID `idempotency_key` dan array `answers` berindeks nol. Revisi memakai struktur konten yang sama seperti create. Semua pengelolaan terbatas OWNER/ADMIN pada tahap ini.

### Sumber video: YouTube saja

Materi menerima `video_url` opsional berupa HTTPS youtube.com/watch, /shorts, /embed atau youtu.be dengan ID 11 karakter. API menormalisasi ke URL watch kanonis dan menolak host palsu/protokol lain. UI membuka video di YouTube; tidak ada upload/download/penyimpanan video. Durasi dan ketersediaan video belum diverifikasi otomatis. Versi lama tanpa video tetap valid. Tautan unlisted tidak dianggap sebagai video privat tenant. Deck investor/CTO sebelumnya belum direvisi untuk perubahan sumber video ini.

### Editor materi lengkap — 16 Oktober 2026

UI mendukung tambah/hapus soal dan opsi dengan batas API, pilihan kunci jawaban, revisi dari versi yang dipilih menjadi draft baru, serta arsip versi terbit dengan konfirmasi. Penghapusan opsi menyesuaikan indeks kunci. Versi arsip diberi label yang sesuai dan tidak menampilkan form submit kuis. Editor dibersihkan setelah penyimpanan berhasil; kegagalan API mempertahankan input. Konfirmasi ditampilkan sebelum penggantian isi editor untuk revisi. Video tetap hanya melalui tautan YouTube. Pemeriksaan visual/interaksi browser belum dijalankan.

### Pembukaan ulang percobaan teori — 16 Oktober 2026

- Supervisor membuka tiga percobaan baru untuk STAFF aktif dalam scope cabang; OWNER/ADMIN dapat mengelola seluruh tenant. Self-reset ditolak. HR/OPERATIONS dan STAFF tidak diberi akses reset.
- Menu pendampingan pada materi terbit menampilkan hingga 100 staf yang gagal tiga kali dan belum pernah lulus versi tersebut. Alasan 10–1.000 karakter wajib, dengan konfirmasi UI.
- Setiap rangkaian memiliki batas tiga percobaan sendiri. Reset tidak mengubah versi kuis, jawaban, hasil lama, atau kompetensi. Histori pembukaan ulang dan alasannya terlihat pada detail materi staf sendiri.
- Reset disimpan append-only dan diaudit. Lock anggota yang sama dengan submit mencegah penambahan jatah ganda pada request serentak. Idempotency key yang sama mengembalikan hasil reset lama, sedangkan payload berbeda ditolak.
- API: `GET /api/v1/learning/:id/blocked` dan `POST /api/v1/learning/:id/resets` dengan `{membership_id, reason, idempotency_key}`. Detail materi menambahkan `budget` (round/used/remaining) dan `resets`; attempt baru mencatat `round`. Migrasi 004 mempertahankan seluruh attempt lama sebagai rangkaian pertama.
- Pembukaan ulang hanya untuk versi terbit. Tidak mengubah status onboarding/praktik. Pagination antrean, notifikasi otomatis dan pemeriksaan visual browser belum tersedia.

## Milestone 3B: penyusunan jalur onboarding (sebagian FR-05)

- Menu **Jalur onboarding** tersedia bagi OWNER/ADMIN. Editor menyusun 1–20 langkah berupa versi modul yang sudah terbit dalam tenant yang sama, tenggat relatif 0–365 hari kalender, serta prasyarat opsional berupa nomor langkah sebelumnya.
- Versi modul yang sama tidak dapat muncul dua kali. Tenggat prasyarat tidak boleh lebih lambat dari langkah yang bergantung padanya. Observasi praktik tetap wajib pada setiap langkah; tidak ada jalur teori saja pada tahap ini.
- Draft menyimpan snapshot judul, checksum dan ID versi modul. Referensi komposit tenant/versi di database mencegah relasi lintas tenant dan penghapusan modul yang direferensikan. Snapshot jalur tidak memuat kunci kuis.
- Publikasi memeriksa ulang bahwa seluruh modul masih terbit. Jalur terbit immutable; revisi menghasilkan draft baru dengan nomor versi berurutan, arsip tidak menghapus histori. Semua mutasi diaudit. Modul dikunci selama validasi dan penyimpanan agar publikasi/arsip serentak tidak menghasilkan snapshot dari modul yang sudah tidak tersedia pada saat pemeriksaan.
- API: `GET/POST /api/v1/onboarding-paths`, `GET /:id`, `POST /:id/revise`, `POST /:id/publish`, `POST /:id/archive`. Body create/revise adalah `{title,description,steps:[{version_id,due_days,prerequisite,practice_required:true}]}`; publish/archive memakai `{confirm:true}`. Daftar dibatasi 100 versi terbaru; pemilih modul mengambil hingga 100 versi materi terbaru dari pustaka.
- Batas 20 langkah dan 365 hari adalah batas implementasi awal untuk pilot, bukan target bisnis yang sudah tervalidasi.

Belum selesai pada FR-05: preview target staf/cabang/jabatan, assignment beserta snapshot tanggal aktual dan due_at, idempotensi batch, progres/prasyarat akses tugas, pembatalan beralasan dan observasi praktik. Pustaka belajar yang sudah tersedia tetap dapat diakses terpisah dari jalur. Publikasi jalur belum menugaskan staf atau mengubah kompetensi. Tidak ada klaim FR-05 selesai. Pemeriksaan visual/interaksi browser masih diperlukan.

## Milestone 3C: penugasan onboarding (sebagian FR-05)

- OWNER/ADMIN membuat pratinjau berdasarkan 1–100 ID staf, cabang atau jabatan dari tenant yang sama. Target diresolusikan menjadi 1–500 STAFF aktif dengan cabang; belum aktif login tetap dapat menerima penugasan. Pratinjau menyimpan daftar target tetap, snapshot jalur, tanggal mulai dan masa berlaku 24 jam. Pembuatan pratinjau belum membuat tugas.
- Konfirmasi batch bersifat atomik dan idempotent berdasarkan ID pratinjau yang tersimpan. Lock batch dan constraint unik batch/anggota mencegah duplikasi saat request serentak. Batch baru secara sengaja dapat menghasilkan tugas baru untuk staf yang sama; tidak ada deduplikasi lintas batch.
- Konfirmasi memeriksa ulang jalur/modul terbit, status aktif target, cabang, jabatan dan zona waktu. Perubahan konteks target menolak seluruh batch tanpa tugas parsial. Staf baru yang bergabung ke cabang/jabatan sesudah pratinjau tidak ditambahkan diam-diam.
- Setiap tugas menyimpan ID versi jalur, snapshot persyaratan, cabang saat penugasan, zona waktu, start_date dan due_at per langkah. Due_at merupakan batas eksklusif awal hari sesudah H+n di zona waktu cabang (H+0 tersedia sampai akhir tanggal mulai). Perhitungan memakai PostgreSQL, bukan zona waktu perangkat pengguna.
- Staf melihat tugas sendiri. Supervisor melihat tugas staf yang saat ini berada dalam scope cabangnya. Admin melihat tenant sendiri. Daftar menampilkan hingga 100 tugas terbaru tanpa pagination.
- Pembatalan admin memerlukan alasan 10–1.000 karakter dan diaudit. Status cancelled dan snapshot dilindungi trigger database; tidak ada hard-delete. Arsip jalur tidak menghapus tugas yang telah tersimpan, dan replay batch lama tetap mengembalikan hasilnya.
- API: `POST /api/v1/onboarding-assignments/preview` dengan `{path_version_id,start_date,target:{kind:'staff'|'branch'|'job',ids:[]}}`; `POST /batches/:id/commit` dengan `{confirm:true}`; `GET /`; `POST /:id/cancel` dengan `{reason}`. Migrasi 006 menambahkan batch dan assignment.

Belum selesai: integrasi hasil kuis dengan progres assignment, pelaksanaan prasyarat pada tugas, praktik/rubrik/approval, notifikasi dan completed. Status tugas awal adalah assigned/cancelled; lewat tenggat ditampilkan dari snapshot tanggal tanpa menutup tugas. Pustaka kuis tetap berdiri sendiri dan hasil lama belum diperhitungkan untuk tugas baru. UI pemilih staf mengambil 100 anggota pertama (sebelum filter STAFF); pilih cabang/jabatan untuk kelompok lain. Pratinjau UI belum dipulihkan otomatis setelah halaman ditutup. Visual QA browser masih diperlukan. Video tetap hanya tautan YouTube.
