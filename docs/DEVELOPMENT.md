# Menjalankan Karyanesia

## Prasyarat

Node.js 22.14+ dan npm. PostgreSQL 16 lokal atau Docker Compose. Aplikasi tidak memerlukan layanan AI, Vercel, maupun email eksternal untuk milestone fondasi.

```bash
npm ci
cp .env.example .env
openssl rand -hex 32
```

Isi `.env` dengan kredensial milik Anda. Simpan hasil random sebagai `MFA_ENCRYPTION_KEY`. Isi `POSTGRES_PASSWORD`, lalu samakan password pada `DATABASE_URL`. Jika password mengandung karakter khusus, URL-encode bagian password untuk DATABASE_URL. Jangan commit `.env`.

```bash
docker compose up -d postgres
npm run db:migrate
```

## Membuat tenant dan pemilik pertama

Isi enam variabel `BOOTSTRAP_*` pada `.env`. Gunakan kode perusahaan huruf kecil dan password unik minimal 12 karakter. Jalankan melalui terminal pribadi yang tidak merekam stdout ke CI/log bersama.

```bash
npm run bootstrap
```

CLI menampilkan URI `otpauth://` sekali. Tambahkan secret dari URI ke aplikasi autentikator tepercaya. Login admin memerlukan password dan kode TOTP enam digit. Tidak ada akun demo atau password default. Bootstrap membuat tenant baru dan menolak kode perusahaan duplikat.

Hapus nilai password bootstrap dari `.env` setelah berhasil. Backup `MFA_ENCRYPTION_KEY` secara aman dan terpisah dari database. Kehilangan key membuat secret MFA yang tersimpan tidak dapat dibuka. Recovery MFA/password belum tersedia lewat aplikasi pada milestone ini, sehingga akses admin perlu dijaga sebelum pilot.

## Development

Terminal pertama:

```bash
npm run dev:api
```

Terminal kedua:

```bash
npm run dev:web
```

Buka http://localhost:3000. API pada http://localhost:4000/api/v1 dan OpenAPI pada http://localhost:4000/api/docs. UI meneruskan `/api/*` ke API dengan origin yang sama. Nilai WEB_ORIGIN harus sama persis dengan origin browser (tanpa trailing slash). Jangan mencampur localhost dengan 127.0.0.1 saat login.

Alur pemeriksaan manual:

1. Login admin dengan kode perusahaan, ID karyawan, password, dan TOTP.
2. Tambahkan cabang dan jabatan.
3. Tambahkan staf, salin kode aktivasi yang muncul satu kali ke kanal internal aman.
4. Logout, pilih aktivasi akun, masukkan kode dan password baru.
5. Login staf, pastikan hanya profil sendiri yang tampil dan tombol administrasi tidak tersedia.
6. Login admin dan nonaktifkan staf. Sesi staf lama harus ditolak pada permintaan berikutnya.
7. Kode aktivasi kedaluwarsa bisa diganti melalui tombol “Kode baru” pada staf yang belum aktif.

POST/PATCH dari klien API harus menyertakan `Origin` yang sama dengan WEB_ORIGIN. Tidak ada endpoint mutasi tenant_id dari browser. Seluruh tenant context berasal dari sesi server.

## Pemeriksaan

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm test` memakai mesin PostgreSQL tertanam PGlite untuk integrasi HTTP, bukan mock query. Untuk PostgreSQL 16 sungguhan, gunakan database tes terpisah:

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/karyanesia_test npm test
```

Tes membuat schema acak dan menghapus schema tersebut setelah selesai. Jangan menggunakan akun runtime produksi atau database produksi untuk pengujian. CI menjalankan opsi PostgreSQL 16 tersebut. Tes mencakup isolasi tenant, scope, MFA/replay, CSRF Origin, aktivasi dan rollback transaksi.

## Docker Compose

Setelah `.env` lengkap:

```bash
docker compose build
docker compose up -d postgres
docker compose run --rm api node apps/api/dist/migrate.js
```

Bootstrap melalui container membaca variabel `BOOTSTRAP_*` dari `.env` melalui service setup khusus. Service API reguler tidak menerima password bootstrap.

```bash
docker compose --profile setup run --rm bootstrap
```

```bash
docker compose up -d api web
```

Port host terikat ke loopback. Buka http://localhost:3000 untuk development. API_INTERNAL_URL pada build web menunjuk service `api`, sementara browser menggunakan origin web. Mengubah target rewrite membutuhkan build web baru.

