import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/csmju/primitives';
import { currentPage, useEditor } from '@/lib/editor/store';
import { blankDocument, type PathElement } from '@/lib/editor/types';
import { SignaturePanel } from './signature-panel';

/// แผงลายเซ็น — บั๊กจริง: กดแล้วปล่อยเร็วในจังหวะเดียว (ก่อน React วาดรอบใหม่) ทำให้เส้น null หลุดเข้ารายการ
/// แล้วหน้าแก้ไขพัง "Cannot read properties of null (reading 'length')"

const s = useEditor.getState;

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <SignaturePanel onBack={() => undefined} onClose={() => undefined} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  s().load(
    { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: 1000, height: 600, access: 'OWNER', linkAccess: 'NONE' },
    blankDocument(),
  );
});

describe('ลายเซ็นแบบวาด', () => {
  it('กด-ลาก-ปล่อยในจังหวะเดียวไม่พัง และใส่ลายเซ็นลงงานได้', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'วาด/เขียน' }));

    const pad = screen.getByRole('img', { name: /แผ่นสำหรับเซ็นชื่อ/ });

    pad.setPointerCapture = () => undefined;

    act(() => {
      fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(pad, { clientX: 40, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(pad, { pointerId: 1 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลายเซ็น' }));

    const path = currentPage(s()).elements.find((el) => el.type === 'path') as PathElement | undefined;

    expect(path).toBeDefined();
  });

  it('ลายเซ็นที่บันทึกไว้แบบเสีย (มีเส้น null) เปิดแผงได้ไม่พัง', () => {
    window.localStorage.setItem('csc.signature.v1', JSON.stringify({ draw: { strokes: [null, [1, 2, 3, 4]], color: 'rgb(0 0 0)', weight: 2, width: 500, height: 240 } }));
    renderPanel();

    expect(() => fireEvent.click(screen.getByRole('tab', { name: 'วาด/เขียน' }))).not.toThrow();
    expect(screen.getByRole('img', { name: /แผ่นสำหรับเซ็นชื่อ/ })).toBeInTheDocument();
  });
});
