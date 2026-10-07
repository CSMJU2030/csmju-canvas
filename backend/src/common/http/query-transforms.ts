import { Transform } from 'class-transformer';

/// แปลง query string "true"/"false" เป็น boolean จริง
///
/// ค่าอื่นปล่อยผ่านเป็นสตริงเดิม เพื่อให้ @IsBoolean ตีกลับเป็น 400 พร้อมข้อความ
/// แทนที่จะตีความเงียบ ๆ ว่าเป็น false
export const BooleanQuery = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

/// ตัดช่องว่างหัวท้าย — ช่องค้นหาที่มีแต่ช่องว่างถือว่าไม่ได้ค้น
export const TrimQuery = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
