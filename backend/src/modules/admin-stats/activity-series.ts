/// รวมตัวเลขกิจกรรมรายวันของแผงผู้ดูแล (แท็บ "กิจกรรม") — ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมีฐานข้อมูล
///
/// วันนับตามเวลาไทย (Asia/Bangkok, UTC+7 ไม่มีเวลาออมแสง) เพราะผู้ใช้ทั้งหมดอยู่ในคณะ
/// ข้อมูลเป็นยอดรวมเท่านั้น ไม่มีรายบุคคล

export const ACTIVITY_RANGES = [7, 30, 90] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

export const ACTIVITY_METRICS = [
  'designsCreated',
  'designsEdited',
  'uploads',
  'templatesPublished',
  'comments',
  'activeMembers',
] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

/// แถวที่ SQL คืนมา: metric + วัน (YYYY-MM-DD ตามเวลาไทย) + จำนวน
/// metric พิเศษ `activeMembersPeriod` ใช้ day = 'current' | 'previous' (นับคนไม่ซ้ำทั้งช่วง)
export interface ActivityRow {
  metric: string;
  day: string;
  count: bigint | number;
}

export type ActivityPoint = { date: string } & Record<ActivityMetric, number>;

export interface ActivityTrend {
  metric: ActivityMetric;
  current: number;
  previous: number;
  /// null = ช่วงก่อนหน้าเป็นศูนย์ (คิดร้อยละไม่ได้)
  changePercent: number | null;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export interface ActivityReport {
  days: ActivityRange;
  timeZone: 'Asia/Bangkok';
  from: string;
  to: string;
  series: ActivityPoint[];
  trends: ActivityTrend[];
}

const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/// วันที่ตามเวลาไทยของเวลาหนึ่ง เช่น 2026-10-06
export function bangkokDayKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/// เที่ยงคืนเวลาไทยของวันแรกในช่วง `days` วันล่าสุด (รวมวันนี้)
export function rangeStart(days: number, now: Date): Date {
  const todayMidnight = Date.parse(`${bangkokDayKey(now)}T00:00:00+07:00`);

  return new Date(todayMidnight - (days - 1) * DAY_MS);
}

/// วันทั้งหมดในช่วง เรียงเก่า → ใหม่ (ยาว `days` วัน จบที่วันนี้)
export function dayKeys(days: number, now: Date): string[] {
  const start = rangeStart(days, now).getTime();

  return Array.from({ length: days }, (_, i) => bangkokDayKey(new Date(start + i * DAY_MS)));
}

export function trendOf(metric: ActivityMetric, current: number, previous: number): ActivityTrend {
  const direction = current > previous ? 'UP' : current < previous ? 'DOWN' : 'FLAT';
  const changePercent = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

  return { metric, current, previous, changePercent, direction };
}

/// ประกอบผลลัพธ์จากแถวของ SQL ที่ครอบคลุม 2 เท่าของช่วง (ช่วงนี้ + ช่วงก่อนหน้าไว้เทียบเทรนด์)
/// วันที่ไม่มีแถวเติมเป็นศูนย์
export function assembleActivity(days: ActivityRange, now: Date, rows: ActivityRow[]): ActivityReport {
  const all = dayKeys(days * 2, now);
  const previousKeys = new Set(all.slice(0, days));
  const currentKeys = all.slice(days);
  const counts = new Map<string, number>();
  const period = { current: 0, previous: 0 };

  for (const row of rows) {
    const value = Number(row.count);

    if (row.metric === 'activeMembersPeriod') {
      if (row.day === 'current' || row.day === 'previous') period[row.day] = value;
      continue;
    }

    counts.set(`${row.metric}|${row.day}`, (counts.get(`${row.metric}|${row.day}`) ?? 0) + value);
  }

  const point = (date: string): ActivityPoint => {
    const p = { date } as ActivityPoint;

    for (const metric of ACTIVITY_METRICS) p[metric] = counts.get(`${metric}|${date}`) ?? 0;

    return p;
  };
  const series = currentKeys.map(point);
  const previousSeries = [...previousKeys].map(point);
  const sum = (points: ActivityPoint[], metric: ActivityMetric) => points.reduce((total, p) => total + p[metric], 0);

  const trends = ACTIVITY_METRICS.map((metric) =>
    metric === 'activeMembers'
      ? trendOf(metric, period.current, period.previous)
      : trendOf(metric, sum(series, metric), sum(previousSeries, metric)),
  );

  return { days, timeZone: 'Asia/Bangkok', from: currentKeys[0], to: currentKeys[currentKeys.length - 1], series, trends };
}
