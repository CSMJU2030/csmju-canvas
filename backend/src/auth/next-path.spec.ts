import { describe, expect, it } from 'vitest';
import { safeNextPath } from './next-path.js';
import {
  buildStateCookie,
  createSsoState,
  readStateCookie,
  ssoCookieNames,
  timingSafeEqualString,
} from './sso-session.js';

/// กฎของ `next` ตาม auth-contract.md ข้อ 5.2 — กัน open redirect
describe('safeNextPath', () => {
  it.each(['/projects', '/templates?q=1', '/design/abc#page-2', '/'])(
    'ยอม path ภายใน %s',
    (value) => {
      expect(safeNextPath(value)).toBe(value);
    },
  );

  it.each([
    ['ไม่ใช่ string', 42],
    ['ว่าง', ''],
    ['ยาวเกิน 512', `/${'a'.repeat(512)}`],
    ['ไม่ขึ้นต้นด้วย /', 'projects'],
    ['URL เต็ม', 'https://evil.example.com/'],
    ['//host', '//evil.example.com'],
    ['/\\host', '/\\evil.example.com'],
    ['อักขระควบคุม', '/projects\nSet-Cookie: x'],
    ['DEL', '/projects\u007f'],
    ['/auth', '/auth'],
    ['/auth/login', '/auth/login?next=/projects'],
    ['/AUTH ตัวใหญ่', '/AUTH/callback'],
    ['/%61uth เข้ารหัส', '/%61uth/login'],
    ['% ที่ถอดรหัสไม่ได้', '/%E0%A4%A'],
  ])('ปฏิเสธ %s', (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });
});

describe('คุกกี้ state (auth-contract.md ข้อ 5.2)', () => {
  it('ชื่อคุกกี้ขึ้นต้นด้วยชื่อระบบ', () => {
    expect(ssoCookieNames('csmju-canvas')).toEqual({
      session: 'csmju_canvas_access_token',
      state: 'csmju_canvas_sso_state',
    });
  });

  it('state สุ่ม 32 ไบต์ base64url', () => {
    const state = createSsoState();

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createSsoState()).not.toBe(state);
  });

  it('คุกกี้ HttpOnly · Lax · Path=/auth/callback · อายุไม่เกิน 600 วินาที', () => {
    const cookie = buildStateCookie('s', 'abc', '/projects', false);

    expect(cookie).toMatch(/^s=abc\.[A-Za-z0-9_-]+; /);
    expect(cookie).toContain('Path=/auth/callback');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).not.toContain('Secure');
    expect(buildStateCookie('s', 'abc', '/projects', true)).toContain('Secure');
  });

  it('อ่านกลับได้ทั้ง state และหน้าที่จะกลับไป', () => {
    const pair = buildStateCookie('s', 'abc', '/reels?x=1', false).split(';')[0];

    expect(readStateCookie(`other=1; ${pair}`, 's')).toEqual({
      state: 'abc',
      landing: '/reels?x=1',
    });
  });

  it('คุกกี้เข้ารหัสผิดถือว่าไม่มี ไม่โยน error', () => {
    expect(readStateCookie('s=%', 's')).toBeNull();
  });

  it('เทียบ state แบบ constant-time', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(false);
  });
});
