/// วันเวลาและขนาดไฟล์แบบภาษาไทย (เขตเวลา Asia/Bangkok ตามเครื่องผู้ใช้)

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();

  if (diff < MINUTE) return 'เมื่อสักครู่';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} นาทีที่แล้ว`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} ชั่วโมงที่แล้ว`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} วันที่แล้ว`;

  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function daysLeft(trashedAt: string, retentionDays = 30, now: number = Date.now()): number {
  const expires = new Date(trashedAt).getTime() + retentionDays * DAY;

  return Math.max(0, Math.ceil((expires - now) / DAY));
}
