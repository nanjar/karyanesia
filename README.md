# Karyanesia

**Siap Kerja. Terampil Berkarya.**

Platform B2B SaaS untuk onboarding, pelatihan mikro, SOP harian, dan pengembangan kompetensi tenaga kerja operasional.

## Status

Implementasi dimulai pada milestone fondasi organisasi: autentikasi multi-tenant, MFA admin, aktivasi staf, scope cabang, direktori staf, impor CSV dua tahap dan audit. Ini belum rilis lengkap v0.0.1. Fondasi materi teks berversi dan kuis teori tersedia. Video menggunakan tautan YouTube saja. Editor jalur onboarding berversi tersedia bagi admin. Penugasan staf dengan pratinjau target dan tenggat tersedia. Progres teori dihitung dari versi modul yang sama. Rubrik praktik berversi dan snapshot kriterianya tersedia. Pengisian/pengesahan observasi, penerapan prasyarat pada tugas dan SOP masih tahap berikutnya.

- [Panduan instalasi dan development](docs/DEVELOPMENT.md)
- [Status implementasi dan pekerjaan berikutnya](docs/IMPLEMENTATION-STATUS.md)
- [Panduan UI Clean-Glassify](docs/design/CLEAN-GLASSIFY.md)
- [PRD lengkap v0.0.1](docs/PRD-Karyanesia-v0.0.1.md)
- [PowerPoint investor dan CTO](docs/presentations/Karyanesia-Investor-CTO-v0.0.1.pptx)

## Struktur

```text
apps/api/                     NestJS REST API dan integration tests
apps/web/                     Next.js web responsif
packages/database/migrations/ PostgreSQL schema migrations
docs/                         PRD, presentasi, dan panduan
```

## Mulai

Node.js 22.14+, npm, PostgreSQL 16. Konfigurasi `.env` dan MFA sesuai panduan sebelum menjalankan:

```bash
npm ci
npm run db:migrate
npm run bootstrap
npm run dev:api
# terminal terpisah
npm run dev:web
```

Tidak ada password default. Seluruh pengembangan dan source code Karyanesia dikelola di repository ini. Target pilot serta model komersial pada PRD masih merupakan asumsi perencanaan.
