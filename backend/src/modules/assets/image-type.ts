/// ตรวจชนิดรูปจากไบต์หัวไฟล์ (magic bytes) — ไม่เชื่อ Content-Type หรือนามสกุลที่ client ส่งมา
///
/// รับเฉพาะรูปบิตแมปที่ editor วาดได้: PNG · JPEG · WebP · GIF
/// **ไม่รับ SVG** (deployment.md 1.3+ ข้อ 4.3) — SVG ฝังสคริปต์ได้ · หน้าเว็บแปลง SVG เป็น PNG ให้ก่อนอัปโหลด (lib/csmju/api.ts)
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export const IMAGE_EXTENSIONS: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/// ไฟล์ข้อความที่เป็น SVG (ใช้บอกเหตุผลที่ไม่รับให้ชัด)
export function looksLikeSvg(bytes: Buffer): boolean {
  // trimStart ตัด BOM (U+FEFF) และช่องว่างนำหน้าด้วย
  const head = bytes.subarray(0, 1024).toString('utf8').trimStart();

  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head);
}

export function sniffImage(bytes: Buffer): ImageMime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }

  return null;
}
