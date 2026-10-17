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

Belum selesai: pelaksanaan prasyarat pada tugas, praktik/rubrik/approval, notifikasi dan completed. Status tugas awal adalah assigned/cancelled; lewat tenggat ditampilkan dari snapshot tanggal tanpa menutup tugas. Pustaka kuis tetap tersedia; integrasi bukti teori kini mengikuti milestone 3D di bawah. UI pemilih staf mengambil 100 anggota pertama (sebelum filter STAFF); pilih cabang/jabatan untuk kelompok lain. Pratinjau UI belum dipulihkan otomatis setelah halaman ditutup. Visual QA browser masih diperlukan. Video tetap hanya tautan YouTube.

## Milestone 3D: progres teori pada assignment

- API daftar assignment menghitung status/progres dari histori kuis append-only untuk tenant, staf dan ID versi modul yang sama. Tidak menerima angka progres atau kelulusan dari klien. Query hanya memproses bukti yang berkaitan dengan assignment yang lolos scope akses.
- Bukti teori lama pada versi yang sama digunakan kembali, termasuk sebelum penugasan. Versi revisi berbeda tidak mewarisi kelulusan. Kelulusan tetap berlaku meskipun ada percobaan gagal sesudahnya; masa berlaku/expiry teori belum tersedia. Kebijakan ini dicatat dalam PRD.
- `status` pada response adalah read model: assigned, in_progress, awaiting_assessment atau cancelled. Snapshot/status siklus hidup yang disimpan tidak ditimpa saat kuis berubah. Pembatalan masih tersimpan permanen; bukti kuis sesudah cancelled_at tidak mengubah tampilan histori tugas tersebut.
- `progress` berisi theory_passed, total, practice_passed, completed_steps, overdue dan steps. Setiap langkah memuat theory_status, attempts, best_score, passed_at, practice_status, module_available dan overdue. Nilai praktik dan completed_steps tetap nol karena observasi praktik belum diimplementasikan. Tidak ada status completed dari teori saja.
- Staf membuka materi/kuis langsung dari tugasnya sendiri. Komponen menggunakan API belajar yang sama; batas percobaan/reset tetap per staf/versi, bukan per assignment. Perubahan bukti satu versi dapat memperbarui beberapa assignment staf tersebut. Versi arsip tidak dapat dibuka, tetapi kelulusan sebelumnya tetap tercatat.
- Lewat tenggat dihitung server dari due_at dan kewajiban praktik yang belum selesai, tanpa menutup akses belajar. Pembatalan mematikan flag overdue tugas.

Belum selesai: prasyarat sebagai pembatas akses, praktek/rubrik/approval, expiry teori, notifikasi, pagination dan pemeriksaan visual/interaksi browser. Tidak ada klaim onboarding lengkap. Video tetap tautan YouTube saja. Perubahan ini tidak memerlukan migrasi database.

## Milestone 3E: rubrik praktik berversi (fondasi FR-06)

