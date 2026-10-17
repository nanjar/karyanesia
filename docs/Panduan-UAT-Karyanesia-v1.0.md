# Panduan Pengujian Karyanesia

Studi kasus onboarding kru toko dan operasional harian

Untuk tim testing. Jalankan alur dari pemeriksaan lingkungan, login, pelatihan dan praktik, hingga SOP serta penanganan kendala. Isi hasil aktual dan bukti pada setiap kasus. Dokumen ini merupakan rencana pengujian; seluruh hasil masih belum diuji.

| Identitas pengujian | Isian |
| --- | --- |
| Versi dokumen | 1.0 • 17 Oktober 2026 |
| URL lingkungan | ________________________________ |
| Commit yang diuji | ________________________________ |
| Tanggal dan penguji | ________________________________ |
| Browser dan perangkat | ________________________________ |

## Skenario bisnis

Perusahaan fiktif Karyanesia Retail Demo memiliki Toko Demo Jakarta dan Toko Demo Bandung. Kru baru mengikuti Orientasi Kru Toko, mengajukan penilaian praktik, menjalankan pemeriksaan pembukaan toko, lalu melaporkan kendala untuk ditindaklanjuti supervisor.

Gunakan seed retail yang tersedia. Skenario kuliner yang dibahas sebelumnya disesuaikan menjadi retail agar nama akun dan materi sama dengan data bawaan aplikasi.

## Syarat mulai

API, web, dan database harus berfungsi; migrasi berhasil; akun demo bisa login. API sebelumnya dilaporkan terus restart dengan pesan startup failed. Penyelesaiannya belum dikonfirmasi. Jika masih terjadi, tandai UAT terblokir dan hentikan kasus yang memerlukan API.

Pembaruan label frontend sudah diperiksa pada main, tetapi tidak membuktikan seluruh alur bisnis lulus. Catat commit deployment yang benar sebelum mulai.

## Persiapan lingkungan dan akun

Penanggung jawab deployment mengaktifkan DEMO=true dan NODE_ENV=development dengan DEMO_PASSWORD privat sepanjang 12–128 karakter. Gunakan database demo terpisah dari data operasional nyata. Jangan tulis password atau secret MFA dalam laporan.

| Nomor karyawan | Peran | Kegunaan |
| --- | --- | --- |
| DEMO-OWNER | OWNER | Konfigurasi dan pemeriksaan seluruh alur |
| DEMO-ADMIN | ADMIN | Pengelolaan dan penugasan |
| DEMO-HR | HR | Pemeriksaan akses sesuai peran |
| DEMO-OPS | OPERATIONS | Jadwal dan operasional |
| DEMO-SPV | SUPERVISOR | Penilaian praktik dan review |
| DEMO-STAFF-01 | STAFF | Kru Jakarta |
| DEMO-STAFF-02 | STAFF | Kru Bandung |

Kode perusahaan: karyanesia-demo. Password akun mengikuti konfigurasi demo. OWNER dan ADMIN menggunakan MFA; minta administrator menyiapkan pendaftaran secara privat. Keluar akun sebelum berganti peran, atau gunakan profil browser terpisah.

### UAT 01  Lingkungan dapat digunakan

Peran: Penguji dan penanggung jawab deployment

1. Buka URL aplikasi; catat commit serta versi browser.

2. Periksa status layanan dan coba login akun demo.

Hasil yang diharapkan: Halaman terbuka, API tidak restart berulang, migrasi berhasil, dan login menerima respons. Jika gagal, catat Terblokir serta log tanpa rahasia.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 02  Login dan pembatasan MFA

Peran: OWNER lalu STAFF

1. Login DEMO-OWNER memakai password dan kode autentikator yang sah.

2. Keluar; login DEMO-STAFF-01. Periksa identitas serta perannya.

Hasil yang diharapkan: OWNER harus melewati MFA. Staf masuk dengan alur yang berlaku untuk akun staf; identitas dan peran tidak tertukar.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

## Pemeriksaan data dan penugasan

### UAT 03  Data demo dan cabang

Peran: OWNER atau ADMIN

1. Periksa cabang Jakarta dan Bandung serta jabatan Kru Toko Demo.

