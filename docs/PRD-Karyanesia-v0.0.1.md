# Karyanesia — Product Requirements Document
## Versi 0.0.1

Tanggal: 16 Oktober 2026  
Pemilik produk: Nanjar Budiman  
Status: Draft baseline untuk review produk dan implementasi MVP  
Tagline: **Siap Kerja. Terampil Berkarya.**

## 1. Ringkasan produk
Karyanesia adalah platform B2B SaaS untuk orientasi kerja, pelatihan mikro berbasis video, pelaksanaan SOP harian, dan pengembangan kompetensi tenaga kerja operasional. Produk membantu perusahaan dengan banyak cabang dan pekerja menyiapkan karyawan baru, menjaga konsistensi pelaksanaan tugas, dan mengenali kebutuhan pendampingan.

Target jangka panjang meliputi ritel, perhotelan, dan manufaktur ringan. MVP menggunakan ritel sebagai industri pilot, dengan jabatan kasir, pramuniaga, dan kepala shift. Struktur data tetap generik agar dapat digunakan industri lain tanpa membuat mesin proses terpisah.

Positioning: “Percepat kesiapan karyawan. Jaga standar di setiap lokasi.”

Dokumen ini menetapkan persyaratan produk dan usulan implementasi. Angka target, kapasitas, jadwal, dan model komersial di dalamnya merupakan asumsi perencanaan yang harus divalidasi, bukan hasil penggunaan nyata. Tidak ada klaim ukuran pasar, kesesuaian hukum, atau ketersediaan merek/domain yang telah diverifikasi.

## 2. Masalah dan peluang
1. Pelatihan pekerja baru bergantung pada penjelasan berulang supervisor dan bervariasi antar cabang.
2. Materi panjang sulit dipakai di sela pekerjaan operasional.
3. Checklist kertas atau chat menyulitkan pemantauan keterlambatan dan tindak lanjut.
4. Kelulusan teori belum menunjukkan kemampuan praktik.
5. Riwayat keterampilan tidak tersusun sehingga promosi dan penugasan bergantung pada ingatan atasan.

Hipotesis dampak: biaya dan waktu persiapan pekerja baru yang lebih rendah dapat mempermudah perusahaan merekrut pekerja tanpa pengalaman. Peningkatan jumlah pekerjaan harus diukur terpisah dan tidak otomatis dianggap sebagai akibat penggunaan aplikasi.

## 3. Tujuan, indikator, dan batasan
| Tujuan | Definisi pengukuran | Target pilot awal |
|---|---|---|
| Mempercepat kesiapan kerja | Median hari sejak onboarding ditugaskan sampai praktik wajib disetujui | Turun 20% terhadap baseline jabatan yang sama |
| Mengurangi pendampingan berulang | Jam supervisor untuk onboarding per pekerja baru | Turun 15% |
| Menyelesaikan onboarding | Pekerja menyelesaikan seluruh persyaratan sebelum tenggat / seluruh pekerja yang jatuh tempo | ≥85% |
| Menjalankan SOP | Instance wajib selesai dan diajukan sebelum tenggat / seluruh instance wajib yang jatuh tempo | ≥90% |
| Menjaga kualitas | Kesalahan operasional per 100 transaksi atau unit kerja | Tidak memburuk terhadap baseline |
| Mendorong penggunaan | Pekerja dengan aktivitas bermakna mingguan / pekerja aktif yang mendapat tugas minggu itu | ≥75% |

Baseline dikumpulkan sebelum pilot. Laporan menyertakan ukuran sampel, periode, cabang, jabatan, dan perubahan proses lain. Target merupakan usulan evaluasi. Jangan menyimpulkan sebab-akibat hanya dari perbandingan sebelum/sesudah.

Non-goal v0.0.1: payroll, absensi biometrik, marketplace tenaga kerja, rekrutmen/ATS, penjadwalan tenaga kerja otomatis, sistem HRIS lengkap, keputusan promosi otomatis, sertifikasi profesi resmi, dan pembuktian kepatuhan regulator.

## 4. Prinsip produk
- Ponsel menjadi perangkat utama staf; dashboard desktop untuk pengelola.
- Satu layar berfokus pada satu tindakan utama, dengan bahasa Indonesia sederhana.
- Video pendek dilengkapi teks/transkrip dan kuis visual yang tidak bergantung pada warna saja.
- Bukti kelulusan teori dan praktik dipisahkan.
- Data dipakai untuk pendampingan dan keputusan manusia, dengan akses dan konteks yang jelas.
- Biaya operasional dikendalikan melalui monolit modular, penyimpanan objek, dan tanpa ketergantungan AI pada alur inti.

## 5. Persona dan struktur organisasi
| Persona | Kebutuhan | Ukuran keberhasilan |
|---|---|---|
| Pekerja baru | Mengetahui apa yang harus dipelajari dan dilakukan hari ini | Dapat menjalankan tugas dengan benar |
| Pekerja berpengalaman | Pelatihan penyegaran dan jalur peningkatan keterampilan | Kompetensi bertambah dan tercatat |
| Supervisor | Menugaskan, memverifikasi praktik, dan menindaklanjuti kendala | Antrean review jelas dan tidak menumpuk |
| HR/L&D | Menyusun jalur belajar dan mengevaluasi progres | Onboarding dan kesenjangan kompetensi terukur |
| Manajer operasional | Melihat pelaksanaan standar per lokasi | Mengetahui cabang yang perlu bantuan |
| Tenant owner/admin | Mengelola perusahaan, pengguna, dan batas akses | Administrasi aman dan mudah |