- OWNER/ADMIN membuat rubrik dengan judul, petunjuk observasi dan 1–20 item. Setiap item memiliki kriteria teks, required dan critical; minimal satu item wajib, dan critical hanya sah jika required=true. Nomor posisi item ditetapkan server.
- Rubrik mengikuti draft → published → archived. Versi terbit dan identitasnya dilindungi trigger database. Revisi membuat draft baru dengan nomor berurutan; checksum, penulis, waktu terbit dan audit disimpan. Tidak ada hard-delete.
- Editor jalur kini meminta versi rubrik terbit untuk setiap langkah. API menerima `rubric_version_id` opsional agar jalur/integrasi awal tetap kompatibel; tanpa referensi ini langkah tetap wajib praktik tetapi belum siap dinilai. Tidak ada rubrik atau hasil kompeten yang dibuat otomatis untuk data lama.
- Snapshot jalur menyimpan ID/versi/checksum rubrik, petunjuk dan seluruh item. Referensi komposit tenant/rubrik pada onboarding_path_modules mencegah relasi lintas tenant dan menjaga versi yang direferensikan. Snapshot assignment menyalin kriteria tersebut sehingga revisi atau arsip rubrik tidak mengubah tugas lama.
- Publikasi jalur serta preview/konfirmasi assignment memeriksa ulang status rubrik terbit. Rubrik yang diarsipkan menolak penugasan baru; assignment lama tetap menampilkan kriteria aslinya. Rubrik yang sama boleh digunakan beberapa langkah.
- Menu Rubrik praktik hanya untuk admin. Staf/supervisor melihat kriteria pada assignment yang lolos scope mereka; tidak memperoleh akses pustaka rubrik admin.
- API: `GET/POST /api/v1/practice-rubrics`, `GET /:id`, `POST /:id/revise`, `POST /:id/publish`, `POST /:id/archive`. Create/revise memakai `{title,instructions,items:[{label,required,critical}]}` tanpa position; publish/archive memakai `{confirm:true}`. Daftar/pemilih mengambil maksimal 100 versi terbaru. Migrasi 007 menambah rubrik dan referensinya pada jalur.

Batas 20 item merupakan batas implementasi awal untuk pilot. Belum tersedia: pengisian observasi, competent/needs_practice, komentar dan instruksi latihan hasil gagal, bukti, koreksi melalui record baru, pengajuan praktik, review/approval, dan completed. Rubrik tersimpan tidak berarti praktik sudah dinilai. Pemeriksaan visual browser masih diperlukan. Video tetap hanya tautan YouTube.

## Milestone 3F: pengesahan observasi praktik dan penyelesaian tugas

- SUPERVISOR dalam scope cabang serta OWNER/ADMIN dapat mengesahkan observasi untuk staf aktif; self-assessment ditolak. Tanggal mulai lokal harus sudah tiba, teori langkah harus lulus dan praktik prasyarat harus kompeten.
- Seluruh item pada rubrik snapshot dijawab boolean, termasuk opsional. Server menentukan competent hanya jika seluruh required/critical lulus; kegagalan opsional tidak menghalangi. Komentar minimal 10 karakter wajib; needs_practice wajib arahan latihan minimal 10 karakter. Klien tidak dapat menetapkan outcome atau progres.
- Observasi langsung disahkan menjadi record append-only: rubrik versi, jawaban, assessor, komentar, arahan, waktu dan audit. Reassessment/koreksi menunjuk supersedes hasil terbaru serta alasan minimal 10 karakter. Lock assignment dan pengecekan hasil terakhir mencegah penilaian serentak saling menimpa.
- Idempotency key disimpan per tenant/assessor dengan hash isi. Replay identik mengembalikan hasil semula; isi berbeda ditolak. Tugas cancelled menolak penilaian baru tetapi replay hasil lama tetap tersedia bagi penilai yang masih dalam scope.
- Progres mengambil hasil terbaru per langkah. Completed hanya jika semua teori lulus dan praktik competent. Koreksi yang mengubah hasil menjadi needs_practice dapat mengembalikan status ke awaiting_assessment dan memunculkan overdue. Snapshot/lifecycle tersimpan tetap tidak ditimpa oleh read model progres.
- Tugas dengan rubrik yang sudah diarsipkan tetap menggunakan snapshot aslinya; tugas lama tanpa rubrik menolak pengesahan. Staf dan pengelola dalam scope dapat melihat riwayat hingga 100 record terbaru. Form menyertakan konfirmasi bahwa pengesahan bersifat permanen dan koreksi memakai record baru.
- API: `GET /api/v1/onboarding-assignments/:id/assessments`; `POST` pada URL sama dengan `{step_position,answers:[{position,passed}],comment,training_instructions?,correction_reason?,supersedes?,idempotency_key}`. Outcome competent/needs_practice dihitung server. Migrasi 008 menambahkan practice_assessments beserta FK tenant, rantai supersedes dan trigger append-only.

