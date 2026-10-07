'use client';

import { CalendarDays, Plus, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useRef, useState } from 'react';
import { Button, FormField, cx, inputClass } from '@/components/csmju/primitives';
import { notifyAction } from '@/lib/editor/action-toast';
import { SWATCHES } from '@/lib/editor/color';
import { paletteMapping, recolorDocument } from '@/lib/editor/design-styles';
import { createShape, createSvg, createTable, createText } from '@/lib/editor/factory';
import {
  HARMONIES, PATTERNS, THAI_MONTHS, calendarGrid, harmonyGradient, harmonyPalette, hslToRgb, parseRgb, patternSvg, rgbCss, rgbToHsl, thaiMonthTitle,
  type Harmony, type PatternKind,
} from '@/lib/editor/generators';
import { svgDataUrl } from '@/lib/editor/render';
import { currentPage, useEditor } from '@/lib/editor/store';
import { newId, type CanvasElement } from '@/lib/editor/types';
import { useEditorUi } from '@/lib/editor/ui-store';
import { ColorPicker } from './color-picker';
import { PanelHeader, RangeField, UnderlineTabs } from './controls';

/// แผง QR Code (qrcode.react — อยู่ใน whitelist) และแผงตัวสร้าง (ลวดลาย ชุดสี กราเดียนต์ ปฏิทิน) — สร้างในเครื่องทั้งหมด

function close() {
  useEditorUi.getState().setPanel(null);
}

function pageSize() {
  const s = useEditor.getState();

  return { width: s.width, height: s.height };
}

// ── QR ────────────────────────────────────────────────────────────

type QrKind = 'url' | 'text' | 'email' | 'phone' | 'wifi';

const QR_KINDS: { key: QrKind; label: string }[] = [
  { key: 'url', label: 'ลิงก์' },
  { key: 'text', label: 'ข้อความ' },
  { key: 'email', label: 'อีเมล' },
  { key: 'phone', label: 'โทร' },
  { key: 'wifi', label: 'Wi-Fi' },
];