2. Periksa kedua staf, cabang masing-masing, dan supervisor yang terkait.

Hasil yang diharapkan: Tersedia dua cabang dan tujuh akun demo. Staf 01 berada di Jakarta, staf 02 di Bandung. Supervisor demo memiliki scope kedua cabang.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 04  Materi dan jalur onboarding

Peran: OWNER atau ADMIN

1. Temukan Demo: Orientasi Kru Toko, Demo: Observasi Kru Toko, dan Demo: Onboarding Kru Baru.

2. Periksa status terbit, hubungan modul dengan rubrik, dan penugasan kedua staf.

Hasil yang diharapkan: Materi, rubrik, dan jalur tersedia; tugas onboarding kedua staf sudah dibuat oleh seed. Video hanya contoh pemutar, bukan materi kerja resmi.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 05  Pratinjau dan konfirmasi penugasan baru

Peran: OWNER atau ADMIN

1. Untuk run khusus, pilih jalur terbit dan tanggal mulai hari pengujian. Targetkan satu staf.

2. Klik Buat pratinjau; periksa staf dan cabang, lalu konfirmasi sekali.

Hasil yang diharapkan: Pratinjau sesuai target dan satu penugasan baru tercatat. Gunakan ID tugas baru untuk kasus berikutnya agar hasil tidak tertukar dengan tugas seed.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

Penugasan tambahan bersifat opsional jika tugas seed masih baru. Batch baru memang dapat membuat tugas tambahan untuk staf yang sama. Jangan menganggapnya duplikasi bug. Ulang konfirmasi pada batch yang sama hanya bila perlu menguji pemulihan koneksi.

## Pelatihan dan penilaian praktik

### UAT 06  Mempelajari materi dan mengikuti kuis

Peran: DEMO-STAFF-01

1. Buka Tugas onboarding dan pilih tugas yang dicatat pada run ini.

2. Klik Buka materi & kuis; baca transkrip dan kerjakan kuis.

3. Untuk uji kelulusan, pilih Supervisor berwenang dan Laporkan melalui aplikasi.

Hasil yang diharapkan: Jawaban benar menghasilkan kelulusan teori; seed memiliki nilai lulus 80. Progres dan jumlah percobaan tersimpan setelah halaman dimuat ulang.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 07  Pengajuan praktik

Peran: DEMO-STAFF-01

1. Setelah teori lulus, buka pengajuan praktik pada tugas yang sama.

2. Isi alasan yang sesuai lalu kirim. Muat ulang daftar tugas.

Hasil yang diharapkan: Pengajuan tersimpan dengan status Menunggu penilai. Teori lulus saja belum membuat onboarding selesai karena praktik diwajibkan.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 08  Observasi dan penyelesaian onboarding

Peran: DEMO-SPV lalu DEMO-STAFF-01

1. Buka tugas atau antrean pengajuan menunggu; pilih staf 01.

2. Nilai berdasarkan rubrik Demo: Observasi Kru Toko; isi seluruh isian wajib dan sahkan sebagai kompeten.

3. Login staf kembali dan perbarui tugas.

Hasil yang diharapkan: Observasi dan histori tersimpan; praktik menjadi Kompeten. Saat seluruh teori dan praktik lulus, tugas menjadi Selesai.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

Ulangi alur dengan staf 02 sebagai pemeriksaan cabang Bandung. Gunakan tugas terpisah untuk skenario kuis gagal dan penilaian Perlu latihan supaya hasil positif tetap mudah ditelusuri.

## SOP pembukaan toko

### UAT 09  Menyediakan tugas SOP hari ini

Peran: DEMO-OPS atau ADMIN

1. Pilih template terbit Demo: Pemeriksaan Pembukaan Toko.

2. Jika tugas seed bukan untuk hari ini, buat jadwal baru dengan cabang Jakarta, tanggal hari ini, hari pelaksanaan yang sesuai, dan penerima staf 01.

3. Klik Bangkitkan / periksa tugas untuk tanggal tersebut; catat ID tugas.