Belum selesai FR-06: pengajuan praktik/permintaan review oleh staf, bukti opsional foto/file, draft observasi terpisah dan notifikasi. Prasyarat menghalangi pengesahan praktik lanjutan, tetapi belum membatasi akses materi/kuis di pustaka. Tidak ada klaim seluruh PRD selesai. Visual QA/interaksi browser masih diperlukan. Video tetap tautan YouTube saja.

## Milestone 3G: pengajuan praktik dan peninjauan staf

- Pemilik assignment dapat mengajukan practice/review setelah tanggal mulai, kelulusan teori dan kompetensi praktik prasyarat terpenuhi. Rubrik wajib ada pada snapshot. Review harus merujuk hasil observasi terbaru; praktik competent hanya menerima jenis review.
- Pengajuan append-only mencatat jenis, alasan minimal 10 karakter, referensi hasil, sequence, waktu dan idempotency key/hash. Lock assignment menyerialkan request dan pengesahan. Satu langkah hanya memiliki satu pengajuan yang belum dijawab. Replay identik tidak menambah antrean, sedangkan isi berbeda pada key sama ditolak.
- Observasi baru menautkan request_id ke pengajuan pending pada langkah tersebut. FK komposit tenant/assignment/step dan constraint unik request_id menjaga relasi yang tepat. Replay observasi lama tidak mengonsumsi pengajuan yang muncul sesudahnya. Observasi tanpa request tetap diizinkan.
- Progres langkah menambahkan practice_request terbaru dengan status pending/answered/cancelled. Pengajuan pending tidak mengubah outcome atau status completed. Pembatalan assignment menghentikan request pending; jawaban dan histori yang sudah ada tetap tersimpan.
- Antrean khusus untuk OWNER/ADMIN dan SUPERVISOR mengikuti scope cabang anggota saat ini, mengecualikan tugas sendiri, staf tidak aktif dan tugas cancelled. Query tidak dibatasi pada 100 assignment terbaru; mengambil maksimal 100 tugas tertua dengan request menunggu. Tidak ada pagination atau SLA pada tahap ini.
- UI staf menyimpan pengajuan, UI penilai memfilter antrean dan melihat alasan. Riwayat pengajuan/observasi memperlihatkan tautan silang dan tersedia bagi pemilik tugas serta pengelola dalam scope, maksimal 100 record terbaru.
- API: `GET /api/v1/onboarding-assignments/practice-queue`; `GET/POST /:id/practice-requests`. POST memakai `{step_position,kind:'practice'|'review',reason,based_on:uuid|null,idempotency_key}`. Hanya pemilik tugas boleh POST; admin tidak mengajukan atas nama staf. Migrasi 009 menambah practice_requests dan request_id pada observasi.

Belum tersedia: penarikan/edit pengajuan, bukti foto/file, notifikasi, SLA, komentar bolak-balik dan pengalihan ke penilai independen otomatis. Penilai yang sama boleh menindaklanjuti review sesuai scope; sistem belum menjanjikan mekanisme banding independen. Prasyarat masih belum membatasi akses kuis di pustaka. Pemeriksaan visual/interaksi browser masih diperlukan. Video tetap hanya tautan YouTube.

## Milestone 3H: akses belajar dengan jadwal dan rantai prasyarat

