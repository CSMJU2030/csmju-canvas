import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp, PREFIX_EXCLUDE } from '../src/bootstrap.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { bearer, startCoreHubStub } from './core-hub-fixture.js';

/// เส้นทางหลักของ CS Canvas กับฐานข้อมูลจริง (pnpm --filter backend db:up ก่อน)
///
/// token เซ็นด้วยกุญแจทดสอบผ่าน JWKS จำลอง — ด่านตรวจ 10 ขั้นทำงานเหมือนของจริงทุกขั้น
describe('CS Canvas API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const run = randomUUID().slice(0, 8);
  const student = `e2e-${run}-student`;
  const other = `e2e-${run}-other`;
  const staff = `e2e-${run}-staff`;
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
    'base64',
  );
  const doc = { version: 1, pages: [{ id: 'p1', background: 'rgb(255 255 255)', elements: [] }] };

  beforeAll(async () => {
    await startCoreHubStub();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: PREFIX_EXCLUDE });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const owners = { startsWith: `e2e-${run}-` };

    await prisma.design.deleteMany({ where: { coreUserId: owners } });
    await prisma.template.deleteMany({ where: { createdByCoreUserId: owners } });
    await prisma.asset.deleteMany({ where: { coreUserId: owners } });
    await prisma.folder.deleteMany({ where: { coreUserId: owners } });
    await prisma.assetFolder.deleteMany({ where: { coreUserId: owners } });
    await prisma.designVisit.deleteMany({ where: { coreUserId: owners } });
    await prisma.notification.deleteMany({ where: { coreUserId: owners } });
    await prisma.preference.deleteMany({ where: { coreUserId: owners } });
    await prisma.feedback.deleteMany({ where: { coreUserId: owners } });
    await prisma.templateFavorite.deleteMany({ where: { coreUserId: owners } });
    await prisma.subsystemMember.deleteMany({ where: { coreUserId: owners } });
    await prisma.report.deleteMany({ where: { reporterCoreUserId: owners } });
    await prisma.auditLog.deleteMany({ where: { actorCoreUserId: owners } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/health ตอบชื่อระบบโดยไม่ต้องมี token', async () => {
    const res = await http().get('/api/health').expect(200);

    expect(res.body.data.service).toBe('csmju-canvas');
  });

  it('ไม่มี token → 401 UNAUTHORIZED', async () => {
    const res = await http().get('/api/v1/designs').expect(401);

    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('สร้าง แก้ และอ่านงานของตัวเอง · คนอื่นอ่านไม่ได้ (404)', async () => {
    const created = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'โปสเตอร์ทดสอบ', designType: 'poster', width: 1123, height: 1587 })
      .expect(201);
    const id = created.body.data.id as string;

    expect(created.body.data.document.version).toBe(1);

    await http()
      .patch(`/api/v1/designs/${id}`)
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'ชื่อใหม่', document: doc })
      .expect(200);

    const list = await http().get('/api/v1/designs?limit=5').set('Authorization', bearer(student, 'student')).expect(200);

    expect(list.body.meta).toMatchObject({ page: 1, limit: 5 });
    expect(list.body.data.map((d: { id: string }) => d.id)).toContain(id);

    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(404);
  });

  it('JSON state ผิดรูป → 400', async () => {
    const res = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'ผิด', designType: 'poster', width: 100, height: 100, document: { version: 2, pages: [] } })
      .expect(400);

    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('id ไม่ใช่ UUID → 400 · UUID ที่ไม่มี → 404', async () => {
    await http().get('/api/v1/designs/not-a-uuid').set('Authorization', bearer(student, 'student')).expect(400);
    await http()
      .get('/api/v1/designs/99999999-9999-4999-8999-999999999999')
      .set('Authorization', bearer(student, 'student'))
      .expect(404);
  });

  it('ลบถาวรได้เฉพาะงานในถังขยะ และแจ้งเตือนตอนย้ายลงถัง', async () => {
    const created = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'จะลบ', designType: 'flyer', width: 794, height: 1123 })
      .expect(201);
    const id = created.body.data.id as string;

    await http().delete(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(400);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ trashed: true }).expect(200);

    const trash = await http().get('/api/v1/designs?trashed=true').set('Authorization', bearer(student, 'student')).expect(200);

    expect(trash.body.data.map((d: { id: string }) => d.id)).toContain(id);

    const removed = await http().delete(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(removed.body.data).toEqual({ id, deleted: true });

    // แจ้งเตือนสร้างแบบไม่รอ — ให้เวลา event loop หนึ่งรอบ
    await new Promise((resolve) => setImmediate(resolve));

    const notes = await http().get('/api/v1/notifications').set('Authorization', bearer(student, 'student')).expect(200);

    expect(notes.body.data.some((n: { kind: string }) => n.kind === 'DESIGN_TRASHED')).toBe(true);
  });

  it('นักศึกษาเผยแพร่เทมเพลตไม่ได้ (403) · บุคลากรได้ (201) และนับการใช้งาน', async () => {
    const body = { title: 'เทมเพลตทดสอบ', designType: 'certificate', category: 'event', width: 1123, height: 794, document: doc };

    const denied = await http().post('/api/v1/templates').set('Authorization', bearer(student, 'guest')).send(body).expect(403);

    expect(denied.body.error.code).toBe('FORBIDDEN');

    const created = await http().post('/api/v1/templates').set('Authorization', bearer(staff, 'staff')).send(body).expect(201);
    const templateId = created.body.data.id as string;

    expect(created.body.data.isMine).toBe(true);

    await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'จากเทมเพลต', templateId })
      .expect(201);

    const after = await http().get(`/api/v1/templates/${templateId}`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(after.body.data.usageCount).toBe(1);

    const usage = await http().get('/api/v1/design-type-usages').set('Authorization', bearer(student, 'student')).expect(200);

    expect(usage.body.data.some((u: { designType: string }) => u.designType === 'certificate')).toBe(true);
  });

  it('limit ที่ไม่ใช่ตัวเลข → 400 VALIDATION_ERROR', async () => {
    const res = await http().get('/api/v1/templates?limit=not-a-number').set('Authorization', bearer(staff, 'staff')).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('อัปโหลดรูปตรวจจากไบต์จริง · เจ้าของเท่านั้นที่ดึงไฟล์ได้', async () => {
    const uploaded = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .attach('file', PNG, 'dot.png')
      .expect(201);

    expect(uploaded.body.data.mimeType).toBe('image/png');

    const content = await http()
      .get(uploaded.body.data.contentUrl as string)
      .set('Authorization', bearer(student, 'student'))
      .expect(200);

    expect(content.headers['content-type']).toBe('image/png');
    await http().get(uploaded.body.data.contentUrl as string).set('Authorization', bearer(other, 'student')).expect(404);

    await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .attach('file', Buffer.from('not an image at all'), 'fake.png')
      .expect(400);

    const quota = await http().get('/api/v1/quotas').set('Authorization', bearer(student, 'student')).expect(200);

    expect(quota.body.data.usedBytes).toBeGreaterThanOrEqual(PNG.length);
  });

  it('ภาพที่นำเข้าจากเว็บอื่นเก็บแหล่งที่มา · กรองตาม source/imported · ตีกลับลิงก์ที่ไม่ใช่ http(s)', async () => {
    const fromUnsplash = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .field('sourceUrl', 'https://images.unsplash.com/photo-1?w=800')
      .field('sourceSite', 'pexels')
      .attach('file', PNG, 'unsplash.png')
      .expect(201);

    // โดเมนที่รู้จักชนะแหล่งที่ client ส่งมา
    expect(fromUnsplash.body.data.sourceSite).toBe('unsplash');
    expect(fromUnsplash.body.data.sourceUrl).toBe('https://images.unsplash.com/photo-1?w=800');

    const viaGoogle = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .field('sourceUrl', 'https://blog.example.com/cat.png')
      .field('sourceSite', 'google')
      .attach('file', PNG, 'google.png')
      .expect(201);

    expect(viaGoogle.body.data.sourceSite).toBe('google');

    const unknownSite = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .field('sourceSite', 'flickr')
      .attach('file', PNG, 'flickr.png')
      .expect(201);

    expect(unknownSite.body.data.sourceSite).toBe('other');

    const local = await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', PNG, 'local.png').expect(201);

    expect(local.body.data.sourceSite).toBeNull();
    expect(local.body.data.sourceUrl).toBeNull();

    const bad = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .field('sourceUrl', 'javascript:alert(1)')
      .attach('file', PNG, 'bad.png')
      .expect(400);

    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const unsplash = await http().get('/api/v1/assets?kind=image&source=unsplash').set('Authorization', bearer(student, 'student')).expect(200);

    expect((unsplash.body.data as { id: string; sourceSite: string }[]).every((a) => a.sourceSite === 'unsplash')).toBe(true);
    expect((unsplash.body.data as { id: string }[]).some((a) => a.id === fromUnsplash.body.data.id)).toBe(true);
    expect(unsplash.body.meta.total).toBeGreaterThanOrEqual(1);

    const imported = await http().get('/api/v1/assets?kind=image&imported=true&limit=100').set('Authorization', bearer(student, 'student')).expect(200);
    const importedIds = (imported.body.data as { id: string }[]).map((a) => a.id);

    expect(importedIds).toContain(viaGoogle.body.data.id);
    expect(importedIds).not.toContain(local.body.data.id);

    await http().get('/api/v1/assets?source=flickr').set('Authorization', bearer(student, 'student')).expect(400);
    // ภาพที่นำเข้าของคนอื่นไม่ปนมา
    const others = await http().get('/api/v1/assets?source=unsplash').set('Authorization', bearer(other, 'student')).expect(200);

    expect((others.body.data as { id: string }[]).some((a) => a.id === fromUnsplash.body.data.id)).toBe(false);
  });

  it('อัปโหลดวิดีโอ/เสียงตรวจจากไบต์ · กรองตามชนิด · ส่งเป็นช่วงไบต์ (Range) ได้', async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(24)]);
    const uploaded = await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', mp4, 'clip.mp4').expect(201);

    expect(uploaded.body.data.mimeType).toBe('video/mp4');

    const part = await http()
      .get(uploaded.body.data.contentUrl as string)
      .set('Authorization', bearer(student, 'student'))
      .set('Range', 'bytes=4-11')
      .expect(206);

    expect(part.headers['content-range']).toBe(`bytes 4-11/${mp4.length}`);
    expect(part.headers['accept-ranges']).toBe('bytes');

    await http()
      .get(uploaded.body.data.contentUrl as string)
      .set('Authorization', bearer(student, 'student'))
      .set('Range', `bytes=${mp4.length}-`)
      .expect(416);

    const videos = await http().get('/api/v1/assets?kind=video').set('Authorization', bearer(student, 'student')).expect(200);

    expect((videos.body.data as { mimeType: string }[]).every((a) => a.mimeType.startsWith('video/'))).toBe(true);
    await http().get('/api/v1/assets?kind=document').set('Authorization', bearer(student, 'student')).expect(400);
  });

  it('ฟอนต์ของฉัน: ตรวจ TTF/WOFF2 จากไบต์ · กรอง kind=font · นับโควตา · เกิน 5 MB ไม่รับ · คนที่ได้ลิงก์งานโหลดฟอนต์ได้', async () => {
    // หัว sfnt ของ TrueType (00 01 00 00 + จำนวนตาราง) และ WOFF2 ที่ช่อง length ตรงกับขนาดไฟล์
    const ttf = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0c]), Buffer.alloc(58)]);
    const woff2 = Buffer.alloc(48);

    woff2.write('wOF2', 0, 'latin1');
    Buffer.from([0x00, 0x01, 0x00, 0x00]).copy(woff2, 4);
    woff2.writeUInt32BE(woff2.length, 8);

    const before = await http().get('/api/v1/quotas').set('Authorization', bearer(student, 'student')).expect(200);
    const font = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      // แหล่งที่มาไม่มีความหมายกับฟอนต์ — ระบบไม่เก็บ
      .field('sourceSite', 'pinterest')
      .attach('file', ttf, 'ฟอนต์ลายมือ.ttf')
      .expect(201);
    const fontId = font.body.data.id as string;

    expect(font.body.data).toMatchObject({ mimeType: 'font/ttf', fileName: 'ฟอนต์ลายมือ.ttf', sourceSite: null, sourceUrl: null });

    const packed = await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', woff2, 'brand.woff2').expect(201);

    expect(packed.body.data.mimeType).toBe('font/woff2');

    const after = await http().get('/api/v1/quotas').set('Authorization', bearer(student, 'student')).expect(200);

    expect(after.body.data.usedBytes).toBeGreaterThanOrEqual(before.body.data.usedBytes + ttf.length + woff2.length);

    const fonts = await http().get('/api/v1/assets?kind=font').set('Authorization', bearer(student, 'student')).expect(200);
    const kinds = (fonts.body.data as { id: string; mimeType: string }[]).map((a) => a.mimeType);

    expect(kinds.every((m) => m.startsWith('font/'))).toBe(true);
    expect((fonts.body.data as { id: string }[]).map((a) => a.id)).toEqual(expect.arrayContaining([fontId, packed.body.data.id]));

    const images = await http().get('/api/v1/assets?kind=image').set('Authorization', bearer(student, 'student')).expect(200);

    expect((images.body.data as { id: string }[]).some((a) => a.id === fontId)).toBe(false);

    const content = await http().get(`/api/v1/assets/${fontId}/content`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(content.headers['content-type']).toBe('font/ttf');

    // ฟอนต์ใหญ่เกิน 5 MB (แต่ยังไม่เกินเพดานรวมของตัวรับไฟล์)
    const huge = Buffer.concat([ttf, Buffer.alloc(5 * 1024 * 1024)]);

    await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', huge, 'huge.ttf').expect(400);
    // TrueType Collection ไม่รับ
    await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .attach('file', Buffer.concat([Buffer.from('ttcf', 'latin1'), Buffer.alloc(60)]), 'set.ttc')
      .expect(400);

    // งานที่ใช้ฟอนต์นี้ (fontFamily: "asset:<uuid>") เปิดแชร์ด้วยลิงก์ → คนอื่นโหลดฟอนต์ได้ · ปิดลิงก์แล้วโหลดไม่ได้
    const withFont = {
      version: 1,
      pages: [{ id: 'p1', background: null, elements: [{ id: 't', type: 'text', text: 'สวัสดี', fontFamily: `asset:${fontId}`, x: 0, y: 0, width: 50, height: 20 }] }],
    };
    const design = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'ใช้ฟอนต์ของฉัน', designType: 'poster', width: 100, height: 100, document: withFont })
      .expect(201);
    const designId = design.body.data.id as string;

    await http().get(`/api/v1/assets/${fontId}/content`).set('Authorization', bearer(other, 'student')).expect(404);
    await http().patch(`/api/v1/designs/${designId}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'VIEW' }).expect(200);
    await http().get(`/api/v1/assets/${fontId}/content`).set('Authorization', bearer(other, 'student')).expect(200);
    await http().patch(`/api/v1/designs/${designId}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'NONE' }).expect(200);
    await http().get(`/api/v1/assets/${fontId}/content`).set('Authorization', bearer(other, 'student')).expect(404);
    // คนอื่นไม่เห็นฟอนต์นี้ในรายการของตัวเอง
    const othersFonts = await http().get('/api/v1/assets?kind=font').set('Authorization', bearer(other, 'student')).expect(200);

    expect((othersFonts.body.data as { id: string }[]).some((a) => a.id === fontId)).toBe(false);
  });

  it('การตั้งค่าแก้ได้และอ่านกลับได้', async () => {
    await http().patch('/api/v1/preferences').set('Authorization', bearer(student, 'student')).send({ largeText: true }).expect(200);

    const res = await http().get('/api/v1/preferences').set('Authorization', bearer(student, 'student')).expect(200);

    expect(res.body.data.largeText).toBe(true);
  });

  it('แชร์ด้วยลิงก์: ดูอย่างเดียวแก้ไม่ได้ · แก้ไขได้แก้เนื้องานได้แต่เปลี่ยนชื่อไม่ได้ · รูปในงานเปิดได้', async () => {
    const uploaded = await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', PNG, 'share.png').expect(201);
    const assetId = uploaded.body.data.id as string;
    const withImage = {
      version: 1,
      pages: [{ id: 'p1', background: null, elements: [{ id: 'i', type: 'image', assetId, src: `/api/v1/assets/${assetId}/content`, x: 0, y: 0, width: 10, height: 10 }] }],
    };
    const created = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'แชร์', designType: 'poster', width: 100, height: 100, document: withImage })
      .expect(201);
    const id = created.body.data.id as string;

    // ยังไม่แชร์ = คนอื่นไม่เห็นทั้งงานและรูป
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(404);
    await http().get(`/api/v1/assets/${assetId}/content`).set('Authorization', bearer(other, 'student')).expect(404);

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'VIEW', tags: ['งานกลุ่ม', ' งานกลุ่ม '] }).expect(200);

    const viewed = await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(200);

    expect(viewed.body.data.access).toBe('VIEW');
    expect(viewed.body.data.tags).toEqual(['งานกลุ่ม']);
    await http().get(`/api/v1/assets/${assetId}/content`).set('Authorization', bearer(other, 'student')).expect(200);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).send({ document: doc }).expect(403);

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'EDIT' }).expect(200);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).send({ document: withImage }).expect(200);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).send({ title: 'ยึดงาน' }).expect(403);

    // งานที่แชร์ไม่ขึ้นในรายการของคนอื่น
    const list = await http().get('/api/v1/designs').set('Authorization', bearer(other, 'student')).expect(200);

    expect(list.body.data.map((d: { id: string }) => d.id)).not.toContain(id);
  });

  it('ส่งฟีดแบ็กได้ทุกคน · อ่านรายการได้เฉพาะผู้ดูแล', async () => {
    await http().post('/api/v1/feedbacks').set('Authorization', bearer(student, 'student')).send({ kind: 'SUGGESTION', message: 'อยากได้เทมเพลตเพิ่ม' }).expect(201);
    await http().post('/api/v1/feedbacks').set('Authorization', bearer(student, 'student')).send({ kind: 'REPORT', message: 'ลิงก์ภายนอก', link: 'https://evil.example' }).expect(400);
    await http().get('/api/v1/feedbacks').set('Authorization', bearer(student, 'student')).expect(403);
    await http().get('/api/v1/feedbacks').set('Authorization', bearer(`e2e-${run}-admin`, 'admin')).expect(200);
  });

  it('ไฟล์อัปโหลดค้นชื่อ กรองชนิด และเปลี่ยนชื่อได้', async () => {
    const up = await http().post('/api/v1/assets').set('Authorization', bearer(student, 'student')).attach('file', PNG, 'โลโก้สาขา.png').expect(201);

    await http().patch(`/api/v1/assets/${up.body.data.id}`).set('Authorization', bearer(student, 'student')).send({ fileName: 'โลโก้ใหม่.png' }).expect(200);

    const found = await http().get(`/api/v1/assets?q=${encodeURIComponent('โลโก้ใหม่')}&mimeType=image%2Fpng`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(found.body.data.map((a: { fileName: string }) => a.fileName)).toContain('โลโก้ใหม่.png');
  });

  it('ธีมเก็บในการตั้งค่า', async () => {
    const res = await http().patch('/api/v1/preferences').set('Authorization', bearer(student, 'student')).send({ theme: 'DARK' }).expect(200);

    expect(res.body.data.theme).toBe('DARK');
  });

  it('ติดดาวเทมเพลต แล้วกรองเฉพาะที่ติดดาวได้ · เลิกติดดาวได้', async () => {
    const list = await http().get('/api/v1/templates?limit=1').set('Authorization', bearer(student, 'student')).expect(200);
    const templateId = list.body.data[0].id as string;

    await http().post('/api/v1/template-favorites').set('Authorization', bearer(student, 'student')).send({ templateId }).expect(201);

    const starred = await http().get('/api/v1/templates?starred=true').set('Authorization', bearer(student, 'student')).expect(200);

    expect(starred.body.data.map((t: { id: string }) => t.id)).toContain(templateId);
    expect(starred.body.data[0].isStarred).toBe(true);

    // ของคนอื่นไม่ติดดาวตาม
    const others = await http().get('/api/v1/templates?starred=true').set('Authorization', bearer(other, 'student')).expect(200);

    expect(others.body.data.map((t: { id: string }) => t.id)).not.toContain(templateId);

    await http().delete(`/api/v1/template-favorites/${templateId}`).set('Authorization', bearer(student, 'student')).expect(200);
    await http().delete(`/api/v1/template-favorites/${templateId}`).set('Authorization', bearer(student, 'student')).expect(404);
  });

  it('โฟลเดอร์รูป: สร้าง ย้ายรูปเข้า กรอง และลบโฟลเดอร์แล้วรูปยังอยู่ · ย้ายเข้าโฟลเดอร์คนอื่นไม่ได้', async () => {
    const folder = await http().post('/api/v1/asset-folders').set('Authorization', bearer(student, 'student')).send({ name: 'รูปกิจกรรม' }).expect(201);
    const folderId = folder.body.data.id as string;
    const asset = await http()
      .post('/api/v1/assets')
      .set('Authorization', bearer(student, 'student'))
      .attach('file', PNG, { filename: 'in-folder.png', contentType: 'image/png' })
      .expect(201);
    const assetId = asset.body.data.id as string;

    await http().patch(`/api/v1/assets/${assetId}`).set('Authorization', bearer(student, 'student')).send({ folderId }).expect(200);

    const inFolder = await http().get(`/api/v1/assets?folderId=${folderId}`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(inFolder.body.data.map((a: { id: string }) => a.id)).toEqual([assetId]);
    expect(inFolder.body.data[0].folderId).toBe(folderId);

    const folders = await http().get('/api/v1/asset-folders').set('Authorization', bearer(student, 'student')).expect(200);

    expect(folders.body.data.find((f: { id: string }) => f.id === folderId).assetCount).toBe(1);

    // โฟลเดอร์ของคนอื่น = 404 ทั้งย้ายเข้าและลบ
    const foreign = await http().post('/api/v1/asset-folders').set('Authorization', bearer(other, 'student')).send({ name: 'ของคนอื่น' }).expect(201);

    await http().patch(`/api/v1/assets/${assetId}`).set('Authorization', bearer(student, 'student')).send({ folderId: foreign.body.data.id }).expect(404);
    await http().delete(`/api/v1/asset-folders/${folderId}`).set('Authorization', bearer(other, 'student')).expect(404);

    await http().delete(`/api/v1/asset-folders/${folderId}`).set('Authorization', bearer(student, 'student')).expect(200);

    const after = await http().get('/api/v1/assets?q=in-folder').set('Authorization', bearer(student, 'student')).expect(200);

    expect(after.body.data[0]).toMatchObject({ id: assetId, folderId: null });
  });

  it('แชร์กับคุณ: ขึ้นหลังเปิดลิงก์แชร์ · หายเมื่อเจ้าของปิดลิงก์', async () => {
    const created = await http()
      .post('/api/v1/designs')
      .set('Authorization', bearer(student, 'student'))
      .send({ title: 'งานแชร์ให้เพื่อน', designType: 'poster', width: 1123, height: 1587 })
      .expect(201);
    const id = created.body.data.id as string;
    const sharedList = () => http().get('/api/v1/designs?scope=shared').set('Authorization', bearer(other, 'student')).expect(200);

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'VIEW' }).expect(200);
    expect((await sharedList()).body.data.map((d: { id: string }) => d.id)).not.toContain(id);

    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(200);

    const shared = await sharedList();

    expect(shared.body.data.map((d: { id: string }) => d.id)).toContain(id);
    expect(shared.body.data.find((d: { id: string }) => d.id === id).access).toBe('VIEW');

    // scope=all ของคนที่ได้แชร์มีทั้งงานตัวเองและงานที่แชร์ · งานของฉัน (ค่าเริ่มต้น) ไม่มีงานคนอื่น
    const all = await http().get('/api/v1/designs?scope=all&limit=100').set('Authorization', bearer(other, 'student')).expect(200);
    const mine = await http().get('/api/v1/designs?limit=100').set('Authorization', bearer(other, 'student')).expect(200);

    expect(all.body.data.map((d: { id: string }) => d.id)).toContain(id);
    expect(mine.body.data.map((d: { id: string }) => d.id)).not.toContain(id);

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'NONE' }).expect(200);
    expect((await sharedList()).body.data.map((d: { id: string }) => d.id)).not.toContain(id);

    await http().get('/api/v1/designs?scope=everyone').set('Authorization', bearer(other, 'student')).expect(400);
  });

  it('กรองเทมเพลตตามสีและภาษาที่คำนวณจากงาน', async () => {
    const document = {
      version: 1,
      pages: [
        {
          id: 'p1',
          background: 'rgb(255 255 255)',
          elements: [
            { id: 't1', type: 'text', name: '', x: 0, y: 0, width: 100, height: 20, rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null, text: 'ประกาศ Notice', color: 'rgb(220 38 38)' },
          ],
        },
      ],
    };
    const created = await http()
      .post('/api/v1/templates')
      .set('Authorization', bearer(staff, 'staff'))
      .send({ title: `ตัวกรองสี ${run}`, designType: 'poster', category: 'event', width: 1123, height: 1587, document })
      .expect(201);
    const id = created.body.data.id as string;
    const ids = async (query: string) =>
      (await http().get(`/api/v1/templates?limit=100&q=${run}&${query}`).set('Authorization', bearer(student, 'student')).expect(200)).body.data.map(
        (t: { id: string }) => t.id,
      );

    expect(await ids('colors=red,blue')).toContain(id);
    expect(await ids('colors=white')).toContain(id);
    expect(await ids('colors=green')).not.toContain(id);
    expect(await ids('language=th')).toContain(id);
    expect(await ids('language=en&colors=red')).toContain(id);

    await http().get('/api/v1/templates?colors=magenta').set('Authorization', bearer(student, 'student')).expect(400);
    await http().get('/api/v1/templates?language=jp').set('Authorization', bearer(student, 'student')).expect(400);
  });

  const newDesign = async (title: string) =>
    (
      await http()
        .post('/api/v1/designs')
        .set('Authorization', bearer(student, 'student'))
        .send({ title, designType: 'presentation', width: 1920, height: 1080 })
        .expect(201)
    ).body.data.id as string;

  it('ประวัติเวอร์ชัน: เก็บตอนบันทึกเนื้องานและตอนสั่งเก็บ · คนดูอย่างเดียวเข้าไม่ได้', async () => {
    const id = await newDesign('งานมีเวอร์ชัน');

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ document: doc }).expect(200);

    const auto = await http().get(`/api/v1/designs/${id}/versions`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(auto.body.meta.total).toBe(1);
    expect(auto.body.data[0]).toMatchObject({ author: 'me', pageCount: 1, width: 1920 });

    // บันทึกซ้ำภายใน 10 นาทีไม่เก็บเพิ่ม · สั่งเก็บเองได้เสมอ
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ document: doc }).expect(200);
    await http().post(`/api/v1/designs/${id}/versions`).set('Authorization', bearer(student, 'student')).expect(201);

    const list = await http().get(`/api/v1/designs/${id}/versions`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(list.body.meta.total).toBe(2);

    const one = await http().get(`/api/v1/designs/${id}/versions/${list.body.data[0].id}`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(one.body.data.document.version).toBe(1);

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'VIEW' }).expect(200);
    await http().get(`/api/v1/designs/${id}/versions`).set('Authorization', bearer(other, 'student')).expect(403);
    await http().get(`/api/v1/designs/${id}/versions/${randomUUID()}`).set('Authorization', bearer(student, 'student')).expect(404);
  });

  it('ความคิดเห็น: ลิงก์แสดงความคิดเห็นได้เขียนได้แต่แก้งานไม่ได้ · ตอบกลับ รีแอกชัน แก้ไขแล้ว ลบ · แจ้งเตือนเจ้าของ', async () => {
    const id = await newDesign('งานรอความเห็น');

    await http().post(`/api/v1/designs/${id}/comments`).set('Authorization', bearer(other, 'student')).send({ body: 'ลองดู', pageId: 'p1' }).expect(404);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'COMMENT' }).expect(200);

    const opened = await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(200);

    expect(opened.body.data.access).toBe('COMMENT');
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).send({ document: doc }).expect(403);

    const created = await http()
      .post(`/api/v1/designs/${id}/comments`)
      .set('Authorization', bearer(other, 'student'))
      .send({ body: 'หัวข้อใหญ่ไปนิด', pageId: 'p1', elementId: 'el-1' })
      .expect(201);
    const commentId = created.body.data.id as string;

    expect(created.body.data).toMatchObject({ author: 'me', canDelete: true, elementId: 'el-1' });
    expect(created.body.data.authorTag).toMatch(/^[0-9A-F]{4}$/);

    await http()
      .post(`/api/v1/designs/${id}/comments`)
      .set('Authorization', bearer(student, 'student'))
      .send({ body: 'แก้แล้วครับ', pageId: 'p1', parentId: commentId })
      .expect(201);

    const reacted = await http().patch(`/api/v1/design-comments/${commentId}`).set('Authorization', bearer(student, 'student')).send({ reaction: '👍', resolved: true }).expect(200);

    expect(reacted.body.data.reactions).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    expect(reacted.body.data.resolvedAt).not.toBeNull();
    await http().patch(`/api/v1/design-comments/${commentId}`).set('Authorization', bearer(student, 'student')).send({ body: 'แก้ข้อความคนอื่น' }).expect(403);
    await http().patch(`/api/v1/design-comments/${commentId}`).set('Authorization', bearer(student, 'student')).send({ reaction: '🍕' }).expect(400);

    const listed = await http().get(`/api/v1/designs/${id}/comments`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(listed.body.data.map((c: { author: string }) => c.author)).toEqual(['collaborator', 'me']);

    const notes = await http().get('/api/v1/notifications?limit=50').set('Authorization', bearer(student, 'student')).expect(200);

    expect(notes.body.data.some((n: { kind: string }) => n.kind === 'COMMENT_ADDED')).toBe(true);

    await http().delete(`/api/v1/design-comments/${commentId}`).set('Authorization', bearer(student, 'student')).expect(200);

    const after = await http().get(`/api/v1/designs/${id}/comments`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(after.body.meta.total).toBe(0);
  });

  it('ติดดาวงาน กรองเฉพาะที่ติดดาว · สถิติการเปิดดูนับเฉพาะคนอื่น', async () => {
    const id = await newDesign('งานติดดาว');

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ starred: true, linkAccess: 'VIEW' }).expect(200);

    const starred = await http().get('/api/v1/designs?starred=true&limit=100').set('Authorization', bearer(student, 'student')).expect(200);

    expect(starred.body.data.find((d: { id: string }) => d.id === id)?.starred).toBe(true);

    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(200);
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(200);
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(200);

    const stats = await http().get(`/api/v1/designs/${id}/stats`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(stats.body.data).toMatchObject({ uniqueViewers: 1, totalViews: 2 });
    await http().get(`/api/v1/designs/${id}/stats`).set('Authorization', bearer(other, 'student')).expect(403);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).send({ starred: true }).expect(403);
  });

  it('แผงผู้ดูแล: เฉพาะ staff/admin · สมาชิก โควตา ภาพรวม กิจกรรม และ audit log ทำงานกับฐานจริง', async () => {
    const admin = bearer(staff, 'staff');

    await http().get('/api/v1/subsystem-members/me').set('Authorization', bearer(student, 'student')).expect(200);
    await http().get('/api/v1/subsystem-members').set('Authorization', bearer(student, 'student')).expect(403);
    await http().get('/api/v1/subsystem-members').set('Authorization', bearer(`e2e-${run}-lecturer`, 'lecturer')).expect(403);

    const list = await http().get('/api/v1/subsystem-members?sort=usage&limit=5').set('Authorization', admin).expect(200);

    expect(list.body.meta).toMatchObject({ page: 1, limit: 5 });

    const found = await http().get(`/api/v1/subsystem-members?q=${encodeURIComponent(student)}`).set('Authorization', admin).expect(200);

    expect(found.body.data.map((m: { coreUserId: string }) => m.coreUserId)).toContain(student);

    await http().patch(`/api/v1/subsystem-members/${student}/storage-quota`).set('Authorization', admin).send({ storageQuotaBytes: 10 * 1024 ** 3 }).expect(400);
    await http().patch(`/api/v1/subsystem-members/${student}/storage-quota`).set('Authorization', admin).send({ storageQuotaBytes: 1024 ** 3, reason: 'e2e' }).expect(200);

    const quota = await http().get('/api/v1/quotas').set('Authorization', bearer(student, 'student')).expect(200);

    expect(Number(quota.body.data.quotaBytes)).toBe(1024 ** 3);

    const overview = await http().get('/api/v1/admin-overview').set('Authorization', admin).expect(200);

    expect(overview.body.data.memberCount).toBeGreaterThan(0);

    for (const days of [7, 30, 90]) {
      const activity = await http().get(`/api/v1/admin-activity?days=${days}`).set('Authorization', admin).expect(200);

      expect(activity.body.data.days ?? activity.body.data.series).toBeTruthy();
    }

    await http().get('/api/v1/admin-activity?days=5').set('Authorization', admin).expect(400);

    const logs = await http().get(`/api/v1/audit-logs?action=member.quota_change&actorCoreUserId=${staff}`).set('Authorization', admin).expect(200);

    expect(logs.body.data[0]).toMatchObject({ action: 'member.quota_change', targetId: student });
    await http().get('/api/v1/audit-logs?since=2026-10-10T00:00:00Z&until=2026-10-01T00:00:00Z').set('Authorization', admin).expect(400);
  });

  const reporter = `e2e-${run}-reporter`;
  const admin = `e2e-${run}-admin`;

  it('รายงานเทมเพลต → ผู้ดูแลเห็นในคิว ซ่อนเทมเพลต และผู้รายงานได้รับแจ้ง', async () => {
    const body = { title: 'เทมเพลตถูกรายงาน', designType: 'poster', category: 'event', width: 1123, height: 1587, document: doc };
    const templateId = (await http().post('/api/v1/templates').set('Authorization', bearer(staff, 'staff')).send(body).expect(201)).body.data.id as string;

    // ของตัวเองรายงานไม่ได้ · id ไม่ใช่ UUID = 400 · OTHER ต้องมีรายละเอียดเมื่อเลือก "อื่น ๆ"
    await http().post('/api/v1/reports').set('Authorization', bearer(staff, 'staff')).send({ targetKind: 'TEMPLATE', targetId: templateId, reason: 'SPAM' }).expect(400);
    await http().post('/api/v1/reports').set('Authorization', bearer(reporter, 'student')).send({ targetKind: 'TEMPLATE', targetId: 'abc', reason: 'SPAM' }).expect(400);
    await http().post('/api/v1/reports').set('Authorization', bearer(reporter, 'student')).send({ targetKind: 'OTHER', reason: 'OTHER' }).expect(400);

    const created = await http()
      .post('/api/v1/reports')
      .set('Authorization', bearer(reporter, 'student'))
      .send({ targetKind: 'TEMPLATE', targetId: templateId, reason: 'COPYRIGHT', details: 'ภาพในเทมเพลตมาจากเพจอื่น' })
      .expect(201);
    const reportId = created.body.data.id as string;

    expect(created.body.data).toMatchObject({ status: 'OPEN', targetKind: 'TEMPLATE', reason: 'COPYRIGHT' });

    // รายงานซ้ำระหว่างยังเปิดอยู่ = 409
    await http().post('/api/v1/reports').set('Authorization', bearer(reporter, 'student')).send({ targetKind: 'TEMPLATE', targetId: templateId, reason: 'SPAM' }).expect(409);

    // คิวเป็นของผู้ดูแล (staff/admin) เท่านั้น
    await http().get('/api/v1/reports').set('Authorization', bearer(reporter, 'student')).expect(403);
    await http().get('/api/v1/reports').set('Authorization', bearer(reporter, 'lecturer')).expect(403);

    const queue = await http().get('/api/v1/reports?status=OPEN&targetKind=TEMPLATE&limit=100').set('Authorization', bearer(admin, 'admin')).expect(200);
    const row = queue.body.data.find((r: { id: string }) => r.id === reportId);

    expect(queue.body.meta).toMatchObject({ page: 1, limit: 100 });
    expect(row).toMatchObject({ targetExcerpt: 'เทมเพลตถูกรายงาน', reporterCoreUserId: reporter, target: { exists: true, hidden: false, title: 'เทมเพลตถูกรายงาน' } });

    await http().patch(`/api/v1/reports/${reportId}`).set('Authorization', bearer(admin, 'admin')).send({ status: 'REJECTED', action: 'HIDE_TARGET' }).expect(400);
    await http().patch(`/api/v1/reports/${randomUUID()}`).set('Authorization', bearer(admin, 'admin')).send({ status: 'RESOLVED' }).expect(404);
    await http().patch('/api/v1/reports/not-a-uuid').set('Authorization', bearer(admin, 'admin')).send({ status: 'RESOLVED' }).expect(400);

    const resolved = await http()
      .patch(`/api/v1/reports/${reportId}`)
      .set('Authorization', bearer(admin, 'admin'))
      .send({ status: 'RESOLVED', note: 'ซ่อนระหว่างตรวจสอบลิขสิทธิ์', action: 'HIDE_TARGET' })
      .expect(200);

    expect(resolved.body.data).toMatchObject({ status: 'RESOLVED', actionTaken: 'HIDE_TARGET', resolvedByCoreUserId: admin, target: { hidden: true } });
    await http().patch(`/api/v1/reports/${reportId}`).set('Authorization', bearer(admin, 'admin')).send({ status: 'REJECTED' }).expect(409);

    // เทมเพลตที่ถูกซ่อน: ไม่ขึ้นในรายการ · คนอื่นเปิดไม่ได้ · ใช้สร้างงานไม่ได้ · ผู้เผยแพร่ยังเปิดได้
    const list = await http().get('/api/v1/templates?limit=100&sort=recent').set('Authorization', bearer(reporter, 'student')).expect(200);

    expect(list.body.data.some((t: { id: string }) => t.id === templateId)).toBe(false);
    await http().get(`/api/v1/templates/${templateId}`).set('Authorization', bearer(reporter, 'student')).expect(404);
    await http().post('/api/v1/designs').set('Authorization', bearer(reporter, 'student')).send({ title: 'จากเทมเพลตที่ถูกซ่อน', templateId }).expect(404);
    await http().get(`/api/v1/templates/${templateId}`).set('Authorization', bearer(staff, 'staff')).expect(200);

    await new Promise((resolve) => setImmediate(resolve));

    const notes = await http().get('/api/v1/notifications?limit=50').set('Authorization', bearer(reporter, 'student')).expect(200);

    expect(notes.body.data.some((n: { kind: string }) => n.kind === 'REPORT_UPDATED')).toBe(true);

    const audit = await prisma.auditLog.findMany({ where: { actorCoreUserId: admin } });

    expect(audit.map((a) => a.action).sort()).toEqual(['report.resolved', 'template.unpublish']);
  });

  it('รายงานงานที่แชร์และความคิดเห็น · ปิดลิงก์แชร์จากเรื่องร้องเรียน', async () => {
    const id = await newDesign('งานแชร์ที่ถูกรายงาน');

    // ยังไม่แชร์ = คนอื่นรายงานไม่ได้ (404 ไม่บอกว่ามีงานนี้)
    await http().post('/api/v1/reports').set('Authorization', bearer(reporter, 'student')).send({ targetKind: 'DESIGN', targetId: id, reason: 'INAPPROPRIATE' }).expect(404);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ linkAccess: 'COMMENT' }).expect(200);

    const comment = await http()
      .post(`/api/v1/designs/${id}/comments`)
      .set('Authorization', bearer(student, 'student'))
      .send({ body: 'ข้อความที่ถูกรายงาน', pageId: 'p1' })
      .expect(201);

    const designReport = await http()
      .post('/api/v1/reports')
      .set('Authorization', bearer(reporter, 'student'))
      .send({ targetKind: 'DESIGN', targetId: id, reason: 'PERSONAL_DATA' })
      .expect(201);
    const commentReport = await http()
      .post('/api/v1/reports')
      .set('Authorization', bearer(reporter, 'student'))
      .send({ targetKind: 'COMMENT', targetId: comment.body.data.id, reason: 'SPAM' })
      .expect(201);

    await http().patch(`/api/v1/reports/${designReport.body.data.id}`).set('Authorization', bearer(admin, 'staff')).send({ status: 'RESOLVED', action: 'HIDE_TARGET' }).expect(200);
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(reporter, 'student')).expect(404);

    const owner = await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(owner.body.data.linkAccess).toBe('NONE');

    const closedComment = await http()
      .patch(`/api/v1/reports/${commentReport.body.data.id}`)
      .set('Authorization', bearer(admin, 'staff'))
      .send({ status: 'RESOLVED', action: 'HIDE_TARGET' })
      .expect(200);

    expect(closedComment.body.data.target.exists).toBe(false);
    expect(closedComment.body.data.targetExcerpt).toBe('ข้อความที่ถูกรายงาน');

    const comments = await http().get(`/api/v1/designs/${id}/comments`).set('Authorization', bearer(student, 'student')).expect(200);

    expect(comments.body.meta.total).toBe(0);
  });

  it('ลบถาวร = หายจากผู้ใช้ทุกที่ แต่ผู้ดูแลเห็น 30 วัน · กู้คืนกลับถังขยะ · ลบทันที', async () => {
    const id = await newDesign('งานลบถาวรเก็บ 30 วัน');

    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ trashed: true, linkAccess: 'VIEW' }).expect(200);
    await http().delete(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(200);

    // ผู้ใช้: ไม่อยู่ในถังขยะ เปิดไม่ได้ ลบซ้ำไม่ได้ ลิงก์แชร์ใช้ไม่ได้
    const trash = await http().get('/api/v1/designs?trashed=true&limit=100').set('Authorization', bearer(student, 'student')).expect(200);

    expect(trash.body.data.some((d: { id: string }) => d.id === id)).toBe(false);
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(404);
    await http().get(`/api/v1/designs/${id}`).set('Authorization', bearer(other, 'student')).expect(404);
    await http().delete(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(404);
    await http().patch(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).send({ trashed: false }).expect(404);

    // ผู้ดูแลเท่านั้น
    await http().get('/api/v1/deleted-designs').set('Authorization', bearer(student, 'student')).expect(403);
    await http().get(`/api/v1/deleted-designs/${id}`).set('Authorization', bearer(other, 'lecturer')).expect(403);

    const listed = await http().get(`/api/v1/deleted-designs?q=${encodeURIComponent('งานลบถาวรเก็บ 30 วัน')}&limit=100`).set('Authorization', bearer(admin, 'admin')).expect(200);
    const row = listed.body.data.find((d: { id: string }) => d.id === id);

    expect(row).toMatchObject({ ownerCoreUserId: student, daysLeft: 30, pageCount: 1 });
    expect(listed.body.meta.total).toBeGreaterThanOrEqual(1);

    const byOwner = await http().get(`/api/v1/deleted-designs?q=${student}&limit=100`).set('Authorization', bearer(admin, 'admin')).expect(200);

    expect(byOwner.body.data.some((d: { id: string }) => d.id === id)).toBe(true);

    const detail = await http().get(`/api/v1/deleted-designs/${id}`).set('Authorization', bearer(admin, 'staff')).expect(200);

    expect(detail.body.data.document.version).toBe(1);
    await http().get(`/api/v1/deleted-designs/${randomUUID()}`).set('Authorization', bearer(admin, 'staff')).expect(404);
    await http().get('/api/v1/deleted-designs/not-a-uuid').set('Authorization', bearer(admin, 'staff')).expect(400);
    await http().patch(`/api/v1/deleted-designs/${id}`).set('Authorization', bearer(admin, 'staff')).send({ restore: false }).expect(400);

    const restored = await http().patch(`/api/v1/deleted-designs/${id}`).set('Authorization', bearer(admin, 'staff')).send({ restore: true }).expect(200);

    expect(restored.body.data).toMatchObject({ id, ownerCoreUserId: student });

    const back = await http().get('/api/v1/designs?trashed=true&limit=100').set('Authorization', bearer(student, 'student')).expect(200);
    const inTrash = back.body.data.find((d: { id: string }) => d.id === id);

    expect(inTrash?.linkAccess).toBe('NONE');

    await new Promise((resolve) => setImmediate(resolve));

    const notes = await http().get('/api/v1/notifications?limit=50').set('Authorization', bearer(student, 'student')).expect(200);

    expect(notes.body.data.some((n: { kind: string }) => n.kind === 'DESIGN_RESTORED')).toBe(true);

    // ลบถาวรอีกครั้ง แล้วผู้ดูแลลบจริงทันที
    await http().delete(`/api/v1/designs/${id}`).set('Authorization', bearer(student, 'student')).expect(200);

    const purged = await http().delete(`/api/v1/deleted-designs/${id}`).set('Authorization', bearer(admin, 'staff')).expect(200);

    expect(purged.body.data).toEqual({ id, deleted: true });
    expect(await prisma.design.findUnique({ where: { id } })).toBeNull();

    const actions = (await prisma.auditLog.findMany({ where: { targetId: id } })).map((a) => a.action);

    expect(actions).toEqual(expect.arrayContaining(['design.delete', 'design.restore_by_admin', 'design.purge']));
  });
});
