'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dialog, FormField, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { REPORT_REASONS, TARGET_LABELS, type ReportReason, type ReportTargetKind } from '@/lib/moderation';

export interface ReportTargetRef {
  kind: ReportTargetKind;
  /// id ของงาน เทมเพลต หรือความคิดเห็น (ไม่มีเมื่อ kind = OTHER)
  id?: string;
  /// ชื่อที่แสดงในหน้าต่าง เช่น ชื่อเทมเพลต
  label?: string;
}

/// หน้าต่าง "รายงาน" — ส่งเรื่องให้ผู้ดูแลระบบตรวจ (POST /reports · เก็บในฐานของ CS Canvas เท่านั้น)
export function ReportDialog({ target, onClose }: { target: ReportTargetRef; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [link, setLink] = useState(() => (target.kind === 'OTHER' && typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''));
  const toast = useToast();
  const send = useMutation({
    mutationFn: () =>
      api.post('/reports', {
        targetKind: target.kind,
        ...(target.id ? { targetId: target.id } : {}),
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(target.kind === 'OTHER' && link.trim().startsWith('/') ? { link: link.trim() } : {}),
      }),
    onSuccess: () => {
      toast('ส่งรายงานให้ผู้ดูแลระบบแล้ว คุณจะได้รับแจ้งเมื่อมีการพิจารณา');
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const needsDetails = reason === 'OTHER' && details.trim().length < 5;
  const title = target.kind === 'OTHER' ? 'รายงานคอนเทนต์' : `รายงาน${TARGET_LABELS[target.kind]}`;

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="danger" disabled={!reason || needsDetails} loading={send.isPending} onClick={() => send.mutate()}>
            ส่งรายงาน
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {target.label && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-csmju-caption text-ink">
            <span className="text-muted">{TARGET_LABELS[target.kind]}: </span>
            <span className="font-semibold">{target.label}</span>
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-csmju-caption font-medium text-ink">เหตุผล</legend>
          {REPORT_REASONS.map((option) => (
            <label
              key={option.value}
              className={cx(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2',
                reason === option.value ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="report-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block text-csmju-body font-medium text-ink">{option.label}</span>
                <span className="block text-csmju-caption text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <FormField
          label={reason === 'OTHER' ? 'รายละเอียด (บังคับ)' : 'รายละเอียดเพิ่มเติม'}
          error={reason === 'OTHER' && details && needsDetails ? 'เขียนอย่างน้อย 5 ตัวอักษร' : null}
          hint={`${details.length}/2000 · ผู้ดูแลเห็นรหัสอ้างอิงบัญชีของคุณเพื่อติดตามเรื่อง แต่เจ้าของเนื้อหาไม่เห็น`}
        >
          {(props) => (
            <textarea {...props} rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} className={cx(inputClass, 'py-3')} />
          )}
        </FormField>
        {target.kind === 'OTHER' && (
          <FormField label="หน้าที่เกี่ยวข้อง" hint="ไม่บังคับ · path ภายในระบบ เช่น /templates">
            {(props) => <input {...props} maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />}
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