- GET detail materi dan POST kuis memeriksa akses peserta pada server, termasuk akses langsung tanpa UI. Tanggal mulai di zona waktu cabang harus tiba dan seluruh ancestor prasyarat harus lulus teori serta praktik competent. Koreksi ancestor dapat mengunci materi turunannya lagi. Due_at tidak menjadi batas penutupan belajar.
- Detail materi menerima `?assignment_id=UUID`, submit menerima `assignment_id` opsional. Konteks wajib milik aktor dan memuat versi modul yang diminta; konteks asing/tidak sesuai ditolak, tugas cancelled terkunci. UI membuka kuis dari tugas dengan konteks tersebut dan menampilkan alasan kunci.
- Pustaka materi tidak ditugaskan tetap terbuka. Jika ada beberapa assignment aktif untuk versi sama, minimal satu yang eligible membuka akses pustaka. Konteks tugas tertentu tetap terkunci jika rantai tugas itu belum terpenuhi. Materi dengan seluruh penugasan cancelled kembali mengikuti akses pustaka bebas. Kebijakan berbagi versi dicatat di PRD dan panduan.
- Admin dapat preview materi untuk pengelolaan; pembatasan peserta tetap diterapkan saat submit. Replay idempotent hasil lama tetap tersedia tanpa membuat percobaan baru, sementara perubahan konteks pada key sama ditolak. Bukti teori lama tidak dicabut oleh kunci akses dan tetap dapat digunakan ulang pada versi yang sama.
- Pengajuan dan pengesahan praktik memakai pemeriksaan rantai yang sama, bukan hanya prasyarat langsung. Progres menambah learning_available, learning_locked_reason dan practice_eligible per langkah. Pustaka menambahkan learning_available/learning_locked_reason pada daftar materi non-admin.
- Migrasi 010 menambah assignment_id nullable pada attempt, FK tenant/assignment/membership dan indeks provenance. Percobaan baru dari tugas menyimpan konteks dan mencatatnya di audit. Percobaan lama tetap berfungsi tanpa backfill.
- Submit diserialkan lewat lock membership dan membaca assignment di dalam transaksi, sehingga pemeriksaan akses tidak hanya mengandalkan state UI yang bisa usang. Tidak ada perubahan snapshot versi atau hasil penilaian yang sudah disahkan.

Belum selesai: bukti foto/file, notifikasi otomatis, pagination, indikator waktu real-time tanpa refresh, dan pemeriksaan visual/interaksi browser. Kriteria penerimaan lain pada PRD masih perlu dituntaskan. Video tetap hanya tautan YouTube; pembatasan Karyanesia tidak mengubah izin video pada YouTube.

## Milestone 4A: template SOP berversi (sebagian FR-07)

- Menu Template SOP untuk OWNER/ADMIN mendukung draft, publikasi, revisi dan arsip. Template menyimpan judul/petunjuk, target cabang/jabatan, label shift, waktu mulai/tenggat lokal, due_next_day, auto_accept dan 1–30 item bertipe boolean/number/text.
- Item boolean menyimpan expected; angka menyimpan unit serta batas min/max nullable dengan minimal satu batas dan min≤max; teks menyimpan max_length. Nomor posisi item ditentukan server. Schema strict menolak foto dan field/tipe tidak dikenal.
- Minimal satu item wajib, critical mengharuskan required. Auto_accept dilarang jika ada item kritis. Issue_required tersedia sebagai konfigurasi untuk boolean/number, ditolak untuk teks karena belum ada aturan ketidaksesuaian otomatis teks. Belum ada eksekusi aturan ini.
- Target 1–100 cabang dan 1–100 jabatan diverifikasi dalam tenant yang sama; UUID dinormalisasi sebelum pemeriksaan duplikat. Snapshot menyimpan identitas dan zona waktu cabang serta identitas jabatan saat draft dibuat. FK komposit dan referensi append-only menjaga isolasi tenant/histori.
- Publikasi memeriksa ulang konfigurasi dan ketersediaan target. Konten terbit serta identitas versi immutable di database; revisi concurrent mendapat nomor berbeda melalui lock tenant. Semua mutasi diaudit. Tidak ada hard-delete.
- Batas implementasi pilot: 30 item, maksimal 100 target per kategori, jendela shift >0 sampai 24 jam, angka -1e9 sampai 1e9, panjang teks sampai 4.000. Batas tersebut bukan ukuran pasar atau target bisnis yang sudah diukur.
- API: `GET/POST /api/v1/sop-templates`, `GET /:id`, `POST /:id/revise`, `POST /:id/publish`, `POST /:id/archive`. Create/revise memakai `{title,instructions,branch_ids,job_ids,shift_label,start_time,due_time,due_next_day,auto_accept,items}`. Item umum `{label,kind,required,critical,issue_required}`, ditambah expected untuk boolean, unit/min/max untuk number, max_length untuk text. Publish/archive memakai `{confirm:true}`. Maksimal 100 versi terbaru tanpa pagination.
- Migrasi 011 menambah sop_templates dan referensi cabang/jabatan. UI mengikuti milk-glass dengan aksen SOP hijau dan label kritis merah yang tetap memakai teks.

