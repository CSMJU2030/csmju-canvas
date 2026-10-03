import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/csmju/providers';
import './globals.css';

// ฟอนต์อยู่ใน repo (app/fonts · สัญญาอนุญาต OFL แนบข้างไฟล์) — ห้ามใช้ next/font/google
// เพราะดาวน์โหลดจาก Google ตอน build (CI ของ org ล้มมาแล้วใน nexus)
const geist = localFont({
  src: './fonts/Geist-Variable.ttf',
  variable: '--font-geist',
  weight: '100 900',
});

const notoThai = localFont({
  src: './fonts/NotoSansThai-Variable.ttf',
  variable: '--font-noto-thai',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: { default: 'CS Canvas', template: '%s · CS Canvas' },
  description:
    'ระบบสร้างสื่อและกราฟิกของสาขาวิทยาการคอมพิวเตอร์ — สไลด์ ปกรายงาน โปสเตอร์ เกียรติบัตร และ Resume',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${geist.variable} ${notoThai.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
