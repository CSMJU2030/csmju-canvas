import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/csmju/providers';
import './globals.css';

// ฟอนต์อยู่ใน repo (app/fonts · สัญญาอนุญาต OFL แนบข้างไฟล์) — ห้ามใช้ next/font/google
// เพราะดาวน์โหลดจาก Google ตอน build (CI ของ org ล้มมาแล้วใน nexus)
// ฟอนต์ชุดเดียวกับ Core Hub: เนื้อความ Noto Sans Thai · หัวข้อ Plus Jakarta Sans
const notoThai = localFont({
  src: './fonts/NotoSansThai-Variable.ttf',
  variable: '--font-noto-thai',
  weight: '100 900',
});

const jakarta = localFont({
  src: './fonts/PlusJakartaSans-Variable.ttf',
  variable: '--font-jakarta',
  weight: '200 800',
});

/// ตั้งธีมก่อนเบราว์เซอร์วาดเฟรมแรก (ไม่ให้จอขาวแวบก่อนเป็นมืด)
/// ค่าจริงอยู่ในฐานข้อมูล (การตั้งค่าของผู้ใช้) — ที่นี่อ่านสำเนาที่หน้าเว็บจำไว้ล่าสุดเท่านั้น
/// ค่าเริ่มต้นคือ **สว่าง** แบบ Core Hub (PL 8 ต.ค. 2569) · มืดเมื่อผู้ใช้เลือก "มืด" หรือ "ตามระบบ" เอง
const THEME_BOOT = `try{var t=localStorage.getItem('csmju-canvas:theme');document.documentElement.dataset.theme=t==='dark'||t==='system'?t:'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export const metadata: Metadata = {
  title: { default: 'CS Canvas', template: '%s · CS Canvas' },
  description:
    'ระบบสร้างสื่อและกราฟิกของสาขาวิทยาการคอมพิวเตอร์ — สไลด์ ปกรายงาน โปสเตอร์ เกียรติบัตร และ Resume',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-theme="light" suppressHydrationWarning className={`${notoThai.variable} ${jakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
