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
});
