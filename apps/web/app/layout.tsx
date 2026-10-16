import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Karyanesia · Ruang Operasional',
  description: 'Siap Kerja. Terampil Berkarya. Kelola kesiapan tenaga kerja operasional.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
