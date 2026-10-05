# JSON state ของงาน (เวอร์ชัน 1)

CMS ของคณะดึงงานได้ที่ `GET /api/v1/designs/{id}` (ต้องมี token ของเจ้าของงาน) แล้วอ่าน `data.document`
ขนาดผืนผ้าใบอยู่ที่ `data.width` / `data.height` (พิกเซล)

```json
{
  "version": 1,
  "pages": [
    { "id": "page-1", "background": "rgb(255 255 255)", "elements": [ ... ] }
  ]
}
```

- `background` เป็นสี CSS, กราเดียนต์ CSS (`linear-gradient(90deg, rgb(…) 0%, rgb(…) 100%)` หรือ `radial-gradient(circle, …)`) หรือ `null` = โปร่งใส
- ค่าเสริมของหน้า (ไม่มี = ค่าเริ่มต้น): `name` ชื่อหน้า · `hidden` ซ่อนตอนพรีเซนต์/ดาวน์โหลด · `locked` · `notes` โน้ตผู้พรีเซนต์ · `duration` วินาทีตอนเล่นอัตโนมัติ (ค่าเริ่มต้น 5) · `width`/`height` ขนาดเฉพาะหน้านี้ (ไม่มี = ใช้ `data.width`/`data.height` ของงาน) · `audio` เสียงประกอบของหน้า (ดูหัวข้อ "เสียงประกอบของหน้า")
- `elements` เรียงจากล่างขึ้นบน (ตัวสุดท้ายอยู่บนสุด)
- ขนาดรวมไม่เกิน 4 MB · ไม่เกิน 100 หน้า · หน้าละไม่เกิน 1000 ชิ้น

## ค่าที่ทุก element มี

