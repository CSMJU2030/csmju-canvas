import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const fake = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = {
    on: (event: string, fn: Handler) => handlers.set(event, fn),
    emit: (event: string, payload?: unknown, ack?: Handler) => {
      emitted.push({ event, payload });
      if (event === 'design:join' && ack) ack({ ok: true, self: { peerId: 'me', label: 'เจ้าของงาน', nickname: null, color: 'rgb(0 0 0)', canEdit: true }, peers: [{ peerId: 'p1', label: 'ผู้ร่วมงาน #TEST', nickname: 'บี', color: 'rgb(1 2 3)', canEdit: true }] });
    },
    removeAllListeners: () => handlers.clear(),
    close: () => undefined,
    io: { engine: { transport: { name: 'polling' }, on: () => undefined } },
  };

  return { handlers, emitted, socket, io: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({ io: fake.io }));

import { connectPresence, disconnectPresence, peerName, sendCursor, usePresence } from './presence';

const DESIGN = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('ผู้ร่วมงานแบบสด (หน้าเว็บ)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.emitted.length = 0;
  });

  afterEach(() => {
    disconnectPresence();
    vi.useRealTimers();
  });

  it('ต่อที่ /realtime บนโดเมนเดียวกัน · เข้าห้องแล้วเห็นผู้ร่วมงาน · เคอร์เซอร์และออกจากห้องอัปเดตสถานะ', () => {
    connectPresence(DESIGN);

    expect(fake.io).toHaveBeenCalledWith(window.location.origin, expect.objectContaining({ path: '/realtime', addTrailingSlash: false, withCredentials: true }));

    fake.handlers.get('connect')!();

    expect(fake.emitted[0]).toMatchObject({ event: 'design:join', payload: { designId: DESIGN } });
    expect(usePresence.getState()).toMatchObject({ status: 'live', self: { peerId: 'me' } });
    expect(Object.keys(usePresence.getState().peers)).toEqual(['p1']);

    fake.handlers.get('cursor:moved')!({ peerId: 'p1', x: 10, y: 20, pageIndex: 0 });
    expect(usePresence.getState().cursors.p1).toMatchObject({ x: 10, y: 20, pageIndex: 0 });

    fake.handlers.get('selection:changed')!({ peerId: 'p1', ids: ['el-1'] });
    expect(usePresence.getState().selections.p1).toEqual(['el-1']);

    fake.handlers.get('design:saved')!({ peerId: 'p1' });
    expect(peerName(usePresence.getState().savedBy)).toBe('บี (ผู้ร่วมงาน #TEST)');

    fake.handlers.get('peer:left')!({ peerId: 'p1' });
    expect(usePresence.getState().peers).toEqual({});
    expect(usePresence.getState().cursors).toEqual({});
  });

  it('ส่งเคอร์เซอร์ไม่ถี่เกิน 40 ms (ค่าสุดท้ายถูกส่งเสมอ)', () => {
    connectPresence(DESIGN);
    fake.handlers.get('connect')!();
    fake.emitted.length = 0;

    sendCursor({ x: 1, y: 1 }, 0);
    sendCursor({ x: 2, y: 2 }, 0);
    sendCursor({ x: 3, y: 3 }, 0);

    expect(fake.emitted.filter((e) => e.event === 'cursor:move')).toHaveLength(1);

    vi.advanceTimersByTime(50);

    const moves = fake.emitted.filter((e) => e.event === 'cursor:move');

    expect(moves).toHaveLength(2);
    expect(moves[1].payload).toEqual({ x: 3, y: 3, pageIndex: 0 });
  });
});