Hierarki: tenant/perusahaan → cabang → departemen opsional → jabatan. Setiap membership staf memiliki satu cabang utama dan satu jabatan aktif pada MVP. Supervisor dapat mengelola beberapa cabang melalui scope eksplisit. Jadwal shift adalah konteks penugasan sederhana, bukan mesin roster.

## 6. Ruang lingkup rilis
### Wajib (P0)
Autentikasi; isolasi tenant; RBAC dan scope cabang; impor staf; pengelolaan materi versi; video dan kuis gambar; jalur onboarding; penugasan individu/batch; verifikasi praktik; template dan instance checklist; pelaporan kendala; matriks kompetensi; dashboard dan ekspor CSV; notifikasi dalam aplikasi; audit log; backup dan restore teruji.

### Tambahan jika P0 stabil (P1)
Unduhan materi untuk pembacaan offline terbatas, reminder email, sertifikat penyelesaian internal, dan template industri tambahan. Tidak menjadi syarat peluncuran v0.0.1.

### Setelah MVP
Native mobile app, sinkronisasi offline penuh, SSO perusahaan, API HRIS, WhatsApp resmi, lokalisasi multi bahasa, SCORM/xAPI, AI pembantu penyusunan materi, analitik lanjutan, billing otomatis, dan deployment dedicated untuk kontrak enterprise.

## 7. Hak akses
| Kemampuan | Owner/Admin | HR/L&D | Manajer ops | Supervisor | Staf |
|---|---|---|---|---|---|
| Organisasi dan akses | Kelola | Lihat staf sesuai scope | Lihat sesuai scope | Lihat tim | Profil sendiri terbatas |
| Buat dan terbitkan materi | Ya | Ya | Lihat | Lihat | Materi ditugaskan |
| Penugasan pelatihan | Ya | Ya | Ya sesuai scope | Ya sesuai scope | Tidak |
| Checklist dan jadwal | Ya | Lihat | Kelola sesuai scope | Jalankan/review sesuai scope | Jalankan tugas sendiri |
| Verifikasi praktik | Bila diberi kapabilitas assessor | Bila assessor | Bila assessor | Ya untuk tim | Tidak |
| Kompetensi dan laporan | Semua tenant | Sesuai scope | Sesuai scope | Tim | Milik sendiri |
| Ekspor dan audit | Ya | Ekspor sesuai izin | Ekspor sesuai izin | Tidak secara default | Tidak |

Platform administrator adalah akun pengelola layanan yang terpisah. Tidak mendapat akses rutin ke konten tenant. Dukungan teknis dengan akses data harus dibatasi waktunya, memiliki alasan dan persetujuan tenant, serta dicatat. Semua izin ditegakkan di server; menyembunyikan tombol bukan kontrol akses. Pengguna tidak dapat menyetujui praktik atau permintaan pengecualian miliknya sendiri.

## 8. Alur utama
### A. Menyiapkan perusahaan
Admin membuat cabang, jabatan, dan scope supervisor → mengimpor staf → memperbaiki baris invalid → menerbitkan materi dan checklist → menugaskan onboarding → meninjau dashboard.

### B. Pekerja baru
Aktivasi akun → melihat “Hari Ini” → membaca pengantar → menonton video dan transkrip → menjawab kuis → mengulang jika diperlukan → mengajukan praktik → supervisor menilai → siap kerja jika seluruh persyaratan terpenuhi.

### C. SOP harian
Sistem menghasilkan instance untuk tanggal/shift lokal → staf membuka checklist → mengisi jawaban dan bukti yang diwajibkan → melaporkan kendala jika ada → submit → supervisor menerima atau meminta perbaikan → sistem menampilkan status akhir dan riwayat.

### D. Perubahan materi
Penulis membuat draft versi baru → memeriksa → menerbitkan → tugas baru memakai versi baru. Tugas berjalan mempertahankan versi awal. Pelatihan ulang karena perubahan penting dibuat sebagai assignment baru; riwayat lama tetap tersedia.

## 9. Persyaratan fungsional dan kriteria penerimaan
### FR-01 — Akun dan autentikasi
Akun staf memakai ID karyawan dan password; perusahaan dipilih lewat kode perusahaan/subdomain konteks. Email tidak wajib bagi staf. Admin menerima aktivasi melalui email atau kode aktivasi sekali pakai yang dibagikan secara aman oleh perusahaan. Kode kedaluwarsa maksimal 24 jam dan wajib mengganti password saat aktivasi. Tidak ada password default bersama.

Kriteria: kombinasi tenant+ID karyawan unik; kesalahan login tidak mengungkap keberadaan akun; login dibatasi per akun dan IP; reset membatalkan sesi lama; staf nonaktif ditolak dan token dicabut. Admin wajib MFA sebelum produksi.