| ฟิลด์ | ความหมาย |
|---|---|
| `id`, `type`, `name` | `type` เป็น `text`, `shape`, `image`, `svg`, `path`, `table`, `chart`, `frame`, `grid` หรือ `video` |
| `x`, `y`, `width`, `height` | กล่องก่อนหมุน (มุมซ้ายบน) หน่วยพิกเซลของหน้า |
| `rotation` | องศา ตามเข็มนาฬิกา รอบจุดกึ่งกลางกล่อง |
| `opacity` | 0–1 |
| `hidden`, `locked` | `hidden: true` ไม่ต้องวาด |
| `groupId` | ชิ้นที่ค่าเดียวกันอยู่กลุ่มเดียวกัน (มีผลแค่ใน editor) |
| `shadow` | ไม่มี/null = ไม่มีเงา · `{ x, y, blur, color }` (px) ใช้กับทุกชนิดยกเว้น text และ table |
| `animation` | แอนิเมชันตอนเข้า: `rise` `pan` `fade` `pop` `wipe` `blur` `drift` `tumble` `breathe` `bounce` (CMS ไม่เล่นก็ได้) |
| `link` | ลิงก์เมื่อกด (https:// หรือ mailto:) |

## เฉพาะแต่ละชนิด

- **text:** `text` (ขึ้นบรรทัดด้วย `\n` และตัดคำตาม `width`), `fontFamily` (ไฟล์อยู่ที่ `/fonts/` ของ frontend), `fontSize`, `fontWeight` (400/700), `italic`, `underline`, `align`, `lineHeight` (เท่าของขนาดตัวอักษร), `letterSpacing` (px), `color`
  - ค่าเสริม: `align` เพิ่ม `justify` · `strike` · `uppercase` (แสดงเป็นตัวพิมพ์ใหญ่) · `list` (`none`/`bullet`/`number` ใส่ "• " หรือ "1. " หน้าทุกย่อหน้า) · `curve` (−100..100 ข้อความโค้งบรรทัดเดียว)
  - `effect`: `{ kind, offset, direction, blur, intensity, color }` ค่า 0–100 (direction เป็นองศา) · kind = `shadow` `lift` `hollow` `splice` `echo` `glitch` `neon` `background` `outline` · สูตรอ้างอิงใน render.ts
- **shape:** `shape` (`rect` · `ellipse` · `triangle` · `triangle-down` · `diamond` · `pentagon` · `hexagon` · `octagon` · `star` · `line` · `arrow` · `curve` · `elbow`), `fill` (สี/กราเดียนต์ CSS · null = ไม่มีสีพื้น), `stroke`, `strokeWidth`, `cornerRadius`, `strokeStyle` (`solid` `dash` `long-dash` `dot`)
  - `line`/`arrow` ลากจากกึ่งกลางขอบซ้ายไปกึ่งกลางขอบขวา · `curve` โค้งจากมุมล่างซ้ายแตะขอบบนไปมุมล่างขวา · `elbow` หักศอกจากมุมบนซ้ายผ่านกึ่งกลางลงไปมุมล่างขวา
  - รูปหลายเหลี่ยมมียอดแรกอยู่บนสุด (หกและแปดเหลี่ยมหมุนครึ่งช่องให้ขอบบนแบน)
- **image:** `src` (รูปของผู้ใช้เป็น `/api/v1/assets/{id}/content` ซึ่งต้องมี session ของเจ้าของ), `assetId`, `cornerRadius`, `flipX`, `flipY`
  - ค่าเสริม: `crop` `{x, y, width, height}` สัดส่วน 0–1 ของรูปต้นฉบับ · `border` `{style, width, color}` · `adjust` ค่าปรับ −100..100 (temperature tint brightness contrast highlights shadows whites blacks vibrance saturation sharpness clarity · vignette/blur 0..100) · `filter` + `filterIntensity` ฟิลเตอร์สำเร็จรูปใน `lib/editor/image-filters.ts`
- **svg:** `svg` (markup ทั้งก้อน ใช้ `currentColor`), `color` (สีที่แทน `currentColor`)
- **path:** เส้นวาดมือและลายเซ็น · `strokes` (อาร์เรย์ของเส้น แต่ละเส้นคือ `[x0, y0, x1, y1, …]` เป็นสัดส่วน 0–1 ของกล่อง), `color`, `strokeWidth` (px), `brush` (`pen` · `marker` · `highlighter` — ไฮไลท์วาดความทึบ 0.45) · ปลายและมุมเส้นกลม
- **table:** ตาราง (เพิ่มในเวอร์ชัน 1 แบบไม่กระทบของเดิม — ตัว render รุ่นเก่าที่ไม่รู้จัก `table` ข้ามไปตามกติกาท้ายไฟล์)
  - `cells` อาร์เรย์ของแถว แต่ละแถวเป็นอาร์เรย์ของช่อง `{ text, fill?, color? }` · ทุกแถวมีจำนวนช่องเท่ากัน · `text` ขึ้นบรรทัดด้วย `
` และตัดคำตามความกว้างช่อง · `fill`/`color` ไม่มีหรือ null = ใช้ค่าของตาราง
  - `columns` สัดส่วนความกว้างของแต่ละคอลัมน์ · `rows` สัดส่วนความสูงของแต่ละแถว (รวมกันได้ 1 ทั้งคู่ เทียบกับ `width`/`height` ของกล่อง)
  - `fontFamily`, `fontSize`, `color` (สีตัวอักษร), `align` (`left` · `center` · `right`) ใช้กับทุกช่อง · ระยะบรรทัด 1.4 เท่า · ระยะจากขอบช่องถึงข้อความ = `fontSize × 0.5` ทุกด้าน · ข้อความจัดกึ่งกลางแนวตั้งในช่อง
  - `header` (true = แถวแรกเป็นหัวตาราง: ตัวหนา 700 · สีพื้น `headerFill` (null = ไม่มี) · สีตัวอักษร `headerColor`) · แถวอื่นน้ำหนัก 400
  - `stripeFill` สีพื้นของแถวเนื้อหาแถวเว้นแถว (แถวที่ 2, 4, … นับจากแถวแรกที่ไม่ใช่หัวตาราง) · null = ไม่สลับสี
  - ลำดับสีพื้นของช่อง: `fill` ของช่อง → `headerFill` (แถวหัวตาราง) → `stripeFill` → โปร่งใส · สีตัวอักษร: `color` ของช่อง → `headerColor` (แถวหัวตาราง) → `color` ของตาราง
  - `borderColor`, `borderWidth` (px วาดกึ่งกลางเส้นแบ่ง), `lines` (`all` เส้นรอบและเส้นแบ่งทุกเส้น · `horizontal` เฉพาะเส้นแนวนอนรวมขอบบน/ล่าง · `none` ไม่มีเส้น)
  - ความสูงแถว = ค่ามากกว่าระหว่าง `rows[i] × height` กับความสูงที่ข้อความในแถวต้องใช้ (`บรรทัดมากสุด × fontSize × 1.4 + fontSize`) · editor บันทึก `height`/`rows` ที่ขยายแล้วเสมอ ตัว render ภายนอกคำนวณซ้ำได้จากสูตรนี้
  - ตัวอย่าง: `{ "type": "table", "cells": [[{ "text": "วิชา" }, { "text": "หน่วยกิต" }], [{ "text": "การเขียนโปรแกรม" }, { "text": "3" }]], "columns": [0.7, 0.3], "rows": [0.5, 0.5], "fontFamily": "Noto Sans Thai", "fontSize": 24, "color": "rgb(15 23 42)", "align": "left", "header": true, "headerFill": "rgb(125 42 232)", "headerColor": "rgb(255 255 255)", "stripeFill": null, "borderColor": "rgb(196 170 245)", "borderWidth": 1.4, "lines": "all" }` (ค่ากล่องและค่าร่วมละไว้)
- **chart:** ชาร์ตที่วาดจากข้อมูล (เวกเตอร์) · `chart` (`column` แท่งตั้ง · `bar` แท่งนอน · `line` · `area` · `pie` · `donut` · `progress-ring`), `labels` (ชื่อรายการ เรียงตามแกน/ชิ้น), `series` (`[{ name, values }]` · `values[i]` คือค่าของ `labels[i]` เป็นตัวเลข), `colors` (สี `rgb()` · ลำดับที่ i ใช้กับชุดข้อมูลที่ i ของแท่ง/เส้น/พื้นที่ หรือชิ้นที่ i ของ pie/donut · วนซ้ำเมื่อสีไม่พอ), `showLegend`, `showLabels` (ตัวเลขบนแท่ง/จุด หรือเปอร์เซ็นต์บนชิ้น), `showGrid` (เส้นตารางและตัวเลขแกน เฉพาะแท่ง/เส้น/พื้นที่), `fontFamily`, `fontSize` (px), `color` (สีตัวอักษรและเส้นแกน)
  - แกนค่าเริ่มที่ 0 เสมอ ปัดเป็นเลขสวย 1·2·5×10ⁿ · `area` ระบายพื้นใต้เส้นความทึบ 0.32
  - `pie`/`donut` ใช้ชุดข้อมูลแรก ค่าติดลบนับเป็น 0 · เปอร์เซ็นต์ปัดให้รวมได้ 100 · เริ่มที่ 12 นาฬิกาวนตามเข็ม · โดนัทรัศมีในเท่ากับ 0.58 ของรัศมีนอก
  - `progress-ring` ใช้ `series[0].values[0]` เป็นเปอร์เซ็นต์ 0–100 และ `labels[0]` เป็นชื่อใต้ตัวเลข (เมื่อ `showLegend`) · สีวงคือ `colors[0]`
  - ค่าที่ขาดหรือผิดรูป ตัว editor เติมให้ตาม `normalizeChart` ใน `chart-data.ts` · สูตรจัดวางอ้างอิงอยู่ที่ `frontend/src/lib/editor/chart.ts` (ใช้ทั้งวาดบนจอและส่งออก SVG)
- **frame (กรอบ):** รูปทรงที่เป็นหน้ากากของรูปหนึ่งรูป · `shape` (`circle` · `rounded` · `square` · `heart` · `star` · `blob` · `arch` · `polaroid` · `phone` · `laptop`), `image` (รูปในกรอบ ดูด้านล่าง · `null` = กรอบว่าง)
  - `polaroid` `phone` `laptop` มีส่วนประดับรอบรูป (กระดาษขาว ขอบเครื่อง ฐานแล็ปท็อป) รูปจึงแสดงในพื้นที่ที่เล็กกว่ากล่อง · ขนาดพื้นที่รูป รูปทรงหน้ากาก และส่วนประดับคำนวณใน `frameArea` / `frameMaskPath` / `frameDecor` ของ `lib/editor/frames.ts` (ได้เป็นสตริง path ของ SVG ใช้ได้ทั้ง `<path d>` และ `new Path2D(d)`)
- **grid (กริด):** หลายช่องตามเค้าโครง แต่ละช่องมีรูปของตัวเอง · `layout` (`cols-2` · `rows-2` · `cols-3` · `grid-2x2` · `big-2` 1 ใหญ่ + 2 เล็ก · `big-3` 1 ใหญ่ + 3 เล็ก · `collage-5` · `collage-6`), `gap` (px ระยะห่างระหว่างช่อง), `cornerRadius` (px มุมโค้งของทุกช่อง), `cells` (อาร์เรย์ตามลำดับช่องของเค้าโครง แต่ละช่องเป็นรูปในกรอบหรือ `null` = ช่องว่าง)
  - ช่องเป็นสัดส่วน 0–1 ของกล่องตาม `GRID_LAYOUTS` ใน `lib/editor/frames.ts` · ระยะห่างแบ่งครึ่งให้ขอบด้านในของแต่ละช่อง ขอบนอกชิดกล่อง (`gridCellRects`)
- **รูปในกรอบ/ช่อง** (`frame.image` และสมาชิกของ `grid.cells`): `src`, `assetId`, `naturalWidth`/`naturalHeight` (ขนาดจริงของรูป), `zoom` (1 = พอดีเต็มช่องแบบ cover · สูงสุด 5), `offsetX`/`offsetY` (0–1 แบบ CSS `object-position`: 0 = ชิดซ้าย/บน · 0.5 = กึ่งกลาง · 1 = ชิดขวา/ล่าง)
  - ค่าเสริม: `name` · `flipX`/`flipY` (พลิกรูปในกรอบ) · `adjust` · `filter` + `filterIntensity` · `colorEdits` · `erase` (ความหมายเดียวกับของ **image**)
  - วางรูป: `scale = max(พื้นที่กว้าง / naturalWidth, พื้นที่สูง / naturalHeight) × zoom` · กล่องรูป `x = พื้นที่.x + (พื้นที่กว้าง − naturalWidth × scale) × offsetX` (แกน y เช่นเดียวกัน) แล้วตัดตามหน้ากาก (`coverRect`)
  - กรอบ/ช่องที่ว่าง editor วาดเป็นพื้นเทาพร้อมไอคอนรูปภาพและคำว่า "ลากรูปมาวางที่นี่" (รวมถึงตอนพรีเซนต์และดาวน์โหลด) · CMS จะไม่วาดช่องว่างก็ได้

- **video:** วิดีโอที่ผู้ใช้อัปโหลดเอง · `src` (`/api/v1/assets/{id}/content` ต้องมี session ของเจ้าของ หรือของผู้ได้ลิงก์งานที่แชร์ · รองรับหัว `Range` สำหรับเลื่อนเล่น), `assetId`, `duration` (วินาทีของไฟล์), `naturalWidth`/`naturalHeight` (ขนาดภาพของไฟล์), `cornerRadius`, `muted` (ปิดเสียงคลิป), `loop` (เล่นวนเมื่อถึงจุดจบ), `trimStart` / `trimEnd` (ช่วงที่เล่นเป็นวินาทีของไฟล์ · `trimEnd: null` = ถึงท้ายไฟล์)
  - ภาพครอปแบบ cover ให้เต็มกล่อง (ไม่บิด) · ไฟล์ MP4 หรือ WebM
  - ภาพนิ่ง (PNG/JPEG/PDF/SVG) และภาพย่อใช้ "ภาพปก" = เฟรมที่วินาที `trimStart` · ตอนพรีเซนต์และไฟล์วิดีโอที่ดาวน์โหลดเล่นจริงตั้งแต่เข้าหน้า
  - CMS ที่จะเล่นให้ใช้ `<video src="{src}#t={trimStart},{trimEnd}" muted?={muted} loop?={loop}>` วางตามกล่องเดียวกับ element อื่น

## เสียงประกอบของหน้า (`audio`)

```json
"audio": [
  { "id": "audio-1a2b3c4d", "assetId": "…", "src": "/api/v1/assets/…/content", "name": "เพลงเปิด.mp3", "duration": 42.5, "volume": 0.8, "loop": true }
]
```

- อาร์เรย์ของเสียงที่ผู้ใช้อัปโหลดเอง (MP3 · M4A · OGG · WAV) ไม่เกิน 5 เสียงต่อหน้า · ไม่มี/ว่าง = หน้านี้ไม่มีเสียง
- `volume` 0–1 · `loop: true` = เล่นวนจนกว่าจะออกจากหน้า · `duration` ความยาวไฟล์เป็นวินาที
- เล่นพร้อมกันทุกเสียงตั้งแต่เข้าหน้าตอนพรีเซนต์ และถูกผสมลงไฟล์วิดีโอที่ดาวน์โหลด (รวมเสียงของวิดีโอที่ `muted: false`) · ภาพนิ่งไม่มีเสียง

ตัว render อ้างอิงอยู่ที่ `frontend/src/lib/editor/render.ts` (การเล่นวิดีโอ/เสียง: `playback.ts`) · element ชนิดที่ไม่รู้จักให้ข้าม
