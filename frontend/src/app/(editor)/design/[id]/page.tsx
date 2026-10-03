'use client';

import { useParams } from 'next/navigation';
import { EditorScreen } from '@/components/editor/editor-screen';

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();

  return <EditorScreen key={id} id={id} />;
}