### FR-02 — Organisasi dan impor staf
Field wajib: employee_number, full_name, branch_code, job_code, supervisor_employee_number bila tersedia; email dan tanggal mulai opsional. CSV UTF-8 menampilkan preview, validasi duplikasi, referensi cabang/jabatan, dan ringkasan. Maksimal 5.000 baris per batch sebagai batas awal. Impor menerapkan baris valid setelah konfirmasi dan menyediakan error CSV untuk baris gagal. Impor ulang tidak membuat duplikasi; perubahan akses membutuhkan izin admin.

Kriteria: hasil jumlah berhasil/gagal sesuai baris; admin dapat mengunduh kesalahan; staf tidak dapat memindahkan cabang atau menaikkan perannya sendiri.

### FR-03 — Materi mikro dan publikasi
Modul terdiri atas judul, tujuan, jabatan sasaran, deskripsi, video, transkrip, gambar pendukung, kuis dan kompetensi terkait. Durasi sasaran 2 menit, batas MVP 5 menit; materi lebih panjang harus dipecah. Video hanya menggunakan tautan HTTPS YouTube yang tervalidasi; tidak ada unggah, unduh, penyimpanan atau transcoding video oleh Karyanesia. Simpan ID video dan URL kanonis sebagai bagian versi materi. Sasaran durasi tetap 2 menit dan maksimum 5 menit, diverifikasi penulis sebelum publikasi. Gambar JPEG/PNG/WebP maksimal 5 MB.

Status: draft → published → archived. Versi published tidak diubah di tempat. Setiap versi mencatat penulis, waktu terbit, nomor versi, dan checksum aset. Tenant memastikan hak penggunaan konten. Aset unggahan non-video disajikan melalui akses privat dan signed URL singkat. Video mengikuti akses dan ketersediaan YouTube; tautan unlisted bukan kontrol akses tenant dan tidak menjamin kerahasiaan. Video harus dapat diputar oleh peserta; sediakan transkrip dan pesan kegagalan jika video dihapus, privat atau tidak dapat diputar.

Kriteria: draft tidak muncul kepada staf; tugas menunjuk versi immutable; file invalid ditolak; materi tidak dapat dihapus permanen selama direferensikan histori.

### FR-04 — Kuis gambar dan penilaian teori
Tipe soal MVP: pilihan tunggal dengan pertanyaan/opsi teks atau gambar dan alt text. Setiap modul memiliki 1–5 soal. Nilai = jawaban benar / jumlah soal × 100; batas lulus default 80%, dapat dikonfigurasi per versi. Maksimal percobaan default 3. Setelah gagal 3 kali, supervisor membuka rangkaian percobaan baru dengan alasan; semua percobaan tersimpan.

Kriteria: kunci jawaban tidak dikirim sebelum submit; hasil dihitung server; submit berulang dengan idempotency key mengembalikan hasil yang sama; versi soal tidak berubah di tengah percobaan. Kemajuan video hanya sinyal keterlibatan, bukan bukti pemahaman atau kemampuan kerja.

### FR-05 — Jalur onboarding
Jalur berisi urutan modul, tenggat relatif dalam hari kalender, prasyarat, dan observasi praktik wajib. Admin menugaskan berdasarkan staf, cabang, atau jabatan melalui preview target. Assignment menyimpan snapshot persyaratan, tanggal mulai, due_at, dan versi jalur.

Status: assigned → in_progress → awaiting_assessment → completed; alternatif overdue sebagai flag dan cancelled sebagai status akhir. Overdue tidak menutup akses belajar. Completed hanya jika seluruh teori wajib lulus dan praktik wajib disetujui.

Kriteria: penugasan batch idempotent; satu event penugasan tidak menghasilkan tugas ganda; supervisor tidak bisa melewati syarat melalui perubahan angka progres; pembatalan menyimpan alasan.

### FR-06 — Observasi praktik
Assessor memakai rubrik dengan item wajib, hasil competent/needs_practice, komentar, dan bukti opsional. Item kritis harus seluruhnya lulus. Hasil gagal menyertakan instruksi latihan dan dapat diajukan ulang. Penilaian yang sudah disahkan dikoreksi melalui record baru yang menunjuk hasil sebelumnya, bukan menimpa histori.

Kriteria: assessor hanya menilai staf dalam scope; self-approval ditolak; staf dapat melihat hasil dan meminta peninjauan; identitas assessor, tanggal dan versi rubrik tercatat.

### FR-07 — Template dan penjadwalan checklist
Template memiliki nama, versi, lokasi/jabatan sasaran, waktu mulai, tenggat, dan item. Jenis item: ya/tidak, angka dengan satuan/rentang, teks, foto. Item wajib dan kritis ditandai terpisah. Jawaban “tidak sesuai” dapat diwajibkan membuat kendala.

Jadwal MVP mendukung harian dan hari tertentu dalam seminggu dengan label shift serta penerima eksplisit. Template baru tidak mengubah instance yang sudah dihasilkan. Instance unik berdasarkan tenant+schedule+local_date+shift+assignee. Scheduler dapat dijalankan ulang tanpa duplikasi.

Kriteria: cabang memakai timezone IANA Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura; shift melewati tengah malam tetap terkait tanggal awal shift; jadwal tanpa penerima ditandai unassigned dan memicu notifikasi supervisor; tidak dihitung sebagai selesai.

