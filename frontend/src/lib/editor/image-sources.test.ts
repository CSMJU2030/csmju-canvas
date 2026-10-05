import { describe, expect, it } from 'vitest';
import {
  IMAGE_SOURCES, SOURCE_INTENT_MS, canCredit, createCreditText, creditText, externalUrl, hostOf, needsPermission, originFields,
  originFromHints, originOfAsset, recentIntent, sideWindowFeatures, siteFromUrl, sourceUrl,
} from './image-sources';

describe('siteFromUrl', () => {
  it('รู้จักเว็บคลังภาพและโดเมนเก็บไฟล์', () => {
    expect(siteFromUrl('https://images.unsplash.com/photo-1')).toBe('unsplash');
    expect(siteFromUrl('https://images.pexels.com/photos/1/a.jpeg')).toBe('pexels');
    expect(siteFromUrl('https://cdn.pixabay.com/photo/a.jpg')).toBe('pixabay');
    expect(siteFromUrl('https://upload.wikimedia.org/a.jpg')).toBe('wikimedia');
    expect(siteFromUrl('https://images-assets.nasa.gov/a.jpg')).toBe('nasa');
    expect(siteFromUrl('https://i.pinimg.com/736x/a.jpg')).toBe('pinterest');
    expect(siteFromUrl('https://encrypted-tbn0.gstatic.com/images?q=1')).toBe('google');
  });

  it('โดเมนที่แค่คล้ายไม่นับ', () => {
    expect(siteFromUrl('https://unsplash.com.evil.example/a.jpg')).toBeNull();
    expect(siteFromUrl('https://example.com/a.jpg')).toBeNull();
  });
});

