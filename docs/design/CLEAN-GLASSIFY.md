# Karyanesia Clean-Glassify

Panduan visual dari pengguna: [PDF spesifikasi](Karyanesia_Clean_Glassify_Specification.pdf). Berlaku untuk seluruh pengembangan UI Karyanesia setelah fondasi awal. Aturan bisnis dan status implementasi tetap mengikuti PRD v0.0.1.

## Sistem visual

| Elemen     | Panduan                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| Kanvas     | Slate 50, `#F8FAFC`, dengan radial mesh Sky Blue, Lavender, dan Mint       |
| Panel      | Kaca putih susu alpha 0,88–0,92, border netral tipis                       |
| Kedalaman  | Refleksi atas 1 px putih, shadow lembut, blur terbatas pada panel          |
| Teks       | Slate 900 `#0F172A`, teks pendukung Slate gelap untuk keterbacaan          |
| Aksi utama | Biru `#2563EB`, teks putih, hover `#1D4ED8`                                |
| Semantik   | Biru onboarding, hijau SOP, merah kendala, amber review/perhatian          |
| Tipografi  | Sans serif, hierarki heading tegas, label form selalu terlihat             |
| Interaksi  | Target sentuh minimal 44 px, fokus keyboard jelas, status menggunakan teks |

Glass harus berupa permukaan terang yang terbaca. Hindari teks abu-abu pucat di atas gradasi. Sediakan latar putih solid saat blur tidak didukung atau pengguna meminta pengurangan transparansi. Warna menjadi pendamping label, bukan satu-satunya pembeda status.

## Layout per area

### Halaman publik dan autentikasi

Gunakan mesh pastel, kartu autentikasi kaca susu, input berlabel jelas dan CTA biru. Pada ponsel, utamakan satu kolom form tanpa hero besar yang mendorong kolom login terlalu jauh ke bawah. Pertahankan login kode perusahaan, ID karyawan, password dan MFA admin sesuai implementasi keamanan, meskipun ilustrasi PDF menyingkat field.

### Staf lapangan dan supervisor

Saat modul terkait tersedia, layar Hari Ini memakai kartu tugas dengan strip aksen sesuai fungsi. Player video memiliki permukaan gelap yang fokus dan transkrip yang mudah dijangkau. Kuis menggunakan pilihan dengan state terpilih biru dan teks/ikon yang jelas. Penilaian supervisor memakai toggle besar, label ITEM KRITIS, dan latar merah pastel untuk item kritis.

### Dashboard operasi dan HR

Sidebar kaca putih, empat kartu KPI beraksen, serta bento grid konten utama. Tabel menggunakan baris selang-seling terang. Antrean review lebih dari 24 jam harus memiliki label keterlambatan dan penekanan visual yang jelas ketika data review tersedia.

Pada tablet dan mobile, empat kartu KPI menjadi dua kolom. Tabel panjang memakai scroll horizontal pada kontainer tabel saja. Form modal memakai native dialog untuk fokus dan navigasi keyboard.

## Penerapan milestone fondasi

Sudah diterapkan pada autentikasi/aktivasi, sidebar, dashboard organisasi, tabel direktori, serta modal cabang/jabatan/staf. Empat kartu saat ini menampilkan data organisasi: staf aktif, menunggu aktivasi, cabang dengan staf, dan jumlah jabatan pada daftar akses pengguna.

Nilai onboarding 88,4%, penurunan beban supervisi 18,2%, kepatuhan 92,1%, lima isu, serta contoh cabang/nama pada PDF adalah ilustrasi desain. Jangan menyalinnya sebagai data live. Modul pelatihan, SOP dan antrean review belum diimplementasikan pada milestone ini. Klaim “RLS aktif”, “zero-data leakage verified”, dan ekspor audit pada mockup tidak menjadi klaim implementasi hanya karena tertulis di ilustrasi.

## Sumber implementasi

- Token dan komponen visual: `apps/web/app/globals.css`.
- Layout dan state API: `apps/web/app/page.tsx`.
- Gunakan styling ini untuk modul berikutnya agar tidak kembali ke palet editorial hijau pada versi fondasi awal.
- Verifikasi viewport 360–390 px, tablet dan desktop, kontras, reduced transparency dan fokus keyboard sebelum menyatakan UI siap produksi.