### FR-08 — Pengisian dan review SOP
Status instance: open → in_progress → submitted → accepted; submitted → changes_requested → submitted; alternatif excused atau cancelled dengan otorisasi dan alasan. Keterlambatan merupakan flag terhadap due_at. Checklist berisiko rendah boleh auto-accept saat submit bila template mengizinkan; item kritis memerlukan review manusia.

Kriteria: submit ditolak jika item wajib/bukti belum lengkap; draft disimpan di server; perubahan setelah submit hanya melalui changes_requested; penerimaan terlambat tidak mengubah timestamp pengajuan; alasan koreksi dan versi tersimpan. Staf tidak dapat mengubah jam server.

### FR-09 — Kendala dan tindak lanjut
Kendala memiliki kategori, uraian, tingkat prioritas, lokasi, pelapor, lampiran opsional, penanggung jawab, tenggat, dan referensi item/checklist. Status: open → assigned → in_progress → resolved → closed, atau reopened. Resolved memerlukan catatan tindakan; closed memerlukan supervisor. Pelaporan bukan prosedur tanggap darurat: layar menampilkan instruksi kontak internal perusahaan untuk kondisi mendesak.

Kriteria: kegagalan SOP tetap terlihat meskipun kendala sudah dibuat; penyelesaian kendala tidak otomatis mengubah jawaban checklist; prioritas tinggi tampil pada antrean supervisor.

### FR-10 — Kompetensi dan promosi internal
Matriks menghubungkan jabatan dengan keterampilan wajib/opsional. Status keterampilan: not_started, learning, theory_passed, verified, expired. Verified memerlukan teori dan praktik sesuai definisi skill. Masa berlaku bersifat opsional per kompetensi. Kedaluwarsa menghasilkan kebutuhan penyegaran, tanpa menghapus riwayat.

Tampilan kesiapan jabatan berikutnya menunjukkan syarat terpenuhi dan yang kurang. Tidak ada skor gabungan tersembunyi, ranking publik, atau keputusan promosi otomatis. HR/supervisor membuat keputusan dan mencatat alasan di luar atau melalui catatan terbatas dalam aplikasi.

Kriteria: nilai kuis tinggi tidak otomatis menghasilkan verified; staf dapat melihat bukti miliknya dan mengajukan koreksi; akses penilaian individual mengikuti scope.

### FR-11 — Dashboard dan ekspor
Filter: periode, cabang, jabatan, jalur, dan status. Widget: onboarding jatuh tempo/selesai, teori gagal, praktik menunggu, SOP tepat waktu/terlambat, unassigned, kendala terbuka, dan keterampilan kedaluwarsa. Tampilkan waktu pembaruan dan definisi setiap metrik. Ekspor CSV mengikuti filter dan hak akses; setiap ekspor diaudit dan melindungi formula injection pada sel teks.

Kriteria: agregat cocok dengan detail; periode tanpa denominator ditampilkan “belum ada data”, bukan 0% kinerja; filter cabang tidak dapat dipakai mengakses tenant lain.

### FR-12 — Notifikasi
Notifikasi dalam aplikasi untuk tugas baru, tenggat dekat, keterlambatan, hasil kuis/praktik, permintaan perbaikan, dan kendala prioritas tinggi. Reminder default sekali sebelum tenggat dan sekali setelah lewat; scheduler melakukan deduplikasi. Retry job menggunakan backoff dan antrean gagal. Email reminder merupakan P1; aktivasi/reset admin tetap merupakan fungsi autentikasi inti.

Kriteria: event yang diproses ulang tidak menggandakan notifikasi; membuka tautan tetap memerlukan otorisasi; tidak ada data sensitif pada judul notifikasi.

### FR-13 — Audit dan lifecycle staf
Catat perubahan akses, publikasi versi, assignment, hasil kuis/praktik, submit/review checklist, pengecualian, ekspor, dan akses dukungan. Audit mencakup actor, tenant, objek, aksi, waktu server, correlation_id, dan ringkasan perubahan tanpa password/token. Staf keluar dinonaktifkan, tugas ke depan dihentikan, dan tugas terbuka ditinjau supervisor. Riwayat tidak hilang saat staf pindah cabang.

Kriteria: scope baru berlaku setelah pemindahan; laporan historis memakai snapshot cabang pada kejadian; akses staf lama dicabut; record audit tidak dapat diedit lewat API aplikasi.

## 10. Aturan bisnis lintas modul
1. Tenant ditentukan dari sesi tervalidasi; tenant_id dari payload pengguna tidak dipercaya.
2. ID unik tenant berlaku pada seluruh tabel milik perusahaan, indeks, query, job, cache, dan penyimpanan.
3. Tidak ada penghapusan keras histori terpakai melalui UI biasa. Penghapusan/pseudonimisasi terkontrol mengikuti kebijakan retensi yang disetujui.
4. Semua waktu disimpan UTC; tanggal jadwal diinterpretasikan memakai timezone cabang dan ditampilkan secara lokal.
5. Pengecualian tugas wajib memerlukan alasan dan persetujuan pihak yang berwenang, bukan persetujuan diri sendiri.
6. Pekerja dapat melaporkan kesalahan data dan meminta review; aplikasi mencatat permintaan dan penyelesaiannya.
7. Penugasan lama tidak diam-diam berubah ketika materi, jabatan, atau template diperbarui.
8. Pindah jabatan memunculkan preview tugas/skill baru; tugas lama dipertahankan atau dibatalkan secara eksplisit dengan alasan.
9. Foto tidak diwajibkan untuk seluruh tugas; jangan meminta wajah, identitas pribadi, atau data pelanggan jika tidak diperlukan.
10. Subscription/kuota tidak boleh menghapus histori atau memblokir ekspor tenant tanpa proses yang jelas. Billing otomatis di luar MVP.