Belum selesai FR-07/FR-08: jadwal harian/hari tertentu, penerima eksplisit, generation instance idempotent, unassigned/notifikasi, pengisian draft server, submit/review, auto-accept runtime, pengecualian dan pembatalan instance. Foto dan modul kendala juga belum tersedia. Publikasi template tidak menghasilkan tugas atau data kepatuhan staf. Pemeriksaan visual/interaksi browser masih diperlukan. Video tetap hanya tautan YouTube pada materi pelatihan.

### 4B — Jadwal SOP dan pembangkitan tugas melalui API

- OWNER/ADMIN dapat membuat jadwal dengan versi SOP terbit, satu cabang, penerima staf eksplisit (maksimal 500), rentang tanggal maksimal 366 hari, dan hari ISO 1–7. Semua hari berarti harian.
- Jadwal menyimpan snapshot template/checksum, penerima, nama cabang dan zona waktu. Versi template yang kemudian diarsipkan tetap berlaku bagi jadwal yang sudah dibuat.
- Pembangkitan manual per tanggal menggunakan transaksi dan kunci jadwal; ledger serta batas unik database menjaga pengulangan/concurrency tidak menggandakan tugas. Snapshot tugas dan ledger tidak dapat diubah/dihapus.
- Waktu mulai/tenggat dihitung PostgreSQL dari tanggal lokal cabang; shift lintas tengah malam terikat tanggal mulai. Tugas tetap `open`, dengan flag `overdue` dari jam server.
- Kelayakan penerima diperiksa ulang (aktif, STAFF, cabang/jabatan sesuai). Penerima yang tidak memenuhi syarat dicatat dalam hasil run; bila tidak ada penerima, dibuat satu penanda `unassigned`. Pengulangan mengembalikan hasil semula, termasuk bila kelayakan penerima berubah sesudahnya.
- Daftar tugas dibatasi tenant: staf hanya miliknya, supervisor hanya cabang grant, OWNER/ADMIN seluruh tenant (100 terbaru berdasarkan tenggat).
- Validasi: 62 integration tests, termasuk lintas tenant, peran, konkurensi, shift malam, snapshot immutable dan unassigned.
- Batas tahap: API saja; UI jadwal/daftar tugas, worker otomatis, penghentian/revisi jadwal, penugasan ulang, notifikasi, jawaban draft, submit/review dan issue belum tersedia. Tidak ada tugas yang dianggap selesai atau diterima otomatis.

### 4C–6A — Pelaksanaan SOP, kendala, keterampilan dan operasi