## Sebelum produksi

- Selesaikan gate rilis dalam PRD. Milestone ini belum rilis produksi.
- Pasang reverse proxy TLS di depan web, set NODE_ENV=production dan WEB_ORIGIN=https://domain-anda, lalu build/deploy ulang.
- Jangan membuka port database/API langsung ke internet. Jangan mempercayai `X-Forwarded-For` dari sembarang klien. API saat ini tidak mengaktifkan Express trust proxy, sehingga limit IP di belakang proxy bersifat konservatif (IP proxy), sementara limit akun tetap terpisah.
- Pisahkan pemilik migrasi dari role database runtime. Pemilik tabel bisa melewati kebijakan database, sehingga jangan gunakan kredensial migrasi pada aplikasi produksi.
- Role runtime membutuhkan SELECT/INSERT/UPDATE pada tabel domain, SELECT/INSERT/DELETE pada sessions, SELECT/INSERT/UPDATE pada rate_limits, dan SELECT/INSERT pada audit_events. Jangan berikan DDL, kepemilikan tabel, atau UPDATE/DELETE audit.
- Selesaikan reset akun, recovery MFA, cleanup record kedaluwarsa, backup terpisah, uji restore serta observabilitas sebelum pilot.
- OpenAPI membantu pengembangan. Batasi akses `/api/docs` pada reverse proxy untuk deployment perusahaan.

## Referensi teknis

- Next.js rewrites: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
- NestJS guards: https://docs.nestjs.com/guards
- MFA: TOTP RFC 6238, dengan SHA-1 enam digit dan interval 30 detik. Test vector berasal dari secret RFC.

## Dependency override

Override `js-yaml` milik `@nestjs/swagger` menggunakan versi 5.5.0 untuk menghindari rentang advisory GHSA-r3ph-w7gj-g6xm. Pertahankan lockfile dan jalankan audit setelah pembaruan dependency.

## Impor staf CSV

Jalankan migrasi terbaru sebelum menyalakan API:

```bash
npm run db:migrate
```

Sebagai OWNER/ADMIN, buka **Impor staf CSV**. Unduh template, ganti kode cabang/jabatan dengan kode milik perusahaan, lalu unggah CSV UTF-8 dengan delimiter koma. Batas satu batch adalah 5.000 record dan 1 MiB. Sel di atas 16 KiB atau format kutip rusak membuat file ditolak.

```csv
employee_number,full_name,branch_code,job_code,supervisor_employee_number,email,start_date
EMP001,"Rina, Ayu",JKT01,KASIR,SPV001,rina@example.test,2026-10-01
EMP002,Budi,JKT01,KASIR,,,
```

Kolom pertama hingga `job_code` wajib. Supervisor harus merupakan akun OWNER/ADMIN/SUPERVISOR yang sudah aktif dalam perusahaan yang sama. Referensi supervisor baru dalam batch yang sama belum didukung. `email` dan tanggal mulai opsional. Tanggal menggunakan YYYY-MM-DD. Kolom tidak dikenal, termasuk role, password dan tenant_id, ditolak.

Pratinjau tidak membuat akun. Semua kemunculan ID yang berulang dalam file dianggap bermasalah. ID yang sudah ada, termasuk staf nonaktif, tidak diubah. Centang konfirmasi untuk menerapkan kandidat valid. Referensi dan duplikasi divalidasi ulang di server saat penyimpanan, sehingga hasil final dapat memiliki lebih sedikit staf berhasil daripada pratinjau.

Gunakan **Muat status** atau **Batch terbaru perusahaan** saat koneksi terputus. Mengulang konfirmasi pada ID batch yang sama mengembalikan hasil sebelumnya. Mengunggah ulang file akan membuat pratinjau baru, yang menandai ID yang sudah dibuat sebagai duplikat.

Laporan kesalahan berisi record gagal dan alasan. Nomor baris adalah posisi akhir record dalam file (record dengan sel multiline dapat mencakup beberapa baris fisik). CSV laporan menyertakan kolom diagnostik `row_number` dan `errors`, serta dapat menambahkan apostrof di depan nilai berisiko menjadi formula spreadsheet. Laporan ditujukan untuk pemeriksaan: salin nilai yang sudah diperbaiki ke template baru, hapus kolom diagnostik, lalu unggah lagi. Jangan menghapus apostrof perlindungan hanya untuk membuka laporan di spreadsheet.