/// ข้อความที่เข้ารหัสใน QR ตามชนิด (รูปแบบมาตรฐานที่กล้องมือถืออ่านได้)
export function qrPayload(kind: QrKind, fields: { value: string; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass' }): string {
  const v = fields.value.trim();
  const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

  switch (kind) {
    case 'url':
      return v && !/^[a-z][a-z\d+.-]*:/i.test(v) ? `https://${v}` : v;
    case 'email':
      return v ? `mailto:${v}` : '';
    case 'phone':
      return v ? `tel:${v.replace(/[^\d+]/g, '')}` : '';
    case 'wifi':
      return fields.ssid.trim() ? `WIFI:T:${fields.security};S:${esc(fields.ssid.trim())};P:${fields.security === 'nopass' ? '' : esc(fields.password)};;` : '';
    default:
      return v;
  }
}

export function QrPanel() {
  const [kind, setKind] = useState<QrKind>('url');
  const [value, setValue] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [solidBg, setSolidBg] = useState(true);
  const holder = useRef<HTMLDivElement>(null);
  const payload = qrPayload(kind, { value, ssid, password, security });
  const tooLong = payload.length > 1200;

  const insert = () => {
    const svg = holder.current?.querySelector('svg');

    if (!svg || !payload) return;

    const markup = svg.outerHTML.includes('xmlns=') ? svg.outerHTML : svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const page = pageSize();
    const el = createSvg(page, markup, `QR: ${payload.slice(0, 40)}`);
    const size = Math.round(Math.min(page.width, page.height) * 0.3);

    useEditor.getState().addElements([{ ...el, width: size, height: size, x: Math.round((page.width - size) / 2), y: Math.round((page.height - size) / 2), color: 'rgb(0 0 0)', link: kind === 'url' ? payload : null }]);
    notifyAction('ใส่ QR Code แล้ว');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="QR Code" onClose={close} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        <div role="radiogroup" aria-label="ชนิด QR" className="mb-4 flex flex-wrap gap-2">
          {QR_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              className={cx('min-h-10 rounded-full px-3 text-csmju-caption', kind === k.key ? 'bg-primary text-on-inverse' : 'bg-surface-muted text-ink hover:bg-line')}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {kind === 'wifi' ? (
            <>
              <FormField label="ชื่อ Wi-Fi (SSID)">{(f) => <input {...f} value={ssid} onChange={(e) => setSsid(e.target.value)} className={inputClass} />}</FormField>
              <FormField label="ความปลอดภัย">
                {(f) => (
                  <select {...f} value={security} onChange={(e) => setSecurity(e.target.value as typeof security)} className={inputClass}>
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">ไม่มีรหัสผ่าน</option>
                  </select>
                )}
              </FormField>
              {security !== 'nopass' && (
                <FormField label="รหัสผ่าน Wi-Fi" hint="เก็บไว้ในรูป QR ของงานนี้ — ใครสแกนก็เห็น">
                  {(f) => <input {...f} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="off" />}
                </FormField>
              )}
            </>
          ) : (
            <FormField label={kind === 'url' ? 'ลิงก์' : kind === 'email' ? 'อีเมลปลายทาง' : kind === 'phone' ? 'เบอร์โทร' : 'ข้อความ'} error={tooLong ? 'ยาวเกินไปสำหรับ QR (ไม่เกิน 1200 ตัวอักษร)' : null}>
              {(f) =>
                kind === 'text' ? (
                  <textarea {...f} value={value} rows={3} onChange={(e) => setValue(e.target.value)} className={inputClass} />
                ) : (
                  <input {...f} value={value} inputMode={kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : 'url'} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'url' ? 'www.mju.ac.th' : undefined} className={inputClass} />
                )
              }
            </FormField>
          )}
          <FormField label="ความทนทานเมื่อถูกบัง" hint="สูง = อ่านได้แม้มีโลโก้วางทับ แต่ลายถี่ขึ้น">
            {(f) => (
              <select {...f} value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={inputClass}>
                <option value="L">ต่ำ (7%)</option>
                <option value="M">ปานกลาง (15%)</option>
                <option value="Q">ค่อนข้างสูง (25%)</option>
                <option value="H">สูง (30%)</option>
              </select>
            )}
          </FormField>
          <label className="flex min-h-10 items-center gap-3 text-csmju-caption text-ink">
            <input type="checkbox" checked={solidBg} onChange={(e) => setSolidBg(e.target.checked)} className="size-5 accent-primary" />
            พื้นขาว (ปิด = โปร่งใส)
          </label>
          <div ref={holder} className="flex aspect-square items-center justify-center rounded-xl bg-surface-muted p-4 text-ink">
            {payload && !tooLong ? (
              <QRCodeSVG value={payload} level={level} size={256} marginSize={solidBg ? 2 : 0} bgColor={solidBg ? 'rgb(255 255 255)' : 'transparent'} fgColor="currentColor" className="h-full w-full" title={`QR: ${payload}`} />
            ) : (
              <span className="flex flex-col items-center gap-2 text-csmju-caption text-muted">
                <QrCode aria-hidden className="size-10" /> กรอกข้อมูลเพื่อดูตัวอย่าง
              </span>
            )}
          </div>
          <Button variant="primary" disabled={!payload || tooLong} onClick={insert}>
            <Plus aria-hidden className="size-4" /> ใส่ลงงาน
          </Button>
          <p className="text-csmju-caption text-muted">เปลี่ยนสี QR ได้จากแถบเครื่องมือหลังใส่ (ใช้สีเข้มบนพื้นอ่อนเพื่อให้สแกนได้)</p>
        </div>
      </div>
    </div>
  );
}

// ── ตัวสร้าง ────────────────────────────────────────────────────────

type GenTab = 'pattern' | 'palette' | 'gradient' | 'calendar';

export function GeneratorsPanel() {
  const [tab, setTab] = useState<GenTab>('pattern');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="ตัวสร้าง" onClose={close} />
      <UnderlineTabs
        label="ชนิดตัวสร้าง"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'pattern', label: 'ลวดลาย' },
          { key: 'palette', label: 'ชุดสี' },
          { key: 'gradient', label: 'ไล่สี' },
          { key: 'calendar', label: 'ปฏิทิน' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {tab === 'pattern' && <PatternTab />}
        {tab === 'palette' && <PaletteTab />}
        {tab === 'gradient' && <GradientTab />}
        {tab === 'calendar' && <CalendarTab />}
      </div>
    </div>
  );
}

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('size-9 rounded-full ring-1 ring-line-strong', value === c && 'ring-2 ring-primary ring-offset-2 ring-offset-surface')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function PatternTab() {
  const [kind, setKind] = useState<PatternKind>('dots');
  const [density, setDensity] = useState(16);
  const [color, setColor] = useState('rgb(0 76 153)');

  const make = (asBackground: boolean) => {
    const page = pageSize();
    const el = { ...createSvg(page, patternSvg(kind, page.width, page.height, density), `ลวดลาย${PATTERNS.find((p) => p.key === kind)?.label ?? ''}`), x: 0, y: 0, width: page.width, height: page.height, color, opacity: 0.35 };

    if (asBackground) useEditor.getState().addBehind({ ...el, locked: true });
    else useEditor.getState().addElements([el]);
    notifyAction(asBackground ? 'ใส่ลวดลายเป็นพื้นหลังแล้ว (ล็อกไว้)' : 'ใส่ลวดลายแล้ว');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2">
        {PATTERNS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={kind === p.key}
            onClick={() => setKind(p.key)}
            className={cx('flex flex-col items-center gap-1 rounded-lg p-1 text-csmju-caption text-ink hover:bg-surface-muted', kind === p.key && 'bg-primary-soft ring-2 ring-primary')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG ที่สร้างในเครื่อง */}
            <img src={svgDataUrl({ svg: patternSvg(p.key, 48, 48, 4), color })} alt="" className="size-12 rounded bg-surface" />
            <span className="leading-tight">{p.label}</span>
          </button>
        ))}
      </div>
      <RangeField label="ความถี่ (ช่องตามความกว้าง)" value={density} min={4} max={60} onChange={setDensity} />
      <Swatches label="สีลาย" value={color} onChange={setColor} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => make(false)}>ใส่เป็นชิ้นงาน</Button>
        <Button variant="primary" onClick={() => make(true)}>ใช้เป็นพื้นหลัง</Button>
      </div>
      <p className="text-csmju-caption text-muted">ลายเป็นเวกเตอร์ (SVG) เปลี่ยนสีและความโปร่งใสต่อได้</p>
    </div>
  );
}