## 11. Definisi metrik operasional
| Metrik | Rumus dan aturan |
|---|---|
| Progres onboarding | Persyaratan wajib selesai / seluruh persyaratan wajib snapshot × 100; teori dan praktik dihitung sebagai unit terpisah |
| Lulus teori | Assignment modul dengan minimal satu attempt lulus / assignment modul dengan attempt disubmit |
| SOP diajukan tepat waktu | Instance wajib dengan submitted_at pertama yang lengkap ≤ due_at / instance wajib yang jatuh tempo dalam periode |
| SOP diterima | Instance accepted / instance wajib yang jatuh tempo; tampilkan tepat waktu dan terlambat terpisah |
| Pengecualian | Instance excused / seluruh instance jatuh tempo; dilaporkan terpisah, tidak diberi label selesai |
| Kesiapan kerja | Seluruh persyaratan onboarding wajib selesai dan seluruh kompetensi kritis yang diwajibkan masih berlaku |
| Cakupan skill | Skill wajib verified dan belum expired / skill wajib jabatan |

Cancelled sebelum dimulai dikeluarkan dari denominator dengan jumlah pembatalan ditampilkan. Cancelled setelah mulai tetap tercatat pada laporan pengecualian agar metrik tidak mudah dimanipulasi. Draft submit yang belum lengkap tidak dihitung sebagai submission. Laporan dapat dihitung ulang pada waktu pengambilan; sertakan as_of agar perubahan review terlacak.

## 12. Struktur layar dan pengalaman pengguna
### Staf
Hari Ini (tugas, tenggat, kendala) · Belajar (jalur, modul, video, kuis) · SOP Saya (draft, diajukan, perlu perbaikan) · Keterampilan Saya · Notifikasi · Profil.

### Supervisor
Ringkasan tim · Antrean praktik · Review checklist · Kendala · Penugasan · Matriks keterampilan.

### Admin/HR/Operasional
Dashboard · Organisasi & staf · Materi · Jalur onboarding · Template & jadwal SOP · Kompetensi · Laporan · Audit & pengaturan.

Persyaratan UI: lebar 360 px hingga desktop, target sentuh minimal 44 px, teks dapat diperbesar, label selalu jelas, status menggunakan ikon+teks, subtitle/transkrip video, alt text gambar, fokus keyboard terlihat, kontras ditargetkan WCAG AA. Kuis gambar harus memiliki alternatif setara yang tidak membocorkan jawaban. Sediakan empty/loading/error state, retry, konfirmasi submit, dan indikator “tersimpan”.

MVP bersifat online-first. Jika jaringan putus, tampilkan status gagal simpan dan larang klaim tugas sudah terkirim. Resume video dan draft terakhir yang sudah tersimpan tersedia saat tersambung kembali. Tidak menjanjikan penyelesaian offline. Perangkat bersama harus menyediakan logout jelas dan tidak menyimpan materi sensitif tanpa kontrol.

## 13. Model data konseptual
| Entitas | Field/relasi inti |
|---|---|
| Tenant | name, slug, status, settings, retention_policy |
| User | identity, password_hash, MFA, status; dapat memiliki membership beberapa tenant |
| Membership | tenant_id, user_id, employee_number, branch_id, job_id, supervisor_id, status |
| RoleGrant | membership_id, role, branch_scope |
| Branch / Job | tenant_id, code, name; branch.timezone |
| MediaAsset | tenant_id, object_key, mime, size, checksum, status |
| Module / ModuleVersion | tenant_id, title; version, transcript, youtube_video_id / video_url, pass_score, attempt_limit |
| Question / Option | module_version_id, text/image, answer_key sisi server |
| LearningPathVersion / Requirement | ordered module/rubric references, prerequisite, due_offset |
| Assignment | tenant_id, membership_id, path_version_id, snapshot, start_at, due_at, status |
| ModuleProgress / QuizAttempt | assignment_id, version_id, answers, score, submitted_at, attempt_no |
| Assessment | assignment_id, rubric_version, assessor_id, outcome, evidence, supersedes_id |
| ChecklistTemplateVersion / Item | types, required, critical, review_policy |
| ChecklistSchedule | template_version_id, recipients, recurrence, timezone, shift, validity |
| ChecklistInstance / Response | schedule_id, date, assignee, status, due_at, answers, submitted_at |
| ChecklistReview | instance_id, reviewer, decision, reason, revision |
| Issue / IssueEvent | owner, priority, source, status, action history |
| Competency / JobRequirement | definition, validity_days, required theory/practice |
| SkillEvidence | membership_id, competency_id, source, verified_at, expires_at |
| Notification / Outbox / AuditEvent | dedupe_key, delivery status; actor/object/time |