describe('externalUrl', () => {
  it('รับเฉพาะ http(s) ภายนอก ยาวไม่เกิน 500', () => {
    expect(externalUrl('https://a.example/x.png?w=1&amp;h=2')).toBe('https://a.example/x.png?w=1&h=2');
    expect(externalUrl('/api/v1/assets/x/content')).toBeNull();
    expect(externalUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(externalUrl('http://localhost:3207/x.png', 'localhost:3207')).toBeNull();
    expect(externalUrl(`https://a.example/${'a'.repeat(500)}`)).toBeNull();
  });
});

describe('originFromHints', () => {
  it('คัดลอกรูปจาก Unsplash: ได้แหล่งจากโดเมนของรูป', () => {
    expect(originFromHints({ html: '<img src="https://images.unsplash.com/photo-1?w=800">', uriList: '' })).toEqual({
      site: 'unsplash',
      url: 'https://images.unsplash.com/photo-1?w=800',
    });
  });

  it('ลากรูปที่อยู่ในลิงก์: ใช้หน้าเว็บที่ลิงก์ชี้เป็นต้นฉบับ', () => {
    const html = '<a href="https://www.pinterest.com/pin/123/"><img src="https://i.pinimg.com/736x/a.jpg"></a>';

    expect(originFromHints({ html, uriList: '' })).toEqual({ site: 'pinterest', url: 'https://www.pinterest.com/pin/123/' });
  });

  it('รูปจากเว็บต้นทางที่ไม่รู้จัก + เพิ่งเปิด Google จากแผง → google', () => {
    expect(originFromHints({ html: '<img src="https://blog.example.com/a.jpg">', uriList: '' }, { intent: 'google' })).toEqual({
      site: 'google',
      url: 'https://blog.example.com/a.jpg',
    });
  });

  it('รูปจากเว็บที่ไม่รู้จักและไม่ได้เปิดแหล่งจากแผง → other', () => {
    expect(originFromHints({ html: '', uriList: 'https://blog.example.com/a.jpg' })?.site).toBe('other');
  });

  it('ภาพแคปหน้าจอ (ไม่มีร่องรอยเว็บ) → null แม้เพิ่งเปิดแหล่ง', () => {
    expect(originFromHints({ html: '', uriList: '' }, { intent: 'unsplash' })).toBeNull();
  });

  it('html ภายในระบบเอง (ลิงก์ของเราเอง) ไม่นับว่านำเข้า', () => {
    expect(originFromHints({ html: '<img src="http://localhost:3207/api/v1/assets/a/content">', uriList: '' }, { ownHost: 'localhost:3207' })).toBeNull();
  });
});

describe('recentIntent', () => {
  it('จำแหล่งที่เปิดภายใน 10 นาที', () => {
    expect(recentIntent({ site: 'pexels', at: 1000 }, 1000 + SOURCE_INTENT_MS)).toBe('pexels');
    expect(recentIntent({ site: 'pexels', at: 1000 }, 1001 + SOURCE_INTENT_MS)).toBeNull();
    expect(recentIntent({ site: null, at: 0 }, 1)).toBeNull();
  });
});

describe('ลิงก์ค้นหาและหน้าต่างข้างจอ', () => {
  it('ไม่ใส่คำค้น = หน้าแรกของเว็บ · ใส่ = หน้าค้นหาของเว็บนั้น (เข้ารหัส URL)', () => {
    const unsplash = IMAGE_SOURCES.find((s) => s.key === 'unsplash')!;

    expect(sourceUrl(unsplash, '  ')).toBe('https://unsplash.com/');
    expect(sourceUrl(unsplash, 'ดอกไม้ สีแดง')).toBe(`https://unsplash.com/s/photos/${encodeURIComponent('ดอกไม้ สีแดง')}`);
  });

  it('ทุกแหล่งเป็น https และไม่มีแหล่งซ้ำ', () => {
    expect(new Set(IMAGE_SOURCES.map((s) => s.key)).size).toBe(IMAGE_SOURCES.length);
    for (const source of IMAGE_SOURCES) {
      expect(source.home.startsWith('https://')).toBe(true);
      expect(source.search('x').startsWith('https://')).toBe(true);
      expect(siteFromUrl(source.search('x'))).toBe(source.key);
    }
  });

  it('เปิดครึ่งขวาของจอ', () => {
    expect(sideWindowFeatures({ availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 0 })).toBe('popup=yes,left=960,top=0,width=960,height=1040');
    expect(sideWindowFeatures({ availWidth: 1600, availHeight: 900, availLeft: 1920 })).toContain('left=2720');
  });
});

describe('สิทธิ์และเครดิต', () => {
  it('Pinterest/Google ต้องตรวจสิทธิ์ · คลังเสรีใส่เครดิตได้', () => {
    expect(needsPermission('pinterest')).toBe(true);
    expect(needsPermission('unsplash')).toBe(false);
    expect(canCredit('nasa')).toBe(true);
    expect(canCredit('google')).toBe(false);
    expect(canCredit('other')).toBe(false);
  });

  it('ข้อความเครดิตใช้ข้อมูลจริงจากแหล่งที่มา', () => {
    expect(creditText({ site: 'unsplash', url: 'https://www.unsplash.com/photos/a' })).toBe('ภาพ: Unsplash · unsplash.com');
    expect(creditText({ site: 'pexels', url: null })).toBe('ภาพ: Pexels');
    expect(hostOf('ftp://x.example/a')).toBeNull();
  });

  it('กล่องเครดิตอยู่ใต้รูป หรือในขอบล่างของรูปเมื่อเลยหน้า', () => {
    const page = { width: 1000, height: 800 };
    const below = createCreditText(page, { x: 100, y: 100, width: 400, height: 300 }, { site: 'pixabay', url: null });

    expect(below.text).toBe('ภาพ: Pixabay');
    expect(below.x).toBe(100);
    expect(below.y).toBeGreaterThan(400);
    expect(below.align).toBe('left');

    const inside = createCreditText(page, { x: 0, y: 500, width: 400, height: 300 }, { site: 'pixabay', url: null });

    expect(inside.y + inside.height).toBeLessThanOrEqual(800);
  });
});

describe('ข้อมูลที่ส่ง/รับกับ API', () => {
  it('ช่อง multipart', () => {
    expect(originFields(null)).toBeUndefined();
    expect(originFields({ site: 'google', url: 'https://a.example/x.jpg' })).toEqual({ sourceUrl: 'https://a.example/x.jpg', sourceSite: 'google' });
    expect(originFields({ site: 'other', url: null })).toEqual({ sourceSite: 'other' });
  });

  it('asset ที่ไม่มีแหล่ง = ไฟล์จากเครื่อง', () => {
    expect(originOfAsset({ sourceSite: null })).toBeNull();
    expect(originOfAsset({ sourceSite: 'bogus' })).toBeNull();
    expect(originOfAsset({ sourceSite: 'nasa', sourceUrl: 'https://images.nasa.gov/details/x' })).toEqual({ site: 'nasa', url: 'https://images.nasa.gov/details/x' });
  });
});
