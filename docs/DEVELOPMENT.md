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