- SOP memiliki draft server, pemeriksaan tipe/required/bukti foto, kewajiban kendala untuk nilai tidak sesuai, submit, auto-accept template tanpa item kritis, review manusia, perbaikan, pengecualian dan pembatalan beralasan. Histori append-only, revision dan kunci idempotensi menjaga concurrency. Self-review ditolak; first_submitted_at dipertahankan.
- Kendala mendukung kategori/prioritas, penanggung jawab/tenggat tervalidasi, assigned → in_progress → resolved → closed/reopened, catatan tindakan, scope cabang dan antrean prioritas tinggi. Layar memuat instruksi untuk menghubungi kontak internal saat mendesak.
- Worker terpisah menjalankan catch-up jadwal hingga tanggal lokal hari ini (maksimal 100 tanggal per tick), retry eksponensial hingga lima kegagalan, antrean gagal dan heartbeat. Jadwal dapat dihentikan; histori tetap tersedia. Operator dapat retry job gagal dengan alasan dan audit.
- Notifikasi dalam aplikasi berasal dari source record persisten, dengan unique delivery key untuk tugas baru, reminder tenggat, keterlambatan, hasil teori/praktik, perbaikan SOP, unassigned dan kendala tinggi. Judul generik; tautan memerlukan sesi dan izin API.
- Definisi kompetensi immutable menunjuk versi materi+rubrik. Matriks menghitung not_started/learning/theory_passed/verified/expired dari bukti, masa berlaku opsional, serta kekurangan syarat jabatan berikutnya. Persyaratan jabatan berversi; tidak ada ranking/promosi otomatis. Kanal koreksi data dan penyelesaian tercatat.
- Laporan periode/cabang/jabatan/jalur/status, detail sumber, as_of, definisi denominator SOP dan ekspor CSV dengan audit serta perlindungan formula injection tersedia. Jabatan onboarding disimpan dari target historis. Persentase tanpa denominator bernilai null.
- Unggah gambar JPEG/PNG/WebP maksimal 5 MB: pemeriksaan format aktual/pixel limit, pemindaian ClamAV fail-closed, normalisasi PNG dan pembuangan metadata. Private media endpoint membutuhkan sesi, izin objek dan signature 120 detik terikat membership. Kuis mendukung gambar pertanyaan/opsi dengan alt text; kunci tetap disembunyikan. Foto SOP wajib diverifikasi sebelum submit. Tidak ada unggah video.
- HR dapat mengelola materi/jalur/rubrik; penugasan HR/ops/supervisor mengikuti grant cabang. Ops mengelola template/jadwal sesuai scope. Admin dapat mengubah role/scope/kapabilitas penilai dan mencabut sesi; perpindahan staf menyediakan preview dampak dan mempertahankan histori; reset akun memakai token sekali pakai 24 jam.
- UI tersedia untuk SOP/kendala, jadwal/generate/stop, kompetensi/persyaratan/koreksi, laporan/CSV, notifikasi serta lifecycle anggota. Beberapa daftar masih dibatasi 100 item per tampilan; perlu pagination lanjutan sebelum kapasitas pilot 1.000 staf/tenant dinyatakan teruji.
- Ditambahkan uji restore logis PostgreSQL 16 dalam CI (database sintetis terisolasi, skema, gambar/checksum, tenant predicate dan trigger immutable), skrip backup, log request JSON dan health worker khusus admin.

### Keputusan arsitektur implementasi — 16 Oktober 2026

1. Antrean worker MVP menggunakan tabel PostgreSQL (lease, retry/backoff, unique keys) sebagai pengganti usulan Redis/BullMQ. Mengurangi layanan dan menjaga transaksi sumber kebenaran tunggal. Ukuran batch dan polling 60 detik perlu diukur pada beban pilot.
2. Gambar privat MVP disimpan sebagai bytea PostgreSQL, bukan layanan S3 terpisah. Batas 5 MB, hanya gambar yang dipindai/normalisasi. Backup database mencakup byte aset; biaya/ukuran database harus dipantau. Migrasi ke object storage menjadi tindak lanjut kapasitas; akses privat dan signature tetap wajib.
3. ClamAV wajib tersedia untuk unggah di luar lingkungan test. Test hanya melewati jaringan AV; integrasi signature AV dan kapasitas memori di server produksi harus diverifikasi sebelum go-live.

### Gate yang belum boleh diklaim selesai