Semua relasi lintas entitas tenant harus menjaga tenant yang sama, termasuk foreign key komposit bila sesuai. Unique constraint wajib pada employee_number per tenant, assignment event+recipient, attempt submission key, dan kunci instance jadwal. Pagination, indeks tenant/status/due_at, serta indeks tenant/branch/date diperlukan sejak awal.

## 14. Arsitektur teknis awal
Usulan stack, bukan keputusan final pengadaan:
- Frontend: Next.js dan TypeScript, web responsif dengan kemampuan PWA dasar.
- Backend: NestJS, monolit modular untuk auth, organisasi, learning, SOP, skill, laporan dan audit.
- Database: PostgreSQL; dapat memakai Supabase Postgres apabila sesuai biaya dan operasi. Pilih satu sistem identitas utama; jangan menggandakan akun auth tanpa kebutuhan.
- Video: tautan YouTube saja; validasi host dan ID, tanpa mengambil URL pengguna di server. Tidak ada pipeline unggah video. Object storage kompatibel S3 dengan bucket privat dan signed URL hanya untuk gambar/bukti non-video.
- Background job: Redis + BullMQ untuk recurring instance, reminder, import, dan ekspor. PostgreSQL tetap sumber kebenaran.
- Deployment: Docker Compose pada VPS untuk pilot, reverse proxy TLS, backup di lokasi terpisah. Tidak memerlukan Kubernetes atau Vercel.

Request → API auth/scope → validasi bisnis → transaksi PostgreSQL + outbox → worker idempotent → notifikasi/penjadwalan. Gunakan locking atau unique constraint saat scheduler paralel. Job menyimpan tenant context; worker memvalidasi ulang referensi. Retry tidak boleh menghasilkan side effect ganda.

API REST /api/v1; OpenAPI tersedia untuk pengembang. Pagination cursor untuk daftar besar. Format error mencakup code, message, field_errors, correlation_id. Optimistic concurrency memakai revision untuk edit template dan review.

## 15. Kontrak API utama
| Endpoint contoh | Operasi |
|---|---|
| POST /auth/login, /auth/activate, /auth/reset | Sesi dan aktivasi |
| GET/POST /branches, /jobs, /memberships | Organisasi sesuai izin |
| POST /staff-imports/preview, /staff-imports/{id}/commit | Impor dua tahap |
| POST /media/upload-intents, /media/{id}/complete | Unggah tervalidasi |
| POST /modules/{id}/versions; POST /module-versions/{id}/publish | Versioning materi |
| POST /assignments/preview; POST /assignments | Target dan penugasan |
| POST /assignments/{id}/quiz-attempts | Submit kuis |
| POST /assignments/{id}/assessments | Penilaian praktik |
| POST /checklist-schedules; GET /my/checklists | Jadwal dan tugas staf |
| PATCH /checklist-instances/{id}/draft; POST /{id}/submit | Pengisian SOP |
| POST /checklist-instances/{id}/reviews | Terima/perbaikan |
| GET/POST /issues; POST /issues/{id}/transitions | Kendala |
| GET /my/skills; GET /reports/summary; POST /exports | Kompetensi dan laporan |

Endpoint tabel ini adalah rancangan kontrak; path final diselaraskan pada spesifikasi OpenAPI. Mutasi kritis menerima Idempotency-Key; revision mismatch menghasilkan 409. Gunakan 401 untuk belum login, 403 untuk izin ditolak, 404 untuk objek yang tidak boleh terungkap, 422 untuk validasi bisnis, dan 429 untuk rate limit.

## 16. Persyaratan nonfungsional
| Area | Target awal dan cara uji |
|---|---|
| Kapasitas | Pilot sampai 10 tenant × 1.000 staf; uji beban 200 pengguna bersamaan dengan campuran baca/tulis; target perencanaan, bukan kapasitas terbukti |
| Respons API | p95 ≤800 ms untuk operasi biasa tanpa transfer media, pada profil beban pilot |
| Halaman utama staf | Dapat dipakai ≤3 detik pada simulasi Android kelas menengah/4G dengan cache dingin; media video diukur terpisah |
| Ketersediaan | Sasaran operasional 99,5% per bulan, bukan SLA kontrak pada tahap pilot |
| Integritas | Tidak ada assignment/checklist/attempt ganda pada uji retry dan concurrency |
| Backup | Backup database harian + WAL/PITR bila tersedia; RPO sasaran ≤24 jam, RTO ≤8 jam; pulihkan database dan aset pada uji restore |
| Observabilitas | Log terstruktur, metric latency/error/job lag, alarm kegagalan scheduler/backup, correlation_id |
| Aksesibilitas | Audit alur kritis keyboard, screen reader, kontras dan alternatif media |
| Kompatibilitas | Chrome Android dan browser desktop modern; Safari iOS diuji untuk video, upload, dan login |

Target harus diuji pada infrastruktur yang dipilih. Pemutaran video dilayani YouTube, terpisah dari concurrency API.

