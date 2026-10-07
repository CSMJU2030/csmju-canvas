import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { PresenceGateway, cleanNickname, peerTag } from './presence.gateway.js';

const DESIGN = '0f8fad5b-d9cb-469f-a165-70867728950e';

function fakeSocket(id: string, coreUserId: string) {
  const sent: { room: string; event: string; payload: unknown }[] = [];
  const socket = {
    id,
    data: { user: { coreUserId, email: `${coreUserId}@example.test`, coreRole: 'student' } },
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    to: (room: string) => ({ emit: (event: string, payload: unknown) => sent.push({ room, event, payload }) }),
  };

  return { socket: socket as unknown as Socket, sent };
}

function gateway(access: Record<string, 'OWNER' | 'EDIT' | 'VIEW'>) {
  const designs = {
    accessible: vi.fn(async (coreUserId: string) => {
      const a = access[coreUserId];

      if (!a) throw new NotFoundException();

      return { access: a };
    }),
  };
  const serverSent: { room: string; event: string; payload: unknown }[] = [];
  const gw = new PresenceGateway({} as never, designs as never);

  (gw as unknown as { server: unknown }).server = { to: (room: string) => ({ emit: (event: string, payload: unknown) => serverSent.push({ room, event, payload }) }) };

  return { gw, serverSent };
}

describe('ผู้ร่วมงานแบบสด', () => {
  it('เข้าห้องได้เฉพาะคนที่เปิดงานได้ · ไม่ส่ง coreUserId หรืออีเมลให้ผู้อื่น', async () => {
    const { gw } = gateway({ owner: 'OWNER', friend: 'EDIT' });
    const a = fakeSocket('s1', 'owner');
    const b = fakeSocket('s2', 'friend');
    const stranger = fakeSocket('s3', 'stranger');

    const first = await gw.join(a.socket, { designId: DESIGN, nickname: '  พีท  ' });

    expect(first).toMatchObject({ ok: true, self: { label: 'เจ้าของงาน', nickname: 'พีท', canEdit: true }, peers: [] });

    const second = await gw.join(b.socket, { designId: DESIGN });

    expect(second.ok && second.peers.map((p) => p.peerId)).toEqual(['s1']);
    expect(second.ok && second.self.label).toBe(`ผู้ร่วมงาน #${peerTag('friend')}`);
    expect(JSON.stringify(second)).not.toMatch(/friend|owner|example/);

    // คนที่ไม่มีสิทธิ์ = NOT_FOUND · id ผิดรูป = BAD_REQUEST
    expect(await gw.join(stranger.socket, { designId: DESIGN })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await gw.join(a.socket, { designId: 'not-a-uuid' })).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(gw.peersIn(DESIGN)).toBe(2);
  });

  it('ส่งเคอร์เซอร์ให้คนอื่นในห้อง (จำกัดความถี่) · ออกจากห้องแล้วแจ้งทุกคน', async () => {
    const { gw, serverSent } = gateway({ owner: 'OWNER', friend: 'VIEW' });
    const a = fakeSocket('s1', 'owner');
    const b = fakeSocket('s2', 'friend');

    await gw.join(a.socket, { designId: DESIGN });
    await gw.join(b.socket, { designId: DESIGN });

    gw.cursor(a.socket, { x: 10.123, y: 20, pageIndex: 1 });
    gw.cursor(a.socket, { x: 11, y: 21, pageIndex: 1 });

    const moves = a.sent.filter((s) => s.event === 'cursor:moved');

    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ room: `design:${DESIGN}`, event: 'cursor:moved', payload: { peerId: 's1', x: 10.1, y: 20, pageIndex: 1 } });

    // คนดูอย่างเดียวส่ง "บันทึกแล้ว" ไม่ได้
    gw.saved(b.socket);
    expect(b.sent.some((s) => s.event === 'design:saved')).toBe(false);
    gw.saved(a.socket);
    expect(a.sent.some((s) => s.event === 'design:saved')).toBe(true);

    gw.handleDisconnect(b.socket);
    expect(serverSent).toContainEqual({ room: `design:${DESIGN}`, event: 'peer:left', payload: { peerId: 's2' } });
    expect(gw.peersIn(DESIGN)).toBe(1);
  });

  it('ชื่อเล่นตัดอักขระควบคุมและยาวไม่เกิน 30 ตัว', () => {
    expect(cleanNickname('a\u0000b\u0007  c')).toBe('ab c');
    expect(cleanNickname('ก'.repeat(50))?.length).toBe(30);
    expect(cleanNickname('   ')).toBeNull();
    expect(cleanNickname(42)).toBeNull();
  });
});