Impor membuat akun STAFF dengan password kosong dan tidak mengirim email atau token aktivasi massal. Gunakan **Kode baru** pada direktori staf untuk menerbitkan kode aktivasi satu kali, lalu bagikan melalui kanal internal aman. Kode berlaku 24 jam sejak diterbitkan.

API:

- `POST /api/v1/staff-imports/preview` dengan `{ "csv": "..." }`.
- `GET /api/v1/staff-imports` untuk sepuluh batch terbaru perusahaan.
- `GET /api/v1/staff-imports/{id}` untuk detail pratinjau/hasil.
- `POST /api/v1/staff-imports/{id}/commit` dengan `{ "confirm": true }`.
- `GET /api/v1/staff-imports/{id}/errors.csv` untuk laporan yang diaudit.

Pratinjau kedaluwarsa setelah 24 jam dan tidak bisa dikonfirmasi. Hasil batch yang sudah committed tetap bisa dibaca/diulang tanpa membuat akun baru. Kedaluwarsa belum berarti penghapusan fisik data: tentukan retensi dan jalankan cleanup metadata sesuai kebijakan perusahaan sebelum produksi. Jangan menyimpan laporan kesalahan di tempat publik.

### Mengelola materi dan kuis

Buka **Materi & kuis** sebagai OWNER/ADMIN. Isi judul, tujuan, transkrip dan tautan YouTube opsional. Tambahkan 1–5 soal dengan 2–5 opsi dan tentukan jawaban benar. **Simpan draft versi baru** menyimpan materi sebelum publikasi. Tinjau draft pada pustaka, lalu pilih **Terbitkan versi ini**.

Untuk memperbaiki materi, pilih versi pada pustaka lalu **Revisi ke versi baru**. Konfirmasi penggantian editor, ubah isi pada editor di bawah dan simpan. Versi sebelumnya beserta percobaan staf tidak berubah. Revisi perlu diterbitkan tersendiri. **Arsipkan versi** menghentikan akses pustaka staf dan submit baru tanpa menghapus histori. Arsip tidak membatalkan hasil yang sudah tersimpan.

Materi yang belum tersimpan hilang jika halaman ditutup. Kegagalan simpan mempertahankan input selama halaman tetap terbuka. Gambar pada soal belum tersedia; hasil kuis hanya menunjukkan kelulusan teori, sedangkan praktik disahkan melalui tugas onboarding.

### Mendampingi staf yang gagal kuis

Buka materi terbit sebagai SUPERVISOR, OWNER atau ADMIN. Bagian **Pendampingan staf** menampilkan staf yang gagal tiga kali dan belum lulus. Supervisor hanya melihat cabang dalam scope-nya. Isi **Alasan dan arahan latihan** minimal 10 karakter, lalu pilih **Buka tiga percobaan baru** dan konfirmasi. Gunakan **Perbarui daftar** untuk memuat ulang antrean.

Staf membuka kembali materi dari pustaka untuk memuat jatah terbaru. Rangkaian baru menyediakan tiga percobaan; semua hasil lama dan alasan reset tetap tampil di riwayat. Reset tidak meluluskan teori atau praktik secara otomatis. Video tetap menggunakan tautan YouTube saja.

### Menyusun jalur onboarding

Sebagai OWNER/ADMIN, buka **Jalur onboarding**. Siapkan dan terbitkan modul di **Materi & kuis** terlebih dahulu. Isi judul/deskripsi jalur lalu pilih versi modul untuk langkah pertama. Tambahkan langkah sesuai urutan belajar, isi tenggat H+ dalam hari kalender (H+0 = hari mulai), dan pilih prasyarat dari langkah sebelumnya bila diperlukan. Semua langkah tetap memerlukan observasi praktik.

Simpan draft lalu tinjau detail sebelum **Terbitkan jalur**. Publikasi akan ditolak jika salah satu modul sudah diarsipkan; buat revisi dan pilih penggantinya. **Revisi ke versi baru** menyalin isi ke editor dan penyimpanan menghasilkan draft baru. **Arsipkan jalur** menyimpan versi lama beserta referensinya. Perubahan editor yang belum disimpan belum dipersistenkan dan hilang jika halaman ditutup.

