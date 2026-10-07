import { Module } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createHash } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CoreHubTokenVerifier } from '../../auth/core-hub-token.verifier.js';
import { extractToken } from '../../auth/core-hub-jwt.guard.js';
import type { CoreHubUser } from '../../common/auth/core-user.js';
import { DesignsModule } from '../designs/designs.module.js';
import { DesignsService } from '../designs/designs.service.js';

/// ผู้ร่วมงานแบบสด (live cursors) — เห็นเคอร์เซอร์ ชิ้นที่กำลังเลือก และรู้เมื่อมีคนบันทึกงาน
///
/// **ทางเชื่อมต่อ:** socket.io ที่ path `/realtime` บนโดเมนเดียวกับหน้าเว็บ (frontend rewrite `/realtime` → backend)
///   - ใช้ long-polling ผ่าน HTTP ได้ทันทีโดยไม่ต้องตั้งค่า server เพิ่ม · ถ้า DevOps เปิด WebSocket upgrade
///     ของ path นี้ไปที่ container api ไคลเอนต์จะอัปเกรดเป็น WebSocket เอง (เร็วขึ้น ไม่ต้องแก้โค้ด)
///   - ตัวตนมาจากคุกกี้ session เดียวกับ REST (HttpOnly · ส่งมาเองเพราะ same-origin) ตรวจด้วยตัวตรวจ 10 ขั้นตัวเดียวกัน
///
/// **ความเป็นส่วนตัว:** ไม่ส่ง coreUserId อีเมล หรือชื่อจริงให้ผู้อื่น — ใช้ป้ายแบบเดียวกับความคิดเห็น
/// ("เจ้าของงาน" / "ผู้ร่วมงาน #A1B2") และชื่อเล่นที่ผู้ใช้ตั้งเอง (อยู่ในหน่วยความจำ ไม่บันทึกลงฐาน)
///
/// **ข้อจำกัด:** สถานะอยู่ในหน่วยความจำของโพรเซส ใช้ได้กับ api instance เดียว (deployment ปัจจุบัน)

export const REALTIME_PATH = '/realtime';
const MAX_PEERS_PER_DESIGN = 30;
const CURSOR_MIN_INTERVAL_MS = 30;
const MAX_SELECTION = 50;
const NICKNAME_MAX = 30;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/// สีเคอร์เซอร์ (สีเดียวกับสีประเภทงานใน design system เขียนเป็น rgb เพราะส่งเป็นข้อมูล ไม่ใช่สไตล์ของหน้า)
const PEER_COLORS = ['rgb(14 165 233)', 'rgb(236 72 153)', 'rgb(34 197 94)', 'rgb(249 115 22)', 'rgb(139 92 246)', 'rgb(20 184 166)', 'rgb(234 179 8)', 'rgb(239 68 68)'];

export interface Peer {
  peerId: string;
  label: string;
  nickname: string | null;
  color: string;
  canEdit: boolean;
}

interface PeerState extends Peer {
  user: CoreHubUser;
  designId: string | null;
  lastCursorAt: number;
}

export type JoinAck = { ok: true; self: Peer; peers: Peer[] } | { ok: false; error: string };

/// รหัสสั้นของผู้ร่วมงาน — สูตรเดียวกับความคิดเห็น (comments.ts) คนเดียวกันได้รหัสเดียวกันทั้งสองที่
export function peerTag(coreUserId: string): string {
  return createHash('sha256').update(`csc-comment:${coreUserId}`).digest('hex').slice(0, 4).toUpperCase();
}

export function cleanNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  // ตัดอักขระควบคุมและช่องว่างซ้ำ
  const text = Array.from(value.replace(/\s+/g, ' ').trim())
    .filter((ch) => ch.codePointAt(0)! >= 0x20 && ch.codePointAt(0) !== 0x7f)
    .join('')
    .slice(0, NICKNAME_MAX);

  return text || null;
}

export const designRoom = (designId: string) => `design:${designId}`;

function publicPeer(p: PeerState): Peer {
  return { peerId: p.peerId, label: p.label, nickname: p.nickname, color: p.color, canEdit: p.canEdit };
}

function finite(n: unknown, limit = 1_000_000): number | null {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 10) / 10 : null;
}

