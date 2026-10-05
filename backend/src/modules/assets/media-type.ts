/// ตรวจชนิดวิดีโอและเสียงจากไบต์หัวไฟล์ (magic bytes) — ไม่เชื่อ Content-Type หรือนามสกุลที่ client ส่งมา
///
/// รับเฉพาะชนิดที่เบราว์เซอร์หลักเล่นได้เองโดยไม่ต้องลงโปรแกรมเพิ่ม:
/// วิดีโอ MP4 · WebM และเสียง MP3 · M4A · OGG · WAV
export type MediaMime = 'video/mp4' | 'video/webm' | 'audio/mpeg' | 'audio/mp4' | 'audio/ogg' | 'audio/wav';

export const MEDIA_EXTENSIONS: Record<MediaMime, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

/// brand ของกล่อง `ftyp` ที่เป็นเสียงล้วน (iTunes/AAC) — brand อื่นถือเป็นวิดีโอ MP4
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B ']);
/// brand ของ MP4/ISO-BMFF ที่เบราว์เซอร์เล่นได้ (ไม่รวม QuickTime `qt  ` และ 3GP ที่หลายเบราว์เซอร์เปิดไม่ได้)
const VIDEO_BRANDS = /^(isom|iso[2-9]|mp41|mp42|avc1|dash|mmp4|M4V |M4VH|M4VP|f4v |msnv|ndas|NDSC|NDSH|NDSM|NDSP|NDSS|NDXC|NDXH|NDXM|NDXP|NDXS)$/;

export function sniffMedia(bytes: Buffer): MediaMime | null {
  // ISO-BMFF: [size:4]["ftyp"][major brand:4]
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii');

    if (AUDIO_BRANDS.has(brand)) return 'audio/mp4';
    if (VIDEO_BRANDS.test(brand)) return 'video/mp4';

    return null;
  }

  // Matroska/WebM: EBML header แล้วมี DocType "webm" ในส่วนหัว
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return bytes.subarray(0, 64).includes(Buffer.from('webm', 'ascii')) ? 'video/webm' : null;
  }

  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }

  // MP3: แท็ก ID3v2 นำหน้า หรือ frame sync ของ MPEG Layer III (11 บิตแรกเป็น 1 · layer = 01)
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && ((bytes[1] >> 1) & 0x03) === 0x01) {
    return 'audio/mpeg';
  }

  return null;
}

export function isMediaMime(mime: string): mime is MediaMime {
  return mime in MEDIA_EXTENSIONS;
}