Hasil yang diharapkan: Tugas ditugaskan kepada staf 01 pada tanggal yang dipilih. Penerima harus sesuai cabang dan jabatan template. Seed hanya membuat SOP untuk tanggal seed pertama.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 10  Mengisi dan menyimpan draft

Peran: DEMO-STAFF-01

1. Buka SOP harian dan pilih tugas run ini.

2. Isi Area kerja siap digunakan dengan Ya; isi Catatan serah terima dengan Area depan siap, alat kerja sudah diperiksa.

3. Klik Simpan draft lalu muat ulang dan buka tugas yang sama.

Hasil yang diharapkan: Jawaban tersimpan di server dan muncul kembali. Penyimpanan draft tidak dianggap sebagai penerimaan supervisor.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 11  Mengajukan dan menerima checklist

Peran: DEMO-STAFF-01 lalu DEMO-SPV

1. Klik Ajukan checklist dan konfirmasi.

2. Login supervisor, buka tugas tersebut dan periksa jawabannya.

3. Klik Terima serta isi alasan yang diminta.

Hasil yang diharapkan: Status berubah ke Menunggu review lalu Diterima. Histori menyimpan perubahan status; seed memakai auto_accept=false.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

Untuk uji perbaikan, gunakan tugas lain: supervisor memilih Minta perbaikan, staf memperbaiki jawaban dan mengajukan ulang. Jangan gunakan tugas yang sudah diterima sebagai awal skenario ini.

## Pelaporan kendala dan tindak lanjut

### UAT 12  Melaporkan kendala pada item SOP

Peran: DEMO-STAFF-01

1. Pada tugas yang masih dapat digunakan untuk skenario, klik Laporkan kendala item.

2. Periksa judul Uraikan kendala; batas karakter hanya menjadi petunjuk di bawah textarea.

3. Isi Printer kasir tidak menyala saat persiapan pembukaan toko. Kirim laporan.

Hasil yang diharapkan: Laporan tercatat dan terkait item SOP. Judul tidak mengulang minimal 10 karakter. Petunjuk minimal 10 dan maksimal 2.000 karakter tetap tersedia.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 13  Menetapkan penanggung jawab

Peran: DEMO-SPV atau DEMO-OPS

1. Buka Kendala dan tindak lanjut; temukan laporan tadi.

2. Isi catatan minimal 10 karakter, pilih anggota aktif cabang Jakarta dan tenggat WIB.

3. Pilih Ditugaskan; catat penanggung jawab serta tenggat.

Hasil yang diharapkan: Status Ditugaskan, penanggung jawab dan tenggat tersimpan. Anggota yang ditawarkan sesuai cabang laporan.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

### UAT 14  Menangani dan menutup laporan

Peran: Penanggung jawab lalu supervisor

1. Penanggung jawab mengubah ke Dikerjakan, kemudian Ditangani; isi catatan yang sesuai pada tiap langkah.

2. Supervisor memeriksa hasil, mengisi catatan dan memilih Ditutup.

3. Klik Lihat histori tindakan.

Hasil yang diharapkan: Urutan Terbuka → Ditugaskan → Dikerjakan → Ditangani → Ditutup tercatat. Laporan tertutup tetap memiliki histori.

Hasil aktual / bukti / bug: __________________________________________

Status: Belum diuji / Lulus / Gagal / Terblokir    Penguji: ______________

## Pengujian negatif dan regresi

Jalankan setelah alur utama dengan tugas terpisah. Hasil di bawah adalah kriteria yang harus dibuktikan oleh tim, bukan klaim bahwa pengujian telah lulus.

