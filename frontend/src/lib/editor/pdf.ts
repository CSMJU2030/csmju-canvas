/// สร้าง PDF หลายหน้าจากภาพ JPEG ของแต่ละหน้า (PDF มาตรฐาน) — เขียนโครงสร้าง PDF เองไม่ใช้ไลบรารี
///
/// ขนาดหน้าเป็นพอยต์ (1 px ที่ 96 dpi = 0.75 pt) จึงพิมพ์ออกมาได้ขนาดจริงตามที่ออกแบบ
/// ข้อความในไฟล์เป็นภาพ (ไม่ใช่เวกเตอร์) — PDF แบบเวกเตอร์ต้องใช้ pdf-lib ซึ่งยังไม่ได้รับข้อยกเว้น

export interface PdfPage {
  /// ไบต์ของไฟล์ JPEG
  jpeg: Uint8Array;
  /// ขนาดพิกเซลของภาพ
  imageWidth: number;
  imageHeight: number;
  /// ขนาดหน้าในหน่วยพิกเซลของงาน (กำหนดขนาดกระดาษ)
  width: number;
  height: number;
}

export function buildPdf(pages: PdfPage[], title: string): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;

    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
    body();
    write('\nendobj\n');
  };

  // วัตถุ: 1 catalog · 2 pages · 3 info · ต่อหน้าละ 3 (page, content, image)
  const pageIds = pages.map((_, i) => 4 + i * 3);

  write('%PDF-1.4\n%âãÏÓ\n');
  object(1, () => write('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => write(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  object(3, () => write(`<< /Title <${utf16Hex(title)}> /Producer (CS Canvas) >>`));

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const w = (page.width * 0.75).toFixed(2);
    const h = (page.height * 0.75).toFixed(2);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;

    object(pageId, () =>
      write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`),
    );
    object(pageId + 1, () => write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(pageId + 2, () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      write(page.jpeg);
      write('\nendstream');
    });
  });

  const total = 4 + pages.length * 3;
  const xref = length;

  write(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/// ข้อความ Unicode สำหรับชื่อเอกสาร (UTF-16BE พร้อม BOM แบบเลขฐานสิบหก)
function utf16Hex(text: string): string {
  let hex = 'FEFF';

  for (const ch of text.slice(0, 120)) {
    const code = ch.codePointAt(0)!;

    if (code > 0xffff) continue;
    hex += code.toString(16).padStart(4, '0').toUpperCase();
  }

  return hex;
}
