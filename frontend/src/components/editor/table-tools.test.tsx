import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTable } from '@/lib/editor/factory';
import { currentPage, useEditor } from '@/lib/editor/store';
import { useTableUi } from '@/lib/editor/table-ui';
import { blankDocument, type TableElement } from '@/lib/editor/types';
import { TableCellEditor } from './table-editor';
import { TableTools } from './table-tools';

const s = useEditor.getState;

function table(): TableElement {
  return currentPage(s()).elements[0] as TableElement;
}

function Harness() {
  const el = useEditor((state) => currentPage(state).elements[0]);
  const editing = useTableUi((state) => state.editing);

  if (el?.type !== 'table') return null;

  return (
    <div role="toolbar" aria-label="ทดสอบ">
      <TableTools el={el} />
      {editing && <TableCellEditor />}
    </div>
  );
}

beforeEach(() => {
  s().load(
    { designId: 'd1', title: 'งานทดสอบ', designType: 'presentation', width: 1000, height: 1000, access: 'OWNER', linkAccess: 'NONE' },
    blankDocument(),
  );
  s().addElements([createTable({ width: 1000, height: 1000 }, 3, 3, 'header')]);
  useTableUi.setState({ cell: null, editing: false });
});

describe('แถบเครื่องมือตาราง', () => {
  it('สลับหัวตาราง แล้วย้อนกลับได้', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /หัวตาราง/ }));
    expect(table().header).toBe(false);

    act(() => s().undo());
    expect(table().header).toBe(true);
  });

  it('ไม่ได้เลือกช่อง: เพิ่มแถว/คอลัมน์ท้ายตาราง', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /แถวและคอลัมน์/ }));
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มแถวท้ายตาราง/ }));
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มคอลัมน์ท้ายตาราง/ }));

    expect(table().cells).toHaveLength(4);
    expect(table().cells[0]).toHaveLength(4);
  });

  it('เลือกช่องแล้ว: ลบแถวของช่องนั้น และสีพื้นใช้กับช่องนั้นช่องเดียว', () => {
    useTableUi.getState().selectCell({ id: table().id, row: 1, col: 2 });
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /แถวและคอลัมน์/ }));
    fireEvent.click(screen.getByRole('button', { name: /ลบแถวที่ 2/ }));
    expect(table().cells).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'สีพื้นช่องที่เลือก' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'เลือกสี rgb(20 184 166)' })[0]);
    expect(table().cells[1][2].fill).toBe('rgb(20 184 166)');
    expect(table().cells[1][1].fill).toBeUndefined();
  });

  it('พิมพ์ในช่อง · Tab ไปช่องถัดไป · Tab ที่ช่องสุดท้ายเพิ่มแถว · ทั้งหมดย้อนกลับได้ขั้นเดียว', () => {
    const id = table().id;

    act(() => useTableUi.getState().startEditing({ id, row: 2, col: 1 }));
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/แถว 3 คอลัมน์ 2/), { target: { value: 'ตารางเรียน' } });
    fireEvent.keyDown(screen.getByLabelText(/แถว 3 คอลัมน์ 2/), { key: 'Tab' });
    fireEvent.change(screen.getByLabelText(/แถว 3 คอลัมน์ 3/), { target: { value: 'ห้อง' } });
    fireEvent.keyDown(screen.getByLabelText(/แถว 3 คอลัมน์ 3/), { key: 'Tab' });

    expect(table().cells[2][1].text).toBe('ตารางเรียน');
    expect(table().cells[2][2].text).toBe('ห้อง');
    expect(table().cells).toHaveLength(4);
    expect(screen.getByLabelText(/แถว 4 คอลัมน์ 1/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText(/แถว 4 คอลัมน์ 1/), { key: 'Escape' });
    expect(useTableUi.getState().editing).toBe(false);

    act(() => s().undo());
    expect(table().cells).toHaveLength(3);
    expect(table().cells[2][1].text).toBe('');
  });
});
