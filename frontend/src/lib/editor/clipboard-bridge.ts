/// เชื่อมคลิปบอร์ดภายในของหน้าแก้ไขกับคลิปบอร์ดของระบบ
///
/// คัดลอกชิ้นงาน (Ctrl+C / เมนูคัดลอก) = เขียนข้อความสั้นที่จำได้ลงคลิปบอร์ดของระบบด้วย ตอนวาง (Ctrl+V)
/// ถ้าคลิปบอร์ดยังเป็นข้อความนี้ = วางชิ้นงานที่คัดลอกไว้ · ถ้าเป็นอย่างอื่น (รูปที่แคปหน้าจอ ข้อความจากที่อื่น)
/// แปลว่าผู้ใช้คัดลอกของใหม่มาจากนอกหน้าแก้ไข ให้นำเข้าสิ่งนั้นแทน

let marker: string | null = null;
/// เขียนคลิปบอร์ดของระบบไม่สำเร็จ (เบราว์เซอร์ไม่อนุญาต) — ตอนวางให้ชิ้นงานภายในมาก่อน
let markerFailed = false;

export function announceInternalCopy(count: number) {
  marker = `[CS Canvas] คัดลอก ${count} ชิ้นงาน · ${Date.now().toString(36)}`;
  markerFailed = false;

  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    markerFailed = true;
    return;
  }

  void navigator.clipboard.writeText(marker).catch(() => {
    markerFailed = true;
  });
}

/// ข้อความในคลิปบอร์ดของระบบตอนวาง ชี้ว่าควรวางชิ้นงานที่คัดลอกในหน้าแก้ไขหรือไม่
export function prefersInternalPaste(clipboardText: string): boolean {
  if (marker === null) return false;

  return markerFailed || clipboardText.trim() === marker;
}