Penugasan staf dan tenggat aktual tersedia pada menu Tugas onboarding. Observasi praktik dan status penyelesaian tersedia pada tugas; akses materi/kuis mengikuti tanggal mulai dan rantai prasyarat. Video setiap modul tetap berupa tautan YouTube saja.

### Menugaskan onboarding

Buka **Tugas onboarding** sebagai OWNER/ADMIN. Pilih versi jalur terbit, tanggal mulai dan jenis target (staf, cabang atau jabatan), lalu pilih target dan **Buat pratinjau**. Periksa seluruh nama staf, cabang, zona waktu dan tanggal mulai. **Konfirmasi** menggunakan data pratinjau yang ditampilkan, bukan perubahan form setelahnya. Untuk mengubah target/tanggal, buat pratinjau baru.

Saat koneksi gagal pada konfirmasi, ulangi pratinjau yang sama. Server mengembalikan hasil batch lama tanpa menggandakan tugas. Hindari membuat batch baru hanya karena respons lambat: batch baru boleh menugaskan staf yang sama lagi. Pratinjau berlaku 24 jam; perubahan cabang, jabatan, status aktif atau zona waktu setelah preview dapat meminta pratinjau baru.

Staf membuka **Tugas onboarding** untuk melihat versi jalur, langkah dan tenggat. H+0 berlangsung sampai akhir tanggal mulai di zona waktu cabang. Label tenggat menggunakan waktu cabang. Lewat tenggat tidak menutup tugas. Admin dapat membatalkan tugas dengan alasan; histori tetap tersedia. Progres teori dan praktik dihitung otomatis; completed hanya jika seluruh teori dan praktik kompeten.

### Membaca progres teori pada tugas

Di **Tugas onboarding**, status berubah dari **Ditugaskan** ke **Sedang belajar** setelah ada percobaan pada versi modul yang diminta. Jika seluruh teori lulus, status menjadi **Menunggu penilaian praktik**. Hasil kuis pada versi yang persis sama digunakan kembali, termasuk sebelum tugas dibuat; versi revisi perlu kelulusan tersendiri. Nilai gagal berikutnya tidak menghapus kelulusan yang sudah terbukti pada versi tersebut.

Staf dapat memilih **Buka materi & kuis** dari tugasnya sendiri. Hasil submit memperbarui progres tugas; tombol **Perbarui tugas** memuat perubahan dari sesi/perangkat lain. Jatah tiga percobaan dan reset supervisor tetap berlaku per staf/versi modul, dibagi dengan pustaka belajar, bukan jatah baru pada setiap assignment. Versi yang diarsipkan tidak dapat dibuka; hubungi admin untuk pengganti, sementara bukti lama tetap terlihat.

Prasyarat membatasi akses materi/kuis; teori dan praktik seluruh rantainya juga diperiksa saat pengajuan dan pengesahan observasi. Angka teori lulus tidak boleh dibaca sebagai penyelesaian onboarding. Tugas cancelled tetap dibatalkan dan histori teorinya tidak mencakup kuis sesudah waktu pembatalan. Bukti teori belum memiliki masa kedaluwarsa otomatis; gunakan versi baru jika konten berubah atau perlu diuji ulang.

### Menyiapkan rubrik praktik

Sebagai OWNER/ADMIN, buka **Rubrik praktik**, isi judul dan petunjuk observasi, lalu susun 1–20 kriteria yang dapat diamati. Minimal satu item harus wajib. Menandai **Kritis** otomatis menandai **Wajib**; mematikan Wajib juga mematikan Kritis. Simpan draft, tinjau detail lalu **Terbitkan rubrik**.

Pada **Jalur onboarding**, pilih versi rubrik terbit di setiap langkah sebelum menyimpan editor. Untuk jalur lama, pilih **Revisi ke versi baru**, lengkapi rubrik lalu terbitkan ulang. Rubrik tersalin ke snapshot jalur dan selanjutnya ke tugas staf. Perubahan rubrik harus melalui revisi versi baru; tugas lama mempertahankan kriteria asli. Arsip rubrik menghentikan pemakaiannya untuk penugasan baru tanpa menghapus snapshot tugas lama.

Tugas yang dibuat sebelum ada rubrik tetap tersimpan dan diberi pesan belum memiliki kriteria praktik. Buat versi jalur dengan rubrik dan penugasan baru, lalu batalkan tugas lama dengan alasan jika sesuai kebijakan operasional. Tidak ada perubahan snapshot atau migrasi hasil kompetensi otomatis. Form observasi dan pengesahan tersedia di Tugas onboarding bagi penilai yang memenuhi scope.