- UAT pengguna/perusahaan pilot, persetujuan konten dan kebijakan data/retensi, admin/supervisor terlatih.
- Deployment produksi, TLS, backup harian aktif di lokasi terpisah, alarm eksternal serta pengujian pemulihan pada infrastruktur tujuan.
- Audit visual/browser 360 px, keyboard/screen reader dan Safari iOS; belum tersedia browser lokal pada lingkungan pengembangan ini.
- Profil beban sintetis CI PostgreSQL (10 tenant × 1.000 staf, 200 pengguna) lulus batas p95 ≤800 ms; pengukuran VPS pilot dan cold-start Android/4G ≤3 detik tetap belum terbukti.
- Karena gate operasional dan UAT di atas, rilis belum diberi status 100% atau siap produksi.

### 6B — Penutupan gap aplikasi dan pengujian

- Pemutar YouTube memakai IFrame API resmi, dimuat setelah klik; posisi disimpan per pengguna/versi dengan revision dan pemeriksaan konteks assignment. Transkrip/fallback tetap tersedia, video tidak pernah diambil server. Durasi 1–300 detik wajib pada materi video baru; penulis memverifikasi durasi. ID YouTube dan URL kanonis disimpan.
- Metadata materi mencakup deskripsi, jabatan sasaran, kompetensi terkait dan gambar pendukung. Kuis visual tetap mensyaratkan teks/alt setara.
- Ditambahkan cursor pagination versi, jadwal, tugas SOP/onboarding, kendala, notifikasi serta matriks; picker staf menelusuri halaman hingga 5.000 anggota dalam scope. Antrean praktik tetap menampilkan 100 pending terlama untuk menjaga prioritas.
- Layar Hari Ini menampilkan ringkasan tugas aktif; pengelolaan kendala memakai pilihan penanggung jawab, histori tindakan dan idempotency key. Admin dapat menyiapkan MFA saat menaikkan anggota menjadi admin; secret tidak masuk audit/log.
- Laporan mencakup keterampilan expired dan pengajuan SOP terlambat. Golden fixture memverifikasi denominator 5, tepat waktu 1 (20%), accepted 2 (1 terlambat), excused 1, cancelled 2 (sebelum/sesudah mulai), unassigned 1.
- Load smoke lokal: 10 tenant × 1.000 staf, 200 request serentak, 80% baca/20% tulis, p95 sekitar 636–639 ms pada PGlite dalam lingkungan pengembangan. CI PostgreSQL menjalankan profil sama dengan assertion p95 ≤800 ms. Ini bukan jaminan kapasitas/latensi VPS atau bukti cold-start Android.
- Scanner protocol diuji untuk unavailable/OK/FOUND. Signature ClamAV aktual dan kapasitasnya tetap perlu diperiksa pada host deployment.
- Worker membedakan `execution_source=worker` pada audit pembangkitan; menggunakan admin tenant aktif sebagai identitas eksekusi jadwal yang sudah disetujui. Antrean gagal/pending tidak menghalangi penemuan tanggal jadwal berikutnya.

### Bukti verifikasi penutup

