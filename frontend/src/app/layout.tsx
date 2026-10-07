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

const thaiLooped = localFont({
  src: './fonts/NotoSansThaiLooped-Variable.ttf',
  variable: '--font-thai-looped',
  weight: '100 900',
});

const logo = localFont({
  src: './fonts/DancingScript-Variable.ttf',
  variable: '--font-logo',
  weight: '400 700',
});

/// ตั้งธีมก่อนเบราว์เซอร์วาดเฟรมแรก (ไม่ให้จอขาวแวบก่อนเป็นมืด)
/// ค่าจริงอยู่ในฐานข้อมูล (การตั้งค่าของผู้ใช้) — ที่นี่อ่านสำเนาที่หน้าเว็บจำไว้ล่าสุดเท่านั้น
const THEME_BOOT = `try{var t=localStorage.getItem('csmju-canvas:theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){document.documentElement.dataset.theme='system'}`;

export const metadata: Metadata = {
  title: { default: 'CS Canvas', template: '%s · CS Canvas' },
  description:
    'ระบบสร้างสื่อและกราฟิกของสาขาวิทยาการคอมพิวเตอร์ — สไลด์ ปกรายงาน โปสเตอร์ เกียรติบัตร และ Resume',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-theme="system" suppressHydrationWarning className={`${geist.variable} ${notoThai.variable} ${thaiLooped.variable} ${logo.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