### Mengisi dan mengesahkan observasi praktik

Sebagai SUPERVISOR (scope cabang) atau OWNER/ADMIN (seluruh tenant), buka **Tugas onboarding**, pilih staf dan langkah dengan rubrik. Setelah tanggal mulai tiba, teori langkah tersebut harus lulus dan praktik prasyarat harus kompeten. Penilai tidak boleh menilai dirinya sendiri.

Pilih **Isi observasi praktik**, jawab seluruh item sesuai pengamatan, isi komentar minimal 10 karakter dan arahan latihan bila ada item wajib/kritis gagal. **Sahkan observasi** menyimpan record permanen; server menentukan competent atau needs_practice. Item opsional yang gagal tidak menghalangi kompeten. Tidak ada status hasil yang dapat diisi klien.

Untuk penilaian ulang atau koreksi, gunakan hasil terbaru sebagai dasar dan isi alasan minimal 10 karakter. Penilaian baru menunjuk hasil sebelumnya tanpa mengubah histori. Jika penilai lain menyimpan lebih dahulu, muat ulang tugas dan tinjau hasil terakhir sebelum menilai kembali. Pengiriman ulang dengan key yang sama mengembalikan hasil yang sama. Sesudah konfirmasi berhasil, hindari mengisi ulang hanya karena tampilan lambat; gunakan Perbarui tugas dan Muat riwayat observasi.

**Muat riwayat observasi** tersedia bagi staf pemilik tugas dan pengelola dalam scope; tampil maksimal 100 record terbaru. Seluruh teori dan praktik kompeten menghasilkan **Selesai**. Koreksi menjadi needs_practice dapat membuka tugas kembali dan memunculkan lewat tenggat. Arsip rubrik tidak mengubah kriteria tugas lama, sehingga snapshot tersebut tetap dapat dinilai. Tugas tanpa rubrik belum dapat dinilai dan tugas cancelled menolak penilaian baru.

Pengajuan praktik/review staf tersedia sesuai panduan di bawah. Bukti foto/file dan notifikasi belum tersedia; akses kuis sudah mengikuti prasyarat. Pengesahan ini merupakan satu langkah simpan hasil yang sudah final; belum ada draft observasi terpisah.

### Mengajukan praktik dan peninjauan hasil

Sebagai pemilik tugas, buka **Tugas onboarding**, pilih langkah yang memiliki rubrik dan teori lulus, lalu **Ajukan praktik / peninjauan hasil**. Tanggal mulai harus sudah tiba dan praktik prasyarat harus kompeten. Pilih **Siap observasi / praktik ulang** untuk observasi awal atau setelah latihan, atau **Minta peninjauan hasil terakhir** jika sudah ada observasi. Sertakan alasan/kesiapan minimal 10 karakter. Praktik yang sudah kompeten hanya menerima jenis peninjauan, bukan pengajuan praktik awal lagi.

Pengajuan menyimpan referensi hasil terakhir. Jika penilai mengubah hasil saat form terbuka, server meminta muat ulang agar pengajuan tidak merujuk hasil usang. Satu langkah hanya boleh memiliki satu pengajuan pending. Pengiriman ulang dengan key yang sama mengambil hasil pengajuan semula; isi berbeda ditolak. Pengajuan belum dapat diedit atau ditarik kembali. Gunakan **Muat riwayat pengajuan** untuk melihat sampai 100 record terbaru.

Sebagai SUPERVISOR atau OWNER/ADMIN, aktifkan **Hanya pengajuan menunggu**. Antrean mengambil maksimal 100 tugas tertua yang memiliki pengajuan pending dalam scope saat ini, termasuk tugas completed yang meminta review. Pengesahan observasi baru pada langkah yang sama otomatis ditautkan ke pengajuan yang menunggu. Replay observasi lama tidak akan menjawab pengajuan baru. Observasi tetap boleh dilakukan tanpa pengajuan staf bila proses operasional memerlukannya.

