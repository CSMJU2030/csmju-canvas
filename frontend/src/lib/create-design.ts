'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from './csmju/api';
import { createImage } from './editor/factory';
import { blankDocument } from './editor/types';
import type { Asset, Design } from './types';

export interface NewDesignInput {
  title: string;
  designType?: string;
  width?: number;
  height?: number;
  templateId?: string;
  copyFromDesignId?: string;
  document?: unknown;
}

/// สร้างงานแล้วเปิด editor ทันที
export function useCreateDesign() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewDesignInput) => api.post<Design>('/designs', input),
    onSuccess: (design) => {
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      router.push(`/design/${design.id}`);
    },
  });
}

/// ขนาดจริงของรูป (ใช้กำหนดขนาดผืนผ้าใบของงาน "แต่งรูป")
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1080 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านไฟล์รูปไม่ได้'));
    };
    img.src = url;
  });
}

const MAX_SIDE = 4000;

/// อัปโหลดรูปแล้วสร้างงานขนาดเท่ารูป (ย่อถ้าด้านยาวเกิน 4000px) โดยวางรูปเต็มหน้า
export async function designFromUpload(file: File): Promise<NewDesignInput> {
  const size = await readImageSize(file);
  const asset = await api.upload<Asset>('/assets', file);
  const scale = Math.min(1, MAX_SIDE / Math.max(size.width, size.height));
  const width = Math.max(16, Math.round(size.width * scale));
  const height = Math.max(16, Math.round(size.height * scale));
  const doc = blankDocument();
  const image = createImage(
    { width, height },
    { src: asset.contentUrl, assetId: asset.id, naturalWidth: width, naturalHeight: height, name: asset.fileName },
  );

  doc.pages[0].elements.push({ ...image, x: 0, y: 0, width, height });

  return {
    title: file.name.replace(/\.[^.]+$/, '') || 'งานแต่งรูป',
    designType: 'photo-edit',
    width,
    height,
    document: doc,
  };
}
