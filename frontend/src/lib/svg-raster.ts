/// แปลงไฟล์ SVG เป็น PNG ในเบราว์เซอร์ก่อนอัปโหลด — หลังบ้านไม่รับ SVG (standards deployment.md ข้อ 4.3: SVG ฝังสคริปต์ได้)
///
/// วาดผ่าน <img> ซึ่งไม่รันสคริปต์ในไฟล์ · ได้ PNG โปร่งใส ด้านยาวไม่เกิน 2048 px
/// (SVG จากคลังกราฟิกของระบบยังเป็นเวกเตอร์ตามเดิม — เฉพาะไฟล์ที่ผู้ใช้อัปโหลดเท่านั้นที่ถูกแปลง)

const MAX_SIDE = 2048;
const MIN_SIDE = 1024;

export function isSvgFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

function length(value: string | undefined): number | null {
  if (!value) return null;

  const match = value.trim().match(/^([\d.]+)(px)?$/i);
  const n = match ? Number(match[1]) : NaN;

  return Number.isFinite(n) && n > 0 ? n : null;
}

/// ขนาดของ SVG จาก width/height (หน่วย px) หรือ viewBox · อ่านไม่ได้ = จัตุรัส 1024
export function svgSize(text: string): { width: number; height: number } {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const width = length(attr('width'));
  const height = length(attr('height'));
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const vb = box && box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;

  if (width && height) return { width, height };
  if (vb && width) return { width, height: (width * vb.height) / vb.width };
  if (vb && height) return { width: (height * vb.width) / vb.height, height };
  if (vb) return vb;

  return { width: MIN_SIDE, height: MIN_SIDE };
}

/// ขนาดภาพผลลัพธ์: ขยายให้ด้านยาวอย่างน้อย 1024 (ไอคอนเล็กจะได้คม) แต่ไม่เกิน 2048
export function rasterSize(size: { width: number; height: number }): { width: number; height: number } {
  const long = Math.max(size.width, size.height);
  const target = Math.min(MAX_SIDE, Math.max(MIN_SIDE, long));
  const scale = target / long;

  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/// ใส่ width/height ให้แท็ก <svg> (Firefox วาด SVG ที่ไม่มีขนาดลง canvas ไม่ได้)
export function withExplicitSize(text: string, size: { width: number; height: number }): string {
  return text.replace(/<svg\b([^>]*)>/i, (_, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '');

    return `<svg${cleaned} width="${size.width}" height="${size.height}">`;
  });
}

export async function rasterizeSvgFile(file: File): Promise<File> {
  const text = await file.text();
  const size = rasterSize(svgSize(text));
  const url = URL.createObjectURL(new Blob([withExplicitSize(text, size)], { type: 'image/svg+xml' }));

  try {
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('อ่านไฟล์ SVG นี้ไม่ได้'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');

    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

    if (!blob) throw new Error('แปลงไฟล์ SVG ไม่สำเร็จ');

    return new File([blob], `${file.name.replace(/\.svg$/i, '') || 'ภาพ'}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
