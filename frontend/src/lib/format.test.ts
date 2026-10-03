import { describe, expect, it } from 'vitest';
import { daysLeft, formatBytes, relativeTime } from './format';

const now = new Date('2026-10-04T10:00:00+07:00').getTime();

describe('relativeTime', () => {
  it('บอกเป็นนาที ชั่วโมง และวัน', () => {
    expect(relativeTime(new Date(now - 30_000).toISOString(), now)).toBe('เมื่อสักครู่');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 นาทีที่แล้ว');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 ชั่วโมงที่แล้ว');
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2 วันที่แล้ว');
  });
});

describe('formatBytes', () => {
  it('เลือกหน่วยตามขนาด', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('daysLeft', () => {
  it('นับวันที่เหลือก่อนลบถาวร', () => {
    expect(daysLeft(new Date(now - 10 * 86_400_000).toISOString(), 30, now)).toBe(20);
    expect(daysLeft(new Date(now - 40 * 86_400_000).toISOString(), 30, now)).toBe(0);
  });
});
