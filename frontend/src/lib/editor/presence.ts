import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

/// ผู้ร่วมงานแบบสด: เคอร์เซอร์พร้อมชื่อ ชิ้นที่แต่ละคนเลือก และแจ้งเมื่อมีคนบันทึกงาน (backend/src/modules/presence)
///
/// ต่อ socket.io ที่ `/realtime` บนโดเมนเดียวกับหน้าเว็บ (rewrite ไป backend) — คุกกี้ session ติดไปเอง ไม่มี token ในหน้าเว็บ
/// เริ่มด้วย long-polling (ผ่าน HTTP ได้ทุกที่) แล้วอัปเกรดเป็น WebSocket เองถ้าเซิร์ฟเวอร์เปิดให้
///
/// ป้ายของแต่ละคน: "เจ้าของงาน" / "ผู้ร่วมงาน #TEST" (ไม่เปิดเผยตัวตน) + ชื่อเล่นที่ตั้งเองได้ (เก็บในเครื่องนี้เท่านั้น)

export interface Peer {
  peerId: string;
  label: string;
  nickname: string | null;
  color: string;
  canEdit: boolean;
}

export interface PeerCursor {
  x: number;
  y: number;
  pageIndex: number;
  at: number;
}

export type PresenceStatus = 'off' | 'connecting' | 'live' | 'error';

interface PresenceState {
  status: PresenceStatus;
  /// เหตุผลเมื่อเชื่อมต่อไม่ได้
  error: string | null;
  /// ใช้ WebSocket จริง (ไม่ใช่ long-polling)
  websocket: boolean;
  self: Peer | null;
  peers: Record<string, Peer>;
  cursors: Record<string, PeerCursor>;
  selections: Record<string, string[]>;
  /// คนล่าสุดที่บันทึกงาน (แสดงแถบ "มีเวอร์ชันใหม่")
  savedBy: Peer | null;
  enabled: boolean;
  nickname: string;
  setEnabled(enabled: boolean): void;
  setNickname(nickname: string): void;
  dismissSaved(): void;
}

const ENABLED_KEY = 'csc-live';
const NICKNAME_KEY = 'csc-nickname';
const CURSOR_THROTTLE_MS = 40;
/// เคอร์เซอร์ที่ไม่ขยับเกินนี้ซ่อน (คนนั้นอาจสลับแท็บไปแล้ว)
export const CURSOR_IDLE_MS = 20_000;

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ใช้ได้เฉพาะหน้าที่เปิดอยู่
  }
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };

  delete next[key];

  return next;
}

let socket: Socket | null = null;
let joined: string | null = null;
let lastCursorSent = 0;
let pendingCursor: ReturnType<typeof setTimeout> | null = null;

export const usePresence = create<PresenceState>((set) => ({
  status: 'off',
  error: null,
  websocket: false,
  self: null,
  peers: {},
  cursors: {},
  selections: {},
  savedBy: null,
  enabled: typeof window === 'undefined' ? true : read(ENABLED_KEY, 'on') !== 'off',
  nickname: typeof window === 'undefined' ? '' : read(NICKNAME_KEY, ''),
  setEnabled(enabled) {
    write(ENABLED_KEY, enabled ? 'on' : 'off');
    set({ enabled });
  },
  setNickname(nickname) {
    const clean = nickname.replace(/\s+/g, ' ').slice(0, 30);

    write(NICKNAME_KEY, clean);
    set({ nickname: clean });
    socket?.emit('profile:update', { nickname: clean.trim() || null });
  },
  dismissSaved() {
    set({ savedBy: null });
  },
}));

export function peerName(p: Peer | null | undefined): string {
  if (!p) return '';

  return p.nickname ? `${p.nickname} (${p.label})` : p.label;
}