## 17. Keamanan, privasi, dan pengelolaan data
- Password di-hash menggunakan algoritme modern; TLS; secrets hanya pada secret store/environment, tidak pada source code.
- Isolasi tenant pada service/query dan database RLS sebagai pertahanan tambahan bila digunakan. Uji akses objek langsung, laporan, aset, job dan ekspor lintas tenant.
- Sesi cookie HttpOnly/Secure dengan perlindungan CSRF sesuai arsitektur; sanitasi input dan kontrol XSS.
- Unggah melalui staging privat; verifikasi MIME aktual, ukuran dan checksum, pemindaian malware sebelum tersedia; signed URL tidak dicatat dalam log.
- Minimalkan data staf: tidak membutuhkan NIK, data kesehatan, biometrik, atau rekening bank pada MVP.
- HR hanya mengakses data yang dibutuhkan; audit ekspor dan akses dukungan; staf melihat informasi dirinya dan kanal koreksi.
- Retensi usulan: audit 12 bulan; bukti foto 90 hari; histori pelatihan selama masa aktif + 12 bulan. Nilai ini merupakan konfigurasi draft yang memerlukan persetujuan kebijakan perusahaan sebelum produksi, bukan ketentuan hukum.
- Penghapusan/pseudonimisasi melalui proses terotorisasi; legal hold jika disepakati menghalangi purge. Backup mengikuti siklus kedaluwarsa yang didokumentasikan dan tidak menghidupkan kembali data yang sudah dihapus saat restore.
- Tinjauan kontrak pengolahan data, lokasi pemrosesan, pemberitahuan kepada pekerja, dan kebijakan retensi merupakan prasyarat go-live. Dokumen ini tidak menyatakan kepatuhan hukum tertentu.

## 18. Strategi pilot dan konten awal
Usulan pilot: satu perusahaan ritel, 2–3 cabang, 50–100 pekerja, tiga jabatan. Periode observasi baseline dua minggu dan pilot penggunaan empat minggu. Sediakan 10–15 modul, 3 jalur onboarding, 3 template checklist, rubrik praktik per jabatan, dan matriks kompetensi awal.

Contoh materi: pengenalan toko, pelayanan pelanggan, penataan rak, pemeriksaan harga, transaksi dasar, penanganan keluhan, kebersihan area, dan serah terima shift. Materi spesifik keselamatan/peralatan harus disusun serta disetujui perusahaan dan tidak digantikan video generik.

Syarat masuk: pemilik proses ditunjuk; supervisor terlatih; perangkat dan koneksi tersedia; konten disetujui; baseline dan kanal dukungan siap. Evaluasi mingguan mencakup hambatan penggunaan dan beban administratif supervisor.

## 19. Rencana implementasi dan dependensi
Estimasi urutan enam sprint, masing-masing dua minggu, bergantung kapasitas tim dan kesiapan konten:
| Sprint | Hasil | Gate |
|---|---|---|
| 1 | Auth, tenant, RBAC, cabang, staf, desain alur inti | Uji isolasi tenant dan login |
| 2 | Upload privat, versioning modul, kuis, publikasi | Materi dan nilai server terverifikasi |
| 3 | Jalur onboarding, assignment, observasi praktik | Alur pekerja baru end-to-end |
| 4 | Checklist, scheduler, review, kendala | Retry/concurrency dan timezone lolos |
| 5 | Kompetensi, laporan, ekspor, notifikasi, audit | Angka laporan cocok data sumber |
| 6 | Hardening, aksesibilitas, load test, restore, UAT | Go-live checklist terpenuhi |

Tim minimum usulan: product owner, satu engineer backend, satu engineer frontend/fullstack, QA paruh waktu, designer paruh waktu, serta subject-matter expert dari perusahaan pilot. Peran dapat dirangkap; estimasi disesuaikan apabila kapasitas lebih kecil. Konten dan validasi praktik merupakan jalur kritis setara pengembangan aplikasi.

## 20. Pengujian dan acceptance rilis
Skenario UAT wajib:
1. Admin tenant A tidak dapat mengakses staf, media, job, audit, maupun ekspor tenant B.
2. Impor berisi duplikasi dan cabang invalid memberikan hasil yang dapat diperbaiki tanpa data ganda.
3. Staf menuntaskan video/kuis, gagal tiga kali, mendapat reset beralasan, lalu lulus.
4. Onboarding tidak completed sebelum seluruh praktik kritis disetujui assessor yang berwenang.
5. Publikasi versi baru tidak mengubah nilai dan syarat assignment lama.
6. Scheduler ganda dan retry setelah crash menghasilkan satu instance per kunci jadwal.
7. Checklist malam lintas tanggal di WIB/WITA/WIT menghasilkan tanggal dan tenggat benar.
8. Putus jaringan tidak menampilkan sukses palsu; submit ulang aman dan tidak menggandakan record.
9. Item kritis gagal memerlukan kendala/review sesuai kebijakan; supervisor meminta perbaikan dan menerima revisi dengan histori utuh.
10. Pemindahan cabang/nonaktif staf memperbarui akses tanpa menghapus laporan historis.
11. Perhitungan tepat waktu, accepted, excused, cancelled dan denominator cocok contoh data yang disetujui.
12. Restore database dan aset berhasil, dengan izin akses tetap benar.
13. Alur inti bisa dipakai melalui keyboard, pembesaran teks, dan alternatif video/gambar.
14. Koreksi penilaian dan permintaan review tidak menghapus record awal.

Definition of Done: seluruh P0 diterima; tidak ada bug kritis/tinggi terbuka pada auth, tenant isolation, integritas dan alur inti; OpenAPI dan runbook tersedia; monitoring serta backup aktif; load/restore test tercatat; konten pilot disetujui; admin dan supervisor menyelesaikan UAT. Peluncuran bertahap melalui feature flag dan cadangan sebelum migrasi. Rollback aplikasi menggunakan image sebelumnya; migrasi database harus kompatibel mundur atau mempunyai rencana pemulihan teruji.

