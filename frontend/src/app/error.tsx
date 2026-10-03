'use client';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-csmju-h2 font-semibold text-ink">หน้านี้ทำงานผิดพลาด</h1>
        <p className="mt-2 text-csmju-body text-muted">{error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'}</p>
        <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-csmju-body font-medium text-on-inverse hover:bg-primary-hover">
          ลองอีกครั้ง
        </button>
      </div>
    </div>
  );
}