/// เริ่มเชื่อมต่อสำหรับงานนี้ · คืนฟังก์ชันตัดการเชื่อมต่อ
export function connectPresence(designId: string): () => void {
  disconnectPresence();

  const s = io(window.location.origin, {
    path: '/realtime',
    addTrailingSlash: false,
    transports: ['polling', 'websocket'],
    withCredentials: true,
    reconnectionDelayMax: 15_000,
  });

  socket = s;
  joined = designId;
  usePresence.setState({ status: 'connecting', error: null, peers: {}, cursors: {}, selections: {}, savedBy: null });

  const join = () => {
    s.emit('design:join', { designId, nickname: usePresence.getState().nickname.trim() || null }, (ack: { ok: true; self: Peer; peers: Peer[] } | { ok: false; error: string }) => {
      if (!ack?.ok) {
        usePresence.setState({ status: 'error', error: ack?.error === 'TOO_MANY_REQUESTS' ? 'มีคนเปิดงานนี้พร้อมกันเต็มแล้ว (30 คน)' : 'เข้าห้องผู้ร่วมงานไม่ได้' });
        return;
      }

      usePresence.setState({
        status: 'live',
        error: null,
        self: ack.self,
        peers: Object.fromEntries(ack.peers.map((p) => [p.peerId, p])),
        cursors: {},
        selections: {},
        websocket: s.io.engine?.transport?.name === 'websocket',
      });
    });
  };

  s.on('connect', join);
  s.io.engine?.on('upgrade', () => usePresence.setState({ websocket: true }));
  s.on('connect_error', (err) => usePresence.setState({ status: 'error', error: err.message === 'UNAUTHORIZED' ? 'หมดเวลาเข้าสู่ระบบ — รีเฟรชหน้า' : 'เชื่อมต่อผู้ร่วมงานแบบสดไม่ได้ กำลังลองใหม่' }));
  s.on('disconnect', () => usePresence.setState({ status: 'connecting', peers: {}, cursors: {}, selections: {} }));

  s.on('peer:joined', (p: Peer) => usePresence.setState((st) => ({ peers: { ...st.peers, [p.peerId]: p } })));
  s.on('peer:updated', (p: Peer) => usePresence.setState((st) => ({ peers: { ...st.peers, [p.peerId]: p } })));
  s.on('peer:left', ({ peerId }: { peerId: string }) =>
    usePresence.setState((st) => ({ peers: without(st.peers, peerId), cursors: without(st.cursors, peerId), selections: without(st.selections, peerId) })),
  );
  s.on('cursor:moved', ({ peerId, x, y, pageIndex }: { peerId: string; x: number | null; y: number | null; pageIndex: number }) =>
    usePresence.setState((st) => {
      if (x === null || y === null) return { cursors: without(st.cursors, peerId) };

      return { cursors: { ...st.cursors, [peerId]: { x, y, pageIndex, at: Date.now() } } };
    }),
  );
  s.on('selection:changed', ({ peerId, ids }: { peerId: string; ids: string[] }) => usePresence.setState((st) => ({ selections: { ...st.selections, [peerId]: ids } })));
  s.on('design:saved', ({ peerId }: { peerId: string }) => usePresence.setState((st) => ({ savedBy: st.peers[peerId] ?? null })));

  return () => {
    if (socket === s) disconnectPresence();
  };
}

export function disconnectPresence() {
  if (pendingCursor) clearTimeout(pendingCursor);
  pendingCursor = null;

  if (socket) {
    socket.emit('design:leave');
    socket.removeAllListeners();
    socket.close();
  }

  socket = null;
  joined = null;
  usePresence.setState({ status: 'off', self: null, peers: {}, cursors: {}, selections: {}, savedBy: null, websocket: false });
}

/// ตำแหน่งเมาส์ของเรา (พิกัดของหน้า `pageIndex`) · null = ออกนอกผืนผ้าใบ
export function sendCursor(point: { x: number; y: number } | null, pageIndex: number) {
  if (!socket || !joined || usePresence.getState().status !== 'live') return;

  const emit = () => {
    lastCursorSent = Date.now();
    pendingCursor = null;
    socket?.emit('cursor:move', point ? { x: point.x, y: point.y, pageIndex } : { x: null, y: null, pageIndex });
  };
  const wait = CURSOR_THROTTLE_MS - (Date.now() - lastCursorSent);

  if (pendingCursor) clearTimeout(pendingCursor);
  if (wait <= 0 || !point) emit();
  else pendingCursor = setTimeout(emit, wait);
}

export function sendSelection(ids: string[]) {
  if (socket && joined && usePresence.getState().status === 'live') socket.emit('selection:change', { ids: ids.slice(0, 50) });
}

/// เราบันทึกงานแล้ว — แจ้งคนอื่นในห้อง
export function announceSaved() {
  if (socket && joined && usePresence.getState().status === 'live') socket.emit('design:saved');
}
