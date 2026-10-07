/// ตารางคีย์ลัดทั้งหมดของหน้าแก้ไข — ที่เดียวที่ใช้ทั้งหน้ารวมคีย์ลัด (Ctrl+/), บทความ /help/shortcuts และป๊อปอัปมุมขวา
///
/// `keys` เขียนแบบกลาง: `Mod` = Ctrl บน Windows/Linux และ ⌘ บน macOS · คั่นปุ่มด้วย `+` · ทางเลือกอื่นคั่นด้วย ` / `

export interface Shortcut {
  keys: string;
  label: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'แก้ไข',
    items: [
      { keys: 'Mod+Z', label: 'เลิกทำ' },
      { keys: 'Mod+Shift+Z / Mod+Y', label: 'ทำซ้ำ' },
      { keys: 'Mod+C', label: 'คัดลอก' },
      { keys: 'Mod+X', label: 'ตัด' },
      { keys: 'Mod+V', label: 'วาง (ชิ้นงาน รูป ไฟล์ หรือข้อความจากที่อื่น)' },
      { keys: 'Mod+Shift+V', label: 'วางที่ตำแหน่งเดิม' },
      { keys: 'Mod+D', label: 'ทำสำเนา' },
      { keys: 'Delete / Backspace', label: 'ลบ' },
      { keys: 'Mod+A', label: 'เลือกทั้งหมดในหน้า' },
      { keys: 'Esc', label: 'ยกเลิกการเลือก' },
      { keys: 'Mod+Alt+C', label: 'คัดลอกสไตล์ (แล้วคลิกชิ้นที่จะวาง)' },
      { keys: 'Mod+F', label: 'ค้นหาและแทนที่ข้อความ' },
      { keys: 'Mod+S', label: 'บันทึกทันที' },
    ],
  },
  {
    title: 'จัดวาง',
    items: [
      { keys: '← ↑ → ↓', label: 'เลื่อนทีละ 1 px' },
      { keys: 'Shift+ลูกศร', label: 'เลื่อนทีละ 10 px' },
      { keys: 'Mod+G', label: 'จัดกลุ่ม' },
      { keys: 'Mod+Shift+G', label: 'แยกกลุ่ม' },
      { keys: 'Mod+]', label: 'ยกขึ้นหนึ่งชั้น' },
      { keys: 'Mod+[', label: 'ส่งลงหนึ่งชั้น' },
      { keys: 'Mod+Alt+]', label: 'ยกขึ้นบนสุด' },
      { keys: 'Mod+Alt+[', label: 'ส่งลงล่างสุด' },
      { keys: 'Alt+Shift+L', label: 'ล็อก / ปลดล็อก' },
      { keys: 'Alt+1', label: 'แผงตำแหน่ง' },
      { keys: 'Alt+ลาก', label: 'ทำสำเนาขณะลาก' },
      { keys: 'Shift+ลาก', label: 'ล็อกแนวนอน / แนวตั้ง' },
    ],
  },
  {
    title: 'ข้อความ',
    items: [
      { keys: 'Enter', label: 'แก้ข้อความที่เลือก' },
      { keys: 'Mod+B', label: 'ตัวหนา' },
      { keys: 'Mod+I', label: 'ตัวเอียง' },
      { keys: 'Mod+U', label: 'ขีดเส้นใต้' },
      { keys: 'Mod+Shift+L', label: 'จัดชิดซ้าย' },
      { keys: 'Mod+Shift+E', label: 'จัดกึ่งกลาง' },
      { keys: 'Mod+Shift+R', label: 'จัดชิดขวา' },
      { keys: 'Mod+Shift+J', label: 'จัดเต็มบรรทัด' },
      { keys: 'Mod+Shift+K', label: 'ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)' },
      { keys: 'Mod+Shift+. / Mod+Shift+,', label: 'ขยาย / ลดขนาดตัวอักษร' },
      { keys: 'Mod+K', label: 'ใส่ลิงก์' },
    ],
  },
  {
    title: 'หน้า',
    items: [
      { keys: 'Mod+Enter', label: 'เพิ่มหน้าใหม่' },
      { keys: 'Mod+Backspace', label: 'ลบหน้าปัจจุบัน' },
      { keys: 'PageDown / PageUp', label: 'หน้าถัดไป / ก่อนหน้า' },
      { keys: 'Mod+Alt+P', label: 'พรีเซนต์จากหน้านี้' },
      { keys: 'Mod+P', label: 'พิมพ์' },
    ],
  },
  {
    title: 'มุมมอง',
    items: [
      { keys: 'Mod+= / Mod+-', label: 'ซูมเข้า / ออก' },
      { keys: 'Mod+0', label: 'ขนาดจริง 100%' },
      { keys: 'Shift+1', label: 'พอดีจอ' },
      { keys: 'Mod+ล้อเมาส์', label: 'ซูมตามตำแหน่งเมาส์' },
      { keys: 'Space+ลาก', label: 'เลื่อนมุมมอง' },
      { keys: 'Shift+R', label: 'แสดง / ซ่อนไม้บรรทัด' },
    ],
  },
  {
    title: 'เครื่องมือ',
    items: [
      { keys: 'T', label: 'เพิ่มข้อความ' },
      { keys: 'R', label: 'เพิ่มสี่เหลี่ยม' },
      { keys: 'O', label: 'เพิ่มวงกลม' },
      { keys: 'L', label: 'เพิ่มเส้น' },
      { keys: 'D', label: 'ปากกาวาด' },
      { keys: 'V', label: 'เครื่องมือเลือก' },
      { keys: '/', label: 'เปิดศูนย์รวมเครื่องมือ (ค้นหาได้)' },
      { keys: 'Mod+/ / ?', label: 'เปิดหน้ารวมคีย์ลัด' },
    ],
  },
];

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';

  return /mac|iphone|ipad/i.test(platform);
}

/// "Mod+Shift+Z / Mod+Y" → "Ctrl+Shift+Z / Ctrl+Y" (Windows) หรือ "⌘⇧Z / ⌘Y" (macOS)
export function formatKeys(keys: string, mac = isMacPlatform()): string {
  return keys
    .split(' / ')
    .map((combo) => {
      if (!mac) return combo.replace(/\bMod\b/g, 'Ctrl');

      const parts = combo.split('+');
      const symbols: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' };

      return parts.map((p) => symbols[p] ?? p).join(parts.every((p) => p in symbols || p.length === 1) ? '' : '+');
    })
    .join(' / ');
}

/// ค้นหาคีย์ลัดด้วยชื่อการกระทำหรือปุ่ม
export function searchShortcuts(query: string): ShortcutGroup[] {
  const q = query.trim().toLowerCase();

  if (!q) return SHORTCUT_GROUPS;

  return SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((s) => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q) || formatKeys(s.keys, false).toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);
}
