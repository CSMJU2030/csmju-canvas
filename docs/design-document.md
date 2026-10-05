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
| `id`, `type`, `name` | `type` เป็น `text`, `shape`, `image`, `svg`, `path` หรือ `video` |
| `x`, `y`, `width`, `height` | กล่องก่อนหมุน (มุมซ้ายบน) หน่วยพิกเซลของหน้า |
| `rotation` | องศา ตามเข็มนาฬิกา รอบจุดกึ่งกลางกล่อง |
| `opacity` | 0–1 |
| `hidden`, `locked` | `hidden: true` ไม่ต้องวาด |
| `groupId` | ชิ้นที่ค่าเดียวกันอยู่กลุ่มเดียวกัน (มีผลแค่ใน editor) |
| `shadow` | ไม่มี/null = ไม่มีเงา · `{ x, y, blur, color }` (px) ใช้กับทุกชนิดยกเว้น text |
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