CI [fbcf310](https://github.com/nanjar/karyanesia/actions/runs/38924738293) lulus 74 integration tests, typecheck, format, build, profil 200 pengguna pada PostgreSQL 16 dan logical restore skema/aset/checksum/immutability. Pemeriksaan tambahan lokal menaikkan suite menjadi 76 tes, meliputi verified → expired dan koreksi praktik, deduplikasi kendala serta histori. Kesiapan kerja menggabungkan onboarding dan kompetensi kritis; jika definisi/tugas belum ada, tampilkan belum cukup data. Status go-live tetap mengikuti gate di atas.

### 6C — Bukti opsional dan verifikasi lanjutan (17 Oktober 2026)

- Migrasi 020 menambah bukti gambar praktik serta lampiran kendala, dengan referensi tenant/tugas, batas lima gambar, penyimpanan privat dan histori immutable. Staf hanya mendapat akses bukti praktik setelah disertakan pada observasi yang disahkan. Bukti tidak menggantikan penilaian rubrik.
- UI menyediakan unggah/tampilan bukti praktik dan kendala; detail kendala menyajikan lampiran dan histori. Retry lampiran tidak menggandakan referensi. Kunci idempotensi observasi tanpa bukti tetap kompatibel dengan histori sebelum fitur bukti.
- Kesiapan kerja menggabungkan onboarding dan kompetensi kritis. Tanpa definisi/tugas, hasilnya belum cukup data, bukan siap kerja otomatis. Audit dan definisi kompetensi mendapat cursor pagination; jadwal dihentikan ditandai pada daftar.
- Konfigurasi trust proxy eksplisit (default tidak percaya forwarding header); reset identitas bersama beberapa tenant ditolak agar admin satu perusahaan tidak membatalkan kredensial perusahaan lain.
- Validasi lokal: 79 integration tests, typecheck, format dan production build lulus. Load smoke PGlite terakhir: p95 573 ms, 10 tenant × 1.000 staf, 200 request serentak (80% baca / 20% tulis). Hasil ini hanya lingkungan pengembangan. CI berikutnya memverifikasi PostgreSQL 16 dan restore ulang.
- Gate go-live eksternal tetap terbuka: persetujuan konten/kebijakan tenant, UAT pengguna, audit browser/aksesibilitas, konfigurasi server/TLS/monitoring serta backup offsite dan latihan restore pada host tujuan. Lihat RELEASE-CHECKLIST-v0.0.1.md; jangan menyamakan kelulusan CI dengan 100% penerimaan produksi.

### 6D — Kesiapan startup Docker (17 Oktober 2026)

- Port host web/API/PostgreSQL dapat diatur lewat WEB_PORT/API_PORT/POSTGRES_PORT; binding tetap loopback dan port internal tidak berubah.
- Service migrate satu kali menjadi prasyarat API/worker/bootstrap; web menunggu API sehat. Migration checksum dan advisory lock tetap berlaku.
- Health check API memeriksa endpoint/database; worker memeriksa heartbeat persisten; web memeriksa HTTP frontend. Runtime files dimiliki pengguna node agar container tidak bergantung pada akses tulis root.
- Ditambahkan panduan DEPLOY-UBUNTU.md dan job CI Docker smoke: build dua image, startup dengan migrasi, health API/web/worker, rewrite web→API dan pengulangan migrasi. ClamAV nyata tidak dijalankan pada smoke test ini; signature/kapasitas engine tetap gate deployment.
- Perubahan ini menyiapkan konfigurasi dan bukti CI, bukan menyatakan aplikasi telah di-deploy ke server pengguna.

### 6E — Pengujian browser otomatis (17 Oktober 2026)

- Ditambahkan sembilan skenario Playwright: aktivasi dan navigasi staf/logout, kegagalan jaringan dan login lewat keyboard, serta MFA admin dan dialog cabang. Matriks mencakup Chromium desktop, Chromium 360 px dan emulasi mobile WebKit.
- Pemeriksaan axe WCAG A/AA dijalankan pada login, ringkasan, SOP/kendala, keterampilan, notifikasi dan dialog cabang; pemeriksaan overflow melengkapi audit viewport. Kelulusan baru terbukti setelah job browser pada CI selesai.
- Data sintetis dibuat hanya pada database CI lokal kosong dengan kredensial acak per proyek browser. Laporan/screenshot/trace CI disimpan tujuh hari; berkas kredensial fixture tidak masuk Git maupun upload artifact.
- WebKit emulasi bukan bukti Safari pada perangkat iOS fisik. UAT, pembaca layar, Android/4G dan gate operasional tetap diperlukan. Video tetap hanya tautan YouTube.

- Putaran browser awal mendeteksi fokus awal dialog yang gagal pada Chromium dan WebKit: React autoFocus terjadi sebelum dialog dibuka. Modal kini memindahkan fokus ke kontrol formulir setelah showModal(); tes memeriksa fokus awal, Shift+Tab di dalam dialog, Escape dan pengembalian fokus. Pesan kegagalan jaringan juga diterjemahkan agar pengguna mendapat petunjuk mencoba ulang.