Review pending tidak membatalkan kompetensi atau membuka kembali tugas completed dengan sendirinya. Hanya observasi koreksi yang dapat mengubah hasil praktik dan progres. Pembatalan tugas menghentikan pengajuan pending tanpa menghapus histori; pengajuan yang sudah dijawab tetap menyimpan ID observasi jawabannya. Belum ada notifikasi otomatis, SLA, komentar bolak-balik atau penugasan review ke penilai lain secara otomatis.

### Akses belajar bertahap

Dari **Tugas onboarding**, tombol materi hanya tersedia sesudah tanggal mulai lokal dan seluruh rantai prasyarat lulus teori serta kompeten praktik. Server memeriksa konteks assignment saat membuka materi dan mengirim kuis; mengubah URL atau menghilangkan assignment_id tidak membuka materi jika tidak ada jalur aktif lain yang mengizinkannya. Lewat tenggat tidak menutup akses. Koreksi praktik ancestor menjadi needs_practice dapat mengunci kembali langkah turunan, tanpa menghapus bukti teori yang sudah ada.

Pustaka tetap menyediakan materi terbit yang belum ditugaskan. Bila versi yang sama muncul pada beberapa tugas aktif, pustaka membuka versi tersebut jika setidaknya satu tugas sudah mengizinkan akses. Membuka dari tugas tertentu tetap memeriksa tugas tersebut, walaupun pustaka bisa diakses melalui tugas lain. Membatalkan seluruh tugas yang membatasi versi mengembalikannya sebagai materi bebas di pustaka; tugas cancelled sendiri tidak dapat digunakan sebagai konteks belajar.

API detail materi menerima query opsional `assignment_id`; body submit kuis menerima field opsional yang sama. Staf hanya dapat memakai konteks tugas sendiri dan versi yang ada pada snapshot tugas itu. Idempotency key tidak dapat dipindahkan antara konteks. Replay hasil yang sudah disimpan tetap tersedia untuk histori walaupun akses baru terkunci, dan tidak membuat percobaan baru. Admin dapat meninjau isi/kunci materi melalui pustaka pengelolaan, sedangkan submit kuis tetap memeriksa akses peserta.

Jatah percobaan/reset dan pemakaian bukti teori tetap per staf/versi modul, dibagi antar tugas. Penugasan baru tidak menghapus atau mengulang nilai yang sudah lulus pada versi yang sama. Pembatasan ini berlaku pada endpoint Karyanesia; video tetap menggunakan tautan YouTube dan mengikuti akses pemilik videonya.

### Menyiapkan template SOP

Sebagai OWNER/ADMIN, buka **Template SOP**. Pilih cabang/jabatan sasaran, isi judul, petunjuk, label shift, waktu mulai dan tenggat lokal. Untuk shift lintas tengah malam, aktifkan **Tenggat pada hari berikutnya**; jendela awal dibatasi lebih dari nol sampai 24 jam. Waktu ini merupakan konfigurasi template; belum menghasilkan jadwal atau instance harian.

Susun 1–30 item ya/tidak, angka atau teks. Untuk ya/tidak, tentukan jawaban yang sesuai SOP. Untuk angka, isi satuan dan minimal satu batas; rentang min/max bersifat inklusif saat pelaksanaan mendatang, dengan nilai konfigurasi -1 miliar sampai 1 miliar. Teks memiliki batas 1–4.000 karakter. Minimal satu item wajib; item kritis selalu wajib dan memerlukan review manusia sehingga mode otomatis tidak diizinkan. Menandai item kritis pada editor menonaktifkan mode otomatis.

Penanda kewajiban kendala tersedia untuk ketidaksesuaian ya/tidak atau angka sebagai konfigurasi; modul kendala belum berjalan. Item teks belum mendukung aturan otomatis tersebut. Foto belum dapat dipilih sebagai tipe item. Jangan menganggap penanda ini sebagai laporan kendala yang sudah dibuat.

Simpan draft lalu tinjau detail sebelum **Terbitkan template**. Revisi selalu menghasilkan draft versi baru dengan referensi cabang/jabatan dan nomor item yang ditentukan server. Arsip menjaga versi lama, bukan menghapusnya. Daftar menampilkan maksimal 100 versi template terbaru, sedangkan pemilih cabang/jabatan mengambil hingga 500 data yang tersedia.

Tahap ini belum membuat jadwal, penerima eksplisit, instance harian, draft jawaban, submit/review atau penerimaan otomatis. Template dan konfigurasi target saja tidak boleh dilaporkan sebagai kepatuhan SOP staf.
