import { describe, expect, it, vi } from 'vitest';
import { AdminStatsService } from './admin-stats.service.js';
import { assembleActivity, bangkokDayKey, dayKeys, rangeStart, trendOf } from './activity-series.js';

// 6 ต.ค. 2569 (2026) 01:30 เวลาไทย = 5 ต.ค. 18:30 UTC — วันตามเวลาไทยต้องเป็นวันที่ 6
const NOW = new Date('2026-10-05T18:30:00Z');

describe('activity-series', () => {
  it('นับวันตามเวลาไทย ไม่ใช่ UTC', () => {
    expect(bangkokDayKey(NOW)).toBe('2026-10-06');
    expect(rangeStart(1, NOW).toISOString()).toBe('2026-10-05T17:00:00.000Z');
  });

  it('dayKeys ยาวเท่าช่วง เรียงเก่าไปใหม่ จบที่วันนี้', () => {
    const keys = dayKeys(7, NOW);

    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-09-30');
    expect(keys[6]).toBe('2026-10-06');
  });

  it('เติมศูนย์ให้วันที่ไม่มีข้อมูล และแยกช่วงนี้กับช่วงก่อนหน้า', () => {
    const report = assembleActivity(7, NOW, [
      { metric: 'designsCreated', day: '2026-10-06', count: 3n },
      { metric: 'designsCreated', day: '2026-10-01', count: 2n },
      // ช่วงก่อนหน้า (23–29 ก.ย.)
      { metric: 'designsCreated', day: '2026-09-25', count: 10n },
      { metric: 'uploads', day: '2026-10-02', count: 4 },
      { metric: 'activeMembers', day: '2026-10-06', count: 2n },
      { metric: 'activeMembersPeriod', day: 'current', count: 5n },
      { metric: 'activeMembersPeriod', day: 'previous', count: 4n },
    ]);

    expect(report.from).toBe('2026-09-30');
    expect(report.to).toBe('2026-10-06');
    expect(report.series).toHaveLength(7);
    expect(report.series[6]).toEqual({
      date: '2026-10-06',
      designsCreated: 3,
      designsEdited: 0,
      uploads: 0,
      templatesPublished: 0,
      comments: 0,
      activeMembers: 2,
    });
    expect(report.series.some((p) => p.date === '2026-09-25')).toBe(false);

    const created = report.trends.find((t) => t.metric === 'designsCreated');

    expect(created).toEqual({ metric: 'designsCreated', current: 5, previous: 10, changePercent: -50, direction: 'DOWN' });

    const active = report.trends.find((t) => t.metric === 'activeMembers');

    // คนไม่ซ้ำทั้งช่วง ไม่ใช่ผลรวมรายวัน
    expect(active).toMatchObject({ current: 5, previous: 4, changePercent: 25, direction: 'UP' });

    const uploads = report.trends.find((t) => t.metric === 'uploads');

    expect(uploads).toMatchObject({ current: 4, previous: 0, changePercent: null, direction: 'UP' });
  });

  it('trendOf: เท่ากันเป็น FLAT', () => {
    expect(trendOf('comments', 0, 0)).toEqual({ metric: 'comments', current: 0, previous: 0, changePercent: null, direction: 'FLAT' });
  });
});

describe('AdminStatsService.activity', () => {
  it('ส่งช่วง 2 เท่าให้ SQL แล้วประกอบผลจากแถวที่ได้', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ metric: 'comments', day: '2026-10-05', count: 7n }]);
    const service = new AdminStatsService({ $queryRaw: queryRaw } as never);
    const report = await service.activity(30, NOW);

    expect(queryRaw).toHaveBeenCalledTimes(1);

    // พารามิเตอร์แรกของ SQL คือ since = เที่ยงคืนไทยของ 60 วันก่อน (รวมวันนี้)
    const since = queryRaw.mock.calls[0][1] as Date;

    expect(since.toISOString()).toBe(rangeStart(60, NOW).toISOString());
    expect(report.days).toBe(30);
    expect(report.series).toHaveLength(30);
    expect(report.series.find((p) => p.date === '2026-10-05')?.comments).toBe(7);
  });
});
