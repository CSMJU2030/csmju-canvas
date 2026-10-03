import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-csmju-h2 font-semibold text-ink">ไม่พบหน้านี้</h1>
        <p className="mt-2 text-csmju-body text-muted">ลิงก์อาจผิด หรืองานถูกลบไปแล้ว</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-csmju-body font-medium text-on-inverse hover:bg-primary-hover">
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
