import { sniffImage } from './image-type.js';
import { sniffMedia } from './media-type.js';

const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`, 'ascii'), Buffer.alloc(8)]);

describe('sniffMedia', () => {
  it('แยก MP4 วิดีโอกับ M4A เสียงจาก brand ของ ftyp', () => {
    expect(sniffMedia(ftyp('isom'))).toBe('video/mp4');
    expect(sniffMedia(ftyp('mp42'))).toBe('video/mp4');
    expect(sniffMedia(ftyp('M4A '))).toBe('audio/mp4');
  });

  it('ไม่รับ QuickTime และ 3GP ที่หลายเบราว์เซอร์เล่นไม่ได้', () => {
    expect(sniffMedia(ftyp('qt  '))).toBeNull();
    expect(sniffMedia(ftyp('3gp4'))).toBeNull();
  });

  it('รู้จัก WebM แต่ไม่รับ Matroska ทั่วไป', () => {
    const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]);

    expect(sniffMedia(Buffer.concat([header, Buffer.from('webm', 'ascii'), Buffer.alloc(8)]))).toBe('video/webm');
    expect(sniffMedia(Buffer.concat([header, Buffer.from('matroska', 'ascii')]))).toBeNull();
  });

  it('รู้จัก MP3 (ID3 และ frame sync) · OGG · WAV', () => {
    expect(sniffMedia(Buffer.from('ID3\x04\x00\x00', 'binary'))).toBe('audio/mpeg');
    expect(sniffMedia(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe('audio/mpeg');
    expect(sniffMedia(Buffer.from('OggS\x00\x02', 'binary'))).toBe('audio/ogg');
    expect(sniffMedia(Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'binary'))).toBe('audio/wav');
  });

  it('ไม่สับสน JPEG และ WebP กับเสียง', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');

    expect(sniffMedia(jpeg)).toBeNull();
    expect(sniffImage(jpeg)).toBe('image/jpeg');
    expect(sniffMedia(webp)).toBeNull();
  });

  it('ปฏิเสธไฟล์อื่น', () => {
    expect(sniffMedia(Buffer.from('MZ\x90\x00 executable'))).toBeNull();
    expect(sniffMedia(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).toBeNull();
  });
});
