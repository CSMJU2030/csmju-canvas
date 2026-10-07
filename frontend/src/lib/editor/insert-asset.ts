import { createImage } from './factory';
import { fillSelectedFrame } from './frame-actions';
import { originOfAsset } from './image-sources';
import { useEditor } from './store';
import type { Asset } from '@/lib/types';

/// ใส่รูปจากคลังของฉัน (asset) ลงหน้า — ใช้ทั้งแผง "ภาพที่นำเข้า" และถาดรับภาพ

function loadImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 400 });
    img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้'));
    img.src = src;
  });
}

/// ใส่ภาพที่นำเข้าลงหน้า (หรือลงกรอบที่เลือกอยู่) · คืน id ของชิ้นรูปใหม่ (ใส่ลงกรอบ = null)
export async function insertImported(asset: Asset): Promise<string | null> {
  const size = await loadImage(asset.contentUrl);
  const source = { src: asset.contentUrl, assetId: asset.id, naturalWidth: size.width, naturalHeight: size.height, name: asset.fileName, origin: originOfAsset(asset), mimeType: asset.mimeType };

  if (fillSelectedFrame(source)) return null;

  const state = useEditor.getState();
  const image = createImage({ width: state.width, height: state.height }, source);

  state.addElements([image]);

  return image.id;
}