| ID | Langkah uji | Hasil yang diharapkan |
| --- | --- | --- |
| N01 | Kirim kendala kosong lalu 9 karakter; coba lagi dengan 10 karakter. | Kosong dan 9 karakter ditolak. Tepat 10 karakter lolos batas minimum bila isian lain sah. |
| N02 | Masuk sebagai staf 02; coba membuka atau mengubah tugas SOP milik staf 01 melalui URL/API yang dicatat penguji. | Server menolak akses atau perubahan di luar hak staf. Tidak cukup hanya menyembunyikan tombol. |
| N03 | Staf mencoba menerima checklist atau menilai praktik sendiri. | Tindakan yang tidak berwenang ditolak; progres dan histori tidak berubah. |
| N04 | Pada tugas baru, coba praktik sebelum teori lulus; coba kuis dengan jawaban salah. | Praktik belum dapat disahkan. Nilai gagal tidak dianggap lulus teori atau selesai onboarding. |
| N05 | Supervisor memilih Minta perbaikan pada checklist terpisah; staf memperbaiki dan mengajukan ulang. | Alasan dan revisi tersimpan; supervisor dapat memeriksa pengajuan berikutnya. |
| N06 | Buka kembali laporan yang Ditangani atau Ditutup melalui aksi yang tersedia. | Status Dibuka kembali dan catatan tersimpan dalam histori. |
| N07 | Pada lingkungan uji, ulang pembangkitan jadwal dan tanggal SOP yang sama. | Tidak terbentuk tugas ganda untuk jadwal, tanggal, dan penerima yang sama. |
| N08 | Penanggung jawab deployment me-restart API dengan konfigurasi demo yang sama. | Akun dan konten demo tidak bertambah; progres serta password tidak direset. |
| N09 | Uji label dialog, fokus keyboard, tombol Batal, serta lebar ponsel dan desktop. | Teks tidak bertumpuk; dialog bisa digunakan; Batal tidak membuat laporan. |
| N10 | Jika pemilih bahasa tersedia, ulang login dan pelaporan dalam Indonesia dan English. | Label, validasi dan status konsisten. Teks yang belum diterjemahkan dicatat sebagai temuan. |

DEMO=false melewati seed dan tidak menghapus data yang sudah dibuat. Uji ini hanya dilakukan penanggung jawab deployment pada lingkungan uji; jangan menghapus volume untuk mengulang UAT.

## Rekap hasil dan pelaporan bug

Tabel berikut merangkum per kelompok. Catat hasil setiap UAT pada lembar kasusnya; untuk N01–N10, lampirkan log terpisah per ID beserta status, bukti, dan penguji.

| ID kasus | Status | Bukti atau ID bug | Penguji |
| --- | --- | --- | --- |
| UAT 01–02 | Belum diuji | ________________ | ________ |
| UAT 03–05 | Belum diuji | ________________ | ________ |
| UAT 06–08 | Belum diuji | ________________ | ________ |
| UAT 09–11 | Belum diuji | ________________ | ________ |
| UAT 12–14 | Belum diuji | ________________ | ________ |
| N01–N05 | Belum diuji | ________________ | ________ |
| N06–N10 | Belum diuji | ________________ | ________ |

### Format laporan bug

ID dan judul: _________________________________________________

Commit / URL / browser / peran: __________________________________

Prasyarat dan ID objek uji: _______________________________________

Langkah reproduksi: ____________________________________________

Hasil yang diharapkan: __________________________________________

Hasil aktual dan bukti: __________________________________________

Severity / penanggung jawab / status retest: ________________________

Severity: Kritis untuk akses tanpa hak atau kehilangan data; Tinggi untuk alur utama terhenti; Sedang untuk fungsi sebagian terganggu; Rendah untuk masalah tampilan atau teks tanpa hambatan fungsi.

### Kriteria selesai dan keputusan

Usulan penerimaan: seluruh UAT 01–14 dan pemeriksaan akses N02–N04 lulus, tidak ada bug Kritis atau Tinggi terbuka, serta temuan lain memiliki keputusan tindak lanjut. Kasus Terblokir tidak boleh dihitung sebagai Lulus. Jika penugasan baru UAT 05 dilewati, tulis alasannya dan verifikasi penugasan seed pada UAT 04.

Rekap: Lulus ____  Gagal ____  Terblokir ____  Belum diuji ____

Keputusan: Diterima / Diterima dengan catatan / Perlu perbaikan

QA lead __________________  Pemilik produk __________________

### Dasar penyusunan

Repo nanjar/karyanesia pada main yang dibaca 17 Oktober 2026: apps/api/src/demo-seed.ts; apps/web/components/onboarding-assignments-panel.tsx; operations-panel.tsx; issue-card.tsx. Catat commit deployment pada halaman awal karena main dapat berubah. Nama menu dapat berbeda menurut peran dan versi.

