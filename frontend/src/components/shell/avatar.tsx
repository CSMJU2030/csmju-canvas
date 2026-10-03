import { cx } from '../csmju/primitives';

export const ROLE_LABEL: Record<string, string> = {
  student: 'นักศึกษา',
  alumni: 'ศิษย์เก่า',
  staff: 'บุคลากร',
  lecturer: 'อาจารย์',
  guest: 'ผู้เยี่ยมชม',
  admin: 'ผู้ดูแลระบบ',
};

/// วงกลมตัวอักษรแรกของชื่อ (ไม่ใช้รูปโปรไฟล์ — รูปเป็นของ Core Hub ซึ่งระบบย่อยดึงไม่ได้)
export function Avatar({ email, size = 'md' }: { email: string; size?: 'sm' | 'md' | 'lg' }) {
  const initial = (email.split('@')[0] || '?').slice(0, 1).toUpperCase();

  return (
    <span
      aria-hidden
      className={cx(
        'csmju-gradient-button flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'lg' ? 'size-14 text-csmju-h3' : size === 'sm' ? 'size-7 text-csmju-caption' : 'size-10 text-csmju-body',
      )}
    >
      {initial}
    </span>
  );
}