function PaletteTab() {
  const [base, setBase] = useState('rgb(0 76 153)');
  const [kind, setKind] = useState<Harmony>('analogous');
  const palette = harmonyPalette(base, kind);

  const asStyle = () => {
    // ชุดสำหรับทั้งงาน: พื้นอ่อนมาก · ตัวอักษรเข้ม · สีเน้นจากชุด
    const [h, s] = rgbToHsl(parseRgb(base) ?? [0, 76, 153]);

    return [rgbCss(hslToRgb(h, Math.min(0.4, s), 0.97)), rgbCss(hslToRgb(h, Math.min(0.5, s), 0.12)), palette[0], palette[1], palette[2]];
  };

  const addSwatches = () => {
    const page = pageSize();
    const d = Math.round(Math.min(page.width, page.height) * 0.12);
    const gap = Math.round(d * 0.25);
    const left = Math.round((page.width - (d * 5 + gap * 4)) / 2);
    const top = Math.round((page.height - d) / 2);
    const group = newId('group');
    const circles: CanvasElement[] = palette.map((c, i) => ({ ...createShape(page, 'ellipse'), name: `สี ${c}`, x: left + i * (d + gap), y: top, width: d, height: d, fill: c, stroke: null, groupId: group }));

    useEditor.getState().addElements(circles);
  };

  return (
    <div className="flex flex-col gap-4">
      <ColorPicker value={base} onChange={setBase} />
      <div className="grid grid-cols-3 gap-2">
        {HARMONIES.map((h) => (
          <button
            key={h.key}
            type="button"
            aria-pressed={kind === h.key}
            onClick={() => setKind(h.key)}
            className={cx('min-h-10 rounded-lg px-2 text-csmju-caption text-ink ring-1 ring-line hover:bg-surface-muted', kind === h.key && 'bg-primary-soft ring-2 ring-primary')}
          >
            {h.label}
          </button>
        ))}
      </div>
      <div className="flex overflow-hidden rounded-xl ring-1 ring-line">
        {palette.map((c) => (
          <span key={c} className="h-16 flex-1" style={{ background: c }} title={c} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={addSwatches}>ใส่เป็นวงกลมสี</Button>
        <Button
          variant="primary"
          onClick={() => {
            const state = useEditor.getState();
            const size = { width: state.baseWidth, height: state.baseHeight };

            state.updateDocument(recolorDocument(state.doc, paletteMapping(state.doc, asStyle(), size), size));
            notifyAction('ใช้ชุดสีกับทั้งงานแล้ว');
          }}
        >
          ใช้กับทั้งงาน
        </Button>
      </div>
    </div>
  );
}

function GradientTab() {
  const [base, setBase] = useState('rgb(140 82 255)');
  const [spread, setSpread] = useState(60);
  const [angle, setAngle] = useState(135);
  const [three, setThree] = useState(false);
  const gradient = harmonyGradient(base, spread, angle, three);
  const selection = useEditor((s) => s.selection);
  const elements = useEditor((s) => currentPage(s).elements);
  const shapes = useMemo(() => elements.filter((el) => selection.includes(el.id) && el.type === 'shape' && !el.locked), [elements, selection]);

  return (
    <div className="flex flex-col gap-4">
      <div className="h-24 rounded-xl ring-1 ring-line" style={{ background: gradient }} />
      <Swatches label="สีหลัก" value={base} onChange={setBase} />
      <RangeField label="ความต่างของเฉด" value={spread} min={10} max={180} suffix="°" onChange={setSpread} />
      <RangeField label="ทิศทาง" value={angle} min={0} max={359} suffix="°" onChange={setAngle} />
      <label className="flex min-h-10 items-center gap-3 text-csmju-caption text-ink">
        <input type="checkbox" checked={three} onChange={(e) => setThree(e.target.checked)} className="size-5 accent-primary" />
        ไล่ 3 สี
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={shapes.length === 0}
          title={selection.length === 0 ? 'เลือกรูปทรงก่อน' : undefined}
          onClick={() => {
            useEditor.getState().updateElements(shapes.map((el) => el.id), () => ({ fill: gradient }));
            notifyAction(`ใส่ไล่สีให้ ${shapes.length} ชิ้น`);
          }}
        >
          ใส่ให้รูปทรงที่เลือก
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            useEditor.getState().setBackground(gradient);
            notifyAction('ใช้ไล่สีเป็นพื้นหลังหน้าแล้ว');
          }}
        >
          ใช้เป็นพื้นหลังหน้า
        </Button>
      </div>
    </div>
  );
}

function CalendarTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [mondayFirst, setMondayFirst] = useState(false);

  const insert = () => {
    const page = pageSize();
    const grid = calendarGrid(year, month, mondayFirst);
    const table = createTable(page, grid.length, 7);
    const filled = { ...table, name: `ปฏิทิน ${thaiMonthTitle(year, month)}`, align: 'center' as const, cells: table.cells.map((row, r) => row.map((cell, c) => ({ ...cell, text: grid[r]?.[c] ?? '' }))) };
    const title = createText(page, 'subheading', { text: thaiMonthTitle(year, month), fontWeight: 700 });
    const group = newId('group');
    const top = Math.max(0, Math.round((page.height - filled.height - title.height * 1.2) / 2));

    useEditor.getState().addElements([
      { ...title, x: filled.x, y: top, width: filled.width, groupId: group },
      { ...filled, y: top + Math.round(title.height * 1.2), groupId: group },
    ]);
    notifyAction(`ใส่ปฏิทิน${thaiMonthTitle(year, month)}แล้ว`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="เดือน">
          {(f) => (
            <select {...f} value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputClass}>
              {THAI_MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="ปี (พ.ศ.)">
          {(f) => (
            <select {...f} value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: 7 }, (_, i) => today.getFullYear() - 1 + i).map((y) => (
                <option key={y} value={y}>{y + 543}</option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      <label className="flex min-h-10 items-center gap-3 text-csmju-caption text-ink">
        <input type="checkbox" checked={mondayFirst} onChange={(e) => setMondayFirst(e.target.checked)} className="size-5 accent-primary" />
        เริ่มสัปดาห์วันจันทร์
      </label>
      <Button variant="primary" onClick={insert}>
        <CalendarDays aria-hidden className="size-4" /> ใส่ปฏิทินเดือนนี้ลงงาน
      </Button>
      <p className="text-csmju-caption text-muted">ปฏิทินเป็นตาราง แก้ข้อความ สี และขนาดช่องต่อได้เหมือนตารางทั่วไป</p>
    </div>
  );
}
