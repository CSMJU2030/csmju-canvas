/// ตัวเขียนไฟล์ PowerPoint (.pptx) แบบง่าย — หนึ่งหน้า = หนึ่งสไลด์ที่มีภาพเต็มสไลด์ · ใส่สมุดโน้ตเป็นโน้ตผู้บรรยาย
///
/// เขียน Office Open XML เองแล้วรวมด้วย zip.ts — ไม่ใช้ไลบรารีภายนอก

import { buildZip, type ZipEntry } from './zip';

export interface PptxSlide {
  png: Uint8Array;
  /// โน้ตผู้บรรยาย (สมุดโน้ตของหน้า)
  notes?: string;
}

const EMU_PER_PX = 9525;
/// ขอบเขตขนาดสไลด์ที่ PowerPoint รับ (1 นิ้ว – 56 นิ้ว)
const MIN_EMU = 914400;
const MAX_EMU = 51206400;

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rels(list: { id: string; type: string; target: string }[]): string {
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${r.target}"/>`)
    .join('')}</Relationships>`;
}

/// ขนาดสไลด์เป็น EMU ให้อยู่ในช่วงที่ PowerPoint รับ (ย่อหรือขยายทั้งสองด้านด้วยอัตราเดียวกัน)
export function slideSizeEmu(width: number, height: number): { cx: number; cy: number } {
  let cx = width * EMU_PER_PX;
  let cy = height * EMU_PER_PX;
  const down = Math.min(1, MAX_EMU / cx, MAX_EMU / cy);

  cx *= down;
  cy *= down;

  const up = Math.max(1, MIN_EMU / cx, MIN_EMU / cy);

  return { cx: Math.round(Math.min(MAX_EMU, cx * up)), cy: Math.round(Math.min(MAX_EMU, cy * up)) };
}

const THEME = `${XML}<a:theme xmlns:a="${NS_A}" name="CS Canvas"><a:themeElements>
<a:clrScheme name="CS Canvas"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="7D2AE8"/></a:accent1><a:accent2><a:srgbClr val="00C4CC"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="10B981"/></a:accent4><a:accent5><a:srgbClr val="3B82F6"/></a:accent5><a:accent6><a:srgbClr val="EF4444"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>
<a:fontScheme name="CS Canvas"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="CS Canvas"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`;

const EMPTY_TREE = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

const MASTER = `${XML}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const LAYOUT = `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const NOTES_MASTER = `${XML}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`;

function slideXml(cx: number, cy: number): string {
  return `${XML}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${EMPTY_TREE}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesXml(text: string): string {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => (line ? `<a:p><a:r><a:rPr lang="th-TH"/><a:t>${esc(line)}</a:t></a:r></a:p>` : '<a:p/>'))
    .join('');

  return `${XML}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${EMPTY_TREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

export function buildPptx(slides: PptxSlide[], size: { width: number; height: number }, title: string): Blob {
  if (slides.length === 0) throw new Error('ยังไม่ได้เลือกหน้า');

  const enc = new TextEncoder();
  const { cx, cy } = slideSizeEmu(size.width, size.height);
  const hasNotes = slides.some((s) => s.notes?.trim());
  const files: ZipEntry[] = [];
  const add = (name: string, text: string) => files.push({ name, data: enc.encode(text) });

  add(
    '[Content_Types].xml',
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${
      hasNotes ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' : ''
    }${slides
      .map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>${s.notes?.trim() ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>` : ''}`)
      .join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  add(
    '_rels/.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  add(
    'docProps/core.xml',
    `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`,
  );
  add(
    'docProps/app.xml',
    `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CS Canvas</Application><Slides>${slides.length}</Slides></Properties>`,
  );

  const presRels = [
    { id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' },
    ...slides.map((_, i) => ({ id: `rId${i + 10}`, type: 'slide', target: `slides/slide${i + 1}.xml` })),
    ...(hasNotes ? [{ id: 'rId3', type: 'notesMaster', target: 'notesMasters/notesMaster1.xml' }] : []),
  ];

  add(
    'ppt/presentation.xml',
    `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${
      hasNotes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rId3"/></p:notesMasterIdLst>' : ''
    }<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  add('ppt/_rels/presentation.xml.rels', rels(presRels));
  add('ppt/theme/theme1.xml', THEME);
  add('ppt/slideMasters/slideMaster1.xml', MASTER);
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' },
    ]),
  );
  add('ppt/slideLayouts/slideLayout1.xml', LAYOUT);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]));

  if (hasNotes) {
    add('ppt/theme/theme2.xml', THEME);
    add('ppt/notesMasters/notesMaster1.xml', NOTES_MASTER);
    add('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([{ id: 'rId1', type: 'theme', target: '../theme/theme2.xml' }]));
  }

  slides.forEach((slide, i) => {
    const n = i + 1;
    const withNotes = Boolean(slide.notes?.trim());

    files.push({ name: `ppt/media/image${n}.png`, data: slide.png });
    add(`ppt/slides/slide${n}.xml`, slideXml(cx, cy));
    add(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      rels([
        { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', type: 'image', target: `../media/image${n}.png` },
        ...(withNotes ? [{ id: 'rId3', type: 'notesSlide', target: `../notesSlides/notesSlide${n}.xml` }] : []),
      ]),
    );

    if (withNotes) {
      add(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(slide.notes!));
      add(
        `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
        rels([
          { id: 'rId1', type: 'notesMaster', target: '../notesMasters/notesMaster1.xml' },
          { id: 'rId2', type: 'slide', target: `../slides/slide${n}.xml` },
        ]),
      );
    }
  });

  return new Blob([buildZip(files)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
