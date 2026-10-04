'use client';

import { useParams } from 'next/navigation';
import { EditorScreen } from '@/components/editor/editor-screen';
import { CreateDesignProvider } from '@/components/shell/create-dialog';

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();

  // เมนูไฟล์ → สร้างดีไซน์ใหม่ เปิดหน้าต่างสร้างดีไซน์ตัวเดียวกับหน้าแรก
  return (
    <CreateDesignProvider>
      <EditorScreen key={id} id={id} />
    </CreateDesignProvider>
  );
}