@WebSocketGateway({
  path: REALTIME_PATH,
  addTrailingSlash: false,
  serveClient: false,
  // same-origin ผ่าน rewrite ของหน้าเว็บ — ไม่เปิด CORS ให้เว็บอื่นต่อเข้ามา
  cors: false,
  // ต่ำกว่า timeout ของ proxy ใน Next (30 วินาที) เพื่อให้ long-polling ไม่ถูกตัดกลางทาง
  pingInterval: 20_000,
  pingTimeout: 20_000,
  maxHttpBufferSize: 64 * 1024,
})
export class PresenceGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  private readonly peers = new Map<string, PeerState>();

  constructor(
    private readonly verifier: CoreHubTokenVerifier,
    private readonly designs: DesignsService,
  ) {}

  /// ตรวจตัวตนก่อนเชื่อมต่อสำเร็จ — ไม่ผ่าน = connect_error (ไม่ log token หรือ header)
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = extractToken({ headers: socket.handshake.headers } as Parameters<typeof extractToken>[0]);

      this.verifier
        .verify(token)
        .then(({ user }) => {
          (socket.data as { user?: CoreHubUser }).user = user;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  handleDisconnect(socket: Socket): void {
    this.leave(socket);
  }

  @SubscribeMessage('design:join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { designId?: unknown; nickname?: unknown }): Promise<JoinAck> {
    const user = (socket.data as { user?: CoreHubUser }).user;
    const designId = typeof body?.designId === 'string' ? body.designId : '';

    if (!user) return { ok: false, error: 'UNAUTHORIZED' };
    if (!UUID_V4.test(designId)) return { ok: false, error: 'BAD_REQUEST' };

    let access: 'OWNER' | 'EDIT' | 'COMMENT' | 'VIEW';

    try {
      access = (await this.designs.accessible(user.coreUserId, designId, 'read')).access;
    } catch {
      return { ok: false, error: 'NOT_FOUND' };
    }

    const room = designRoom(designId);
    const others = [...this.peers.values()].filter((p) => p.designId === designId && p.peerId !== socket.id);

    if (others.length >= MAX_PEERS_PER_DESIGN) return { ok: false, error: 'TOO_MANY_REQUESTS' };

    this.leave(socket);

    const tag = peerTag(user.coreUserId);
    const state: PeerState = {
      peerId: socket.id,
      label: access === 'OWNER' ? 'เจ้าของงาน' : `ผู้ร่วมงาน #${tag}`,
      nickname: cleanNickname(body?.nickname),
      color: PEER_COLORS[parseInt(tag, 16) % PEER_COLORS.length],
      canEdit: access === 'OWNER' || access === 'EDIT',
      user,
      designId,
      lastCursorAt: 0,
    };

    this.peers.set(socket.id, state);
    await socket.join(room);
    socket.to(room).emit('peer:joined', publicPeer(state));

    return { ok: true, self: publicPeer(state), peers: others.map(publicPeer) };
  }

  @SubscribeMessage('design:leave')
  leaveDesign(@ConnectedSocket() socket: Socket): void {
    this.leave(socket);
  }

  @SubscribeMessage('cursor:move')
  cursor(@ConnectedSocket() socket: Socket, @MessageBody() body: { x?: unknown; y?: unknown; pageIndex?: unknown }): void {
    const peer = this.peers.get(socket.id);

    if (!peer?.designId) return;

    const now = Date.now();

    // เคอร์เซอร์ส่งถี่ได้ไม่เกิน ~30 ครั้งต่อวินาทีต่อคน
    if (now - peer.lastCursorAt < CURSOR_MIN_INTERVAL_MS) return;
    peer.lastCursorAt = now;

    const x = finite(body?.x);
    const y = finite(body?.y);
    const pageIndex = finite(body?.pageIndex, 10_000);

    socket.to(designRoom(peer.designId)).emit('cursor:moved', x === null || y === null || pageIndex === null ? { peerId: peer.peerId, x: null, y: null, pageIndex: 0 } : { peerId: peer.peerId, x, y, pageIndex: Math.round(pageIndex) });
  }

  @SubscribeMessage('selection:change')
  selection(@ConnectedSocket() socket: Socket, @MessageBody() body: { ids?: unknown }): void {
    const peer = this.peers.get(socket.id);

    if (!peer?.designId) return;

    const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && v.length <= 80).slice(0, MAX_SELECTION) : [];

    socket.to(designRoom(peer.designId)).emit('selection:changed', { peerId: peer.peerId, ids });
  }

  @SubscribeMessage('profile:update')
  profile(@ConnectedSocket() socket: Socket, @MessageBody() body: { nickname?: unknown }): void {
    const peer = this.peers.get(socket.id);

    if (!peer?.designId) return;

    peer.nickname = cleanNickname(body?.nickname);
    socket.to(designRoom(peer.designId)).emit('peer:updated', publicPeer(peer));
  }

  /// ผู้ที่แก้ได้บันทึกงานแล้ว — คนอื่นในห้องเห็นว่ามีเวอร์ชันใหม่ (เลือกโหลดล่าสุดได้)
  @SubscribeMessage('design:saved')
  saved(@ConnectedSocket() socket: Socket): void {
    const peer = this.peers.get(socket.id);

    if (!peer?.designId || !peer.canEdit) return;

    socket.to(designRoom(peer.designId)).emit('design:saved', { peerId: peer.peerId });
  }

  private leave(socket: Socket): void {
    const peer = this.peers.get(socket.id);

    if (!peer) return;

    this.peers.delete(socket.id);

    if (peer.designId) {
      const room = designRoom(peer.designId);

      void socket.leave(room);
      this.server?.to(room).emit('peer:left', { peerId: peer.peerId });
    }
  }

  /// จำนวนคนที่กำลังเปิดงานชิ้นนี้
  peersIn(designId: string): number {
    return [...this.peers.values()].filter((p) => p.designId === designId).length;
  }
}

@Module({ imports: [DesignsModule], providers: [PresenceGateway] })
export class PresenceModule {}
