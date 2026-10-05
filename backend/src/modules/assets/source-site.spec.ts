import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAssetsQuery, UploadAssetDto } from './dto/asset.dto.js';
import { cleanSourceUrl, normalizeSite, resolveSource, siteFromUrl } from './source-site.js';

describe('siteFromUrl', () => {
  it('รู้จักเว็บคลังภาพและโดเมนที่เก็บไฟล์รูปของเว็บนั้น', () => {
    expect(siteFromUrl('https://unsplash.com/photos/abc')).toBe('unsplash');
    expect(siteFromUrl('https://images.unsplash.com/photo-1?w=800')).toBe('unsplash');
    expect(siteFromUrl('https://www.pexels.com/photo/x-123/')).toBe('pexels');
    expect(siteFromUrl('https://images.pexels.com/photos/1/a.jpeg')).toBe('pexels');
    expect(siteFromUrl('https://cdn.pixabay.com/photo/2020/a.jpg')).toBe('pixabay');
    expect(siteFromUrl('https://openverse.org/image/1')).toBe('openverse');
    expect(siteFromUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg')).toBe('wikimedia');
    expect(siteFromUrl('https://th.wikipedia.org/wiki/X')).toBe('wikimedia');
    expect(siteFromUrl('https://images.nasa.gov/details/x')).toBe('nasa');
    expect(siteFromUrl('https://images-assets.nasa.gov/image/x/x~orig.jpg')).toBe('nasa');
  });

  it('รู้จัก Pinterest และ Google ทุกโดเมนประเทศ', () => {
    expect(siteFromUrl('https://th.pinterest.com/pin/123/')).toBe('pinterest');
    expect(siteFromUrl('https://www.pinterest.co.uk/pin/1/')).toBe('pinterest');
    expect(siteFromUrl('https://i.pinimg.com/736x/a.jpg')).toBe('pinterest');
    expect(siteFromUrl('https://www.google.co.th/search?q=cat')).toBe('google');
    expect(siteFromUrl('https://encrypted-tbn0.gstatic.com/images?q=tbn')).toBe('google');
  });

  it('โดเมนที่ไม่รู้จักหรือแค่คล้าย → null', () => {
    expect(siteFromUrl('https://example.com/a.jpg')).toBeNull();
    expect(siteFromUrl('https://notunsplash.com/a.jpg')).toBeNull();
    expect(siteFromUrl('https://unsplash.com.evil.example/a.jpg')).toBeNull();
    expect(siteFromUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('cleanSourceUrl', () => {
  it('รับเฉพาะ http/https ที่ยาวไม่เกิน 500', () => {
    expect(cleanSourceUrl(' https://unsplash.com/photos/a ')).toBe('https://unsplash.com/photos/a');
    expect(cleanSourceUrl('ftp://example.com/a.jpg')).toBeNull();
    expect(cleanSourceUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(cleanSourceUrl('not a url')).toBeNull();
    expect(cleanSourceUrl(`https://example.com/${'a'.repeat(500)}`)).toBeNull();
    expect(cleanSourceUrl('')).toBeNull();
  });
});

describe('normalizeSite / resolveSource', () => {
  it('ชื่อแหล่งนอกรายการกลายเป็น other', () => {
    expect(normalizeSite('Unsplash')).toBe('unsplash');
    expect(normalizeSite('flickr')).toBe('other');
    expect(normalizeSite('  ')).toBeNull();
  });

  it('โดเมนที่รู้จักชนะแหล่งที่ผู้ใช้เลือก', () => {
    expect(resolveSource('https://i.pinimg.com/a.jpg', 'unsplash')).toEqual({ sourceUrl: 'https://i.pinimg.com/a.jpg', sourceSite: 'pinterest' });
  });

  it('รูปจากเว็บต้นฉบับที่ค้นเจอผ่าน Google ใช้แหล่งที่ผู้ใช้เลือก', () => {
    expect(resolveSource('https://blog.example.com/a.jpg', 'google')).toEqual({ sourceUrl: 'https://blog.example.com/a.jpg', sourceSite: 'google' });
  });

  it('มีแค่ URL ที่ไม่รู้จัก → other · ไม่มีอะไรเลย → ไฟล์จากเครื่อง', () => {
    expect(resolveSource('https://example.com/a.jpg', undefined).sourceSite).toBe('other');
    expect(resolveSource(undefined, 'pexels')).toEqual({ sourceUrl: null, sourceSite: 'pexels' });
    expect(resolveSource(undefined, undefined)).toEqual({ sourceUrl: null, sourceSite: null });
  });
});

describe('UploadAssetDto (ช่อง multipart)', () => {
  const check = async (body: Record<string, unknown>) =>
    validate(plainToInstance(UploadAssetDto, body), { whitelist: true, forbidNonWhitelisted: true });

  it('รับ sourceUrl แบบ https และ sourceSite', async () => {
    expect(await check({ sourceUrl: 'https://unsplash.com/photos/a', sourceSite: 'unsplash' })).toHaveLength(0);
    expect(await check({})).toHaveLength(0);
  });

  it('ตีกลับลิงก์ที่ไม่ใช่ http(s) หรือยาวเกิน', async () => {
    expect((await check({ sourceUrl: 'javascript:alert(1)' })).map((e) => e.property)).toContain('sourceUrl');
    expect((await check({ sourceUrl: `https://example.com/${'a'.repeat(500)}` })).map((e) => e.property)).toContain('sourceUrl');
    expect((await check({ sourceSite: 'x'.repeat(61) })).map((e) => e.property)).toContain('sourceSite');
  });
});

describe('ListAssetsQuery source/imported', () => {
  it('source ต้องอยู่ในรายการ', async () => {
    expect(await validate(plainToInstance(ListAssetsQuery, { source: 'pexels' }))).toHaveLength(0);
    expect((await validate(plainToInstance(ListAssetsQuery, { source: 'flickr' }))).map((e) => e.property)).toContain('source');
  });

  it('imported แปลง "true" เป็น boolean', () => {
    expect(plainToInstance(ListAssetsQuery, { imported: 'true' }).imported).toBe(true);
  });
});