## 21. Risiko dan mitigasi
| Risiko | Mitigasi |
|---|---|
| Staf sekadar menekan selesai | Kuis, observasi praktik, dan sampling supervisor; tidak mengklaim bukti kehadiran fisik |
| Checklist menjadi formalitas | Item relevan, sedikit bukti wajib, review berbasis risiko, tindak lanjut nyata |
| Konten cepat usang | Pemilik konten, jadwal review, versioning dan pelatihan ulang eksplisit |
| Supervisi menjadi bottleneck | Antrean review, pembagian scope assessor, ringkasan tugas tertunda |
| Kuota/bandwidth mahal | Video pendek melalui tautan YouTube; pantau ketersediaan dan akses peserta |
| Kinerja dinilai tanpa konteks | Tampilkan syarat, bukti, pengecualian, serta hak meminta review; keputusan oleh manusia |
| Kebocoran antar perusahaan | Isolasi berlapis, uji negatif akses, bucket privat dan audit |
| Kurang koneksi/perangkat | Pilot memvalidasi kondisi lapangan; konten teks alternatif; offline penuh pada fase berikutnya |
| Tidak ada dampak rekrutmen | Ukur jam pelatihan, retensi dan kebutuhan bisnis; hindari klaim penciptaan kerja tanpa data |

## 22. Model bisnis dan biaya
Hipotesis monetisasi: langganan per perusahaan dengan paket jumlah cabang dan staf aktif; jasa onboarding/pembuatan konten sebagai biaya terpisah. Dedicated/self-hosted dipertimbangkan setelah kebutuhan enterprise terbukti. Harga belum ditetapkan dan harus diuji melalui wawancara/pilot; tidak ada proyeksi pendapatan aktual pada versi ini.

Komponen biaya: VPS/API, PostgreSQL dan backup, Redis/worker, penyimpanan gambar/bukti, bandwidth, email autentikasi, observabilitas, dukungan dan produksi konten. Estimasi bulanan = biaya tetap infrastruktur + GB penyimpanan × tarif + GB transfer × tarif + pesan email × tarif + tenaga operasional. Isi tarif berdasarkan penawaran aktual sebelum pengadaan. AI opsional fase berikutnya menggunakan BYOK dengan batas biaya dan persetujuan konten manusia.

## 23. Keputusan baseline dan hal yang perlu divalidasi
### Baseline v0.0.1
Nama Karyanesia; B2B SaaS multi-tenant; ritel sebagai pilot; web responsif online-first; bahasa Indonesia; Next.js/NestJS/PostgreSQL sebagai usulan stack; video melalui tautan YouTube saja; penilaian teori dan praktik terpisah; P0 tanpa AI, billing otomatis, dan integrasi HRIS.

### Validasi sebelum pembangunan rinci/go-live
1. Konfirmasi perusahaan pilot, jabatan, jumlah staf, dan pemilik SOP.
2. Konfirmasi batas cabang, kebijakan assessor, jadwal shift dan aturan pengecualian.
3. Pilih layanan database, object storage, autentikasi, lokasi hosting, dan anggaran.
4. Setujui kebijakan data, retensi, pemberitahuan staf dan akses dukungan.
5. Konfirmasi perangkat staf, kebutuhan login tanpa email, serta aksesibilitas.
6. Uji kemauan membayar dan metrik pilot; verifikasi nama merek/domain secara terpisah.

Validasi tersebut tidak mengubah cakupan draft ini menjadi janji implementasi tambahan. Perubahan baseline dicatat pada versi PRD berikutnya beserta dampak scope, waktu dan biaya.

## 24. Traceability kebutuhan
| Kebutuhan awal | Implementasi PRD | Bukti penerimaan |
|---|---|---|
| Onboarding pekerja tanpa pengalaman | FR-02, FR-05, FR-06 | UAT 2–5 |
| Video sekitar dua menit dan kuis gambar | FR-03, FR-04 | UAT 3, 5, 13 |
| Checklist SOP harian interaktif | FR-07–FR-09 | UAT 6–9 |
| Performa untuk pengembangan/promosi | FR-10, FR-11 | UAT 11, 14 |
| B2B korporasi banyak lokasi | FR-01, FR-02, FR-13; RBAC | UAT 1, 10, 12 |
| Mengurangi biaya/friksi pelatihan | Metrik tujuan dan pilot | Perbandingan baseline, waktu supervisor dan kesiapan kerja |

## 25. Riwayat versi
| Versi | Tanggal | Perubahan |
|---|---|---|
| 0.0.1 | 16 Oktober 2026 | Draft awal lengkap: produk, scope, alur, FR, aturan bisnis, data, arsitektur, nonfungsional, pilot dan acceptance |

### Perubahan keputusan — 16 Oktober 2026
Atas arahan pemilik produk, sumber video dibatasi ke tautan YouTube. Ketentuan ini menggantikan rencana unggah MP4 dan penyimpanan video privat pada rancangan awal. Penyimpanan privat tetap berlaku untuk gambar/bukti non-video.
