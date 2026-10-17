# Instalasi Karyanesia pada Ubuntu/VPS bersama

Panduan ini menyiapkan instalasi Docker Compose. Jalankan pada host yang sudah memiliki Docker Engine, plugin Compose v2, Git, OpenSSL dan curl. Tidak perlu Vercel. Jangan gunakan smoke test pada Docker host produksi: skrip itu membuat lalu menghapus volume proyek sintetisnya sendiri.

## 1. Checkout dan konfigurasi

```bash
git clone https://github.com/nanjar/karyanesia.git
cd karyanesia
cp .env.example .env
chmod 600 .env
```

Periksa port yang sudah dipakai sebelum memilih port Karyanesia:

```bash
sudo ss -ltnp
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Contoh alokasi port host (bukan jaminan port tersebut kosong):

```dotenv
WEB_PORT=6401
API_PORT=6402
POSTGRES_PORT=6432
WEB_ORIGIN=http://localhost:6401
NODE_ENV=development
TRUST_PROXY_HOPS=0
```

Masukkan POSTGRES_PASSWORD acak hasil `openssl rand -hex 24` dan MFA_ENCRYPTION_KEY hasil `openssl rand -hex 32` langsung ke `.env` secara privat. Password hex menghindari masalah karakter khusus pada URL database Compose. Jangan kirim isi `.env`, password, atau secret MFA ke log/chat/repository.

Untuk Docker, URL internal API/database menggunakan nama service dan port container tetap: api:4000 dan postgres:5432. Mengubah port host tidak memerlukan perubahan Dockerfile atau rewrite frontend. DATABASE_URL dan API_INTERNAL_URL pada contoh `.env` hanya dipakai saat proses pengembangan dijalankan langsung di host; sesuaikan ke port host jika menggunakan mode tersebut.

## 2. Build dan jalankan

```bash
docker compose config --quiet
docker compose build api web
docker compose up -d postgres migrate api web worker clamav
docker compose ps -a
```

Migrate harus selesai dengan exit code 0. API/worker menunggu migrasi; web menunggu API sehat. Bila migrasi gagal, periksa log dan perbaiki penyebabnya sebelum menjalankan ulang. Jangan menghapus volume database untuk mengatasi error migrasi.

```bash
docker compose logs --tail=100 migrate api worker web
curl --fail http://127.0.0.1:6402/api/v1/health
curl --fail http://127.0.0.1:6401/api/v1/health
curl --head http://127.0.0.1:6401
```

Gunakan port yang Anda pilih, bukan otomatis menyalin 6401/6402. Pemeriksaan melalui web menguji rewrite Next.js ke API. Tunggu status healthy API/web/worker; heartbeat worker pertama dapat membutuhkan waktu. ClamAV mengunduh signature pada startup awal; unggah gambar akan ditolak sementara sampai engine siap. Video hanya tautan YouTube.

## 3. Buat perusahaan pertama

Isi field BOOTSTRAP_TENANT_CODE, BOOTSTRAP_TENANT_NAME, BOOTSTRAP_EMPLOYEE_NUMBER, BOOTSTRAP_FULL_NAME, BOOTSTRAP_PASSWORD pada `.env` secara privat, kemudian:

```bash
docker compose --profile setup run --rm bootstrap
```

Bootstrap menampilkan URI pendaftaran MFA satu kali. Simpan dengan aman dan daftarkan pada authenticator pemilik akun sebelum login. Jangan menyertakan output itu pada screenshot publik/log bantuan. Setelah berhasil, kosongkan BOOTSTRAP_PASSWORD di `.env`. Tidak ada password default bersama. Bootstrap perusahaan yang sama tidak perlu dijalankan ulang.

## 4. Domain dan TLS

Untuk produksi, tentukan domain yang Anda miliki, siapkan DNS/TLS pada reverse proxy host dan ubah WEB_ORIGIN ke origin HTTPS persis, tanpa trailing slash. Set NODE_ENV=production. Hanya proxy host yang perlu menerima trafik publik; binding API/database/web Compose tetap 127.0.0.1.

Arahkan reverse proxy ke port WEB_PORT. Proxy harus mendukung ukuran request sekurangnya 8 MiB untuk gambar base64 maksimal 5 MB; contoh Nginx gunakan `client_max_body_size 9m`. Timpa X-Forwarded-For dari klien dengan alamat klien yang diverifikasi proxy; atur TRUST_PROXY_HOPS hanya setelah rantai proxy diverifikasi. Lihat OPERATIONS-RUNBOOK.md untuk aturan header/rate limit. Jangan menggunakan origin HTTP untuk produksi karena cookie Secure dan validasi config membutuhkan HTTPS.

Setelah mengubah `.env`, jalankan ulang `docker compose up -d api web worker`. Bila menggunakan akses dari komputer lain sebelum TLS, sediakan tunnel SSH ke port web dan gunakan origin yang sesuai URL browser; port loopback tidak dapat dibuka langsung dari perangkat lain.

## 5. Update dan operasi

Cadangkan database dan key MFA secara terpisah sebelum update. Pilih commit/image yang CI-nya hijau. Jalankan:

```bash
git pull --ff-only
docker compose build api web
docker compose up -d postgres migrate api web worker clamav
docker compose ps -a
```

Migrate memverifikasi checksum migrasi dan menerapkan yang belum dijalankan. Health check membantu diagnosis; Docker tidak otomatis me-restart container hanya karena unhealthy, sehingga tetap pasang alarm dan tinjau log. Restart policy menangani proses yang berhenti.

Backup offsite, alarm, retensi, UAT, uji browser, dan latihan restore host tujuan masih wajib dikonfigurasi. Ikuti RELEASE-CHECKLIST-v0.0.1.md serta OPERATIONS-RUNBOOK.md. Health/CI hijau bukan bukti seluruh gate produksi telah selesai.

## Troubleshooting ringkas

- Port already allocated: ubah WEB_PORT/API_PORT/POSTGRES_PORT di `.env` ke port kosong, perbarui WEB_ORIGIN bila web berubah, lalu jalankan ulang Compose. Jangan menghentikan aplikasi lain tanpa memeriksa kegunaannya.
- API/worker tidak mulai: periksa `docker compose logs migrate postgres`; startup sengaja diblokir saat migrasi gagal.
- Web sehat tetapi login 403 Origin: WEB_ORIGIN harus sama persis dengan origin URL browser, termasuk scheme dan port.
- Upload 413: periksa batas request reverse proxy (base64 menambah ukuran transfer).
- Upload 503: periksa kesiapan signature/engine ClamAV; jangan menonaktifkan pemindaian untuk meloloskan upload.
- Worker unhealthy: periksa database, migrasi, log worker dan operations-health; jangan menandai sehat secara manual.
