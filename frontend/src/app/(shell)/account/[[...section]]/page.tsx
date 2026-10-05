'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button, ErrorState, FormField, Spinner, Toggle, cx, errorMessage, inputClass, useToast } from '@/components/csmju/primitives';
import { applyTheme } from '@/components/csmju/providers';
import { ROLE_LABEL, useSecondaryOpen } from '@/components/shell/app-shell';
import { ACCOUNT_SECTIONS, type AccountSectionKey } from '@/components/shell/account-sections';
import { api } from '@/lib/csmju/api';
import { useMe, useSignOut } from '@/lib/csmju/session';
import { formatBytes } from '@/lib/format';
import type { Preference, Quota } from '@/lib/types';
import { CORE_HUB_WEB_URL } from '@/lib/csmju/core-hub';


const SECTIONS = ACCOUNT_SECTIONS;

type SectionKey = AccountSectionKey;

export default function AccountPage() {
  const params = useParams<{ section?: string[] }>();
  const key = (params.section?.[0] ?? 'profile') as SectionKey;
  const section = SECTIONS.find((s) => s.key === key);

  const secondaryOpen = useSecondaryOpen();

  if (!section || (params.section?.length ?? 0) > 1) notFound();

  return (
    <div>
      {/* แท็บแนวนอน — ซ่อนบนจอใหญ่เมื่อเปิดเมนูรองของ AppShell (ซึ่งแสดงหัวข้อชุดเดียวกัน) */}
      <nav aria-label="หัวข้อบัญชี" className={cx('csmju-scroll-x flex gap-1 overflow-x-auto border-b border-line px-3 py-2', secondaryOpen && 'lg:hidden')}>
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={s.key === 'profile' ? '/account' : `/account/${s.key}`}
            aria-current={s.key === key ? 'page' : undefined}
            className={cx(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-csmju-caption',
              s.key === key ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-surface-muted',
            )}
          >
            <s.icon aria-hidden className="size-5" />
            <span className="whitespace-nowrap">{s.label}</span>
          </Link>
        ))}
      </nav>
      <div className="csmju-hero px-4 pt-14 pb-10 text-center md:px-10">
        <h1 className="text-csmju-h1 font-bold text-ink">{section.label}</h1>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-16 md:px-6">
        {key === 'profile' && <ProfileSection />}
        {key === 'security' && <SecuritySection />}
        {key === 'accessibility' && <AccessibilitySection />}
        {key === 'messages' && <MessagesSection />}
        {key === 'privacy' && <PrivacySection />}
        {key === 'storage' && <StorageSection />}
        {key === 'team' && <TeamSection />}
        {key === 'apps' && <AppsSection />}
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title && <h2 className="mb-3 text-csmju-h3 font-bold text-ink">{title}</h2>}
      <div className="rounded-2xl border border-line px-5 py-4">{children}</div>
    </section>
  );
}

function CoreHubLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      href={`${CORE_HUB_WEB_URL}${path}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-csmju-caption font-medium text-ink hover:bg-surface-muted"
    >
      {children}
      <ExternalLink aria-hidden className="size-4" />
      <span className="sr-only">(เปิดแท็บใหม่ที่ Core Hub)</span>
    </a>
  );
}

function usePreferences() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['preferences'], queryFn: () => api.get<Preference>('/preferences') });
  const save = useMutation({
    mutationFn: (patch: Partial<Preference>) => api.patch<Preference>('/preferences', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(['preferences'], data);
      toast('บันทึกการตั้งค่าแล้ว');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return { query, save };
}

function ProfileSection() {
  const me = useMe();
  const { query, save } = usePreferences();

  return (
    <>
      <Card title="บัญชีของคุณ">
        <dl className="grid gap-3 text-csmju-body sm:grid-cols-3">
          <dt className="text-muted">อีเมล</dt>
          <dd className="break-all text-ink sm:col-span-2">{me.email}</dd>
          <dt className="text-muted">บทบาทในมหาวิทยาลัย</dt>
          <dd className="text-ink sm:col-span-2">{ROLE_LABEL[me.coreRole] ?? me.coreRole}</dd>
          <dt className="text-muted">สิทธิ์ใน CS Canvas</dt>
          <dd className="text-ink sm:col-span-2">
            {me.subsystemRole === 'ADMIN' ? 'ผู้ดูแลระบบ' : me.subsystemRole === 'EDITOR' ? 'ผู้สร้างและเผยแพร่เทมเพลต' : 'ผู้สร้างงาน'}
          </dd>
        </dl>
        <p className="mt-4 text-csmju-caption text-muted">
          ชื่อ อีเมล และรูปโปรไฟล์เป็นข้อมูลของบัญชี CSMJU2030 แก้ไขได้ที่ Core Hub เท่านั้น
        </p>
        <div className="mt-3">
          <CoreHubLink path="/">แก้ไขโปรไฟล์ที่ Core Hub</CoreHubLink>
        </div>
      </Card>
      <Card title="เกี่ยวกับฉัน">
        {query.isLoading ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <AboutMeForm initial={query.data!.aboutMe} busy={save.isPending} onSave={(aboutMe) => save.mutate({ aboutMe })} />
        )}
      </Card>
    </>
  );
}

function AboutMeForm({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (value: string) => void }) {
  const [aboutMe, setAboutMe] = useState(initial);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(aboutMe.trim());
      }}
    >
      <FormField label="ข้อความแนะนำตัว" hint={`${aboutMe.length}/300 ตัวอักษร · ใช้ภายใน CS Canvas เท่านั้น`}>
        {(props) => (
          <textarea {...props} rows={4} maxLength={300} value={aboutMe} onChange={(e) => setAboutMe(e.target.value)} className={cx(inputClass, 'py-3')} />
        )}
      </FormField>
      <div>
        <Button type="submit" variant="primary" loading={busy}>บันทึก</Button>
      </div>
    </form>
  );
}

function SecuritySection() {
  const me = useMe();
  const signOut = useSignOut();
  const expires = me.session?.expiresAt ? new Date(me.session.expiresAt) : null;

  return (
    <>
      <Card title="ข้อมูลจากการเข้าสู่ระบบ">
        <dl className="grid gap-3 text-csmju-body sm:grid-cols-3">
          <dt className="text-muted">รหัสอ้างอิงผู้ใช้</dt>
          <dd className="break-all font-mono text-csmju-caption text-ink sm:col-span-2">{me.id}</dd>
          <dt className="text-muted">อีเมล</dt>
          <dd className="break-all text-ink sm:col-span-2">{me.email}</dd>
          <dt className="text-muted">บทบาท</dt>
          <dd className="text-ink sm:col-span-2">{ROLE_LABEL[me.coreRole] ?? me.coreRole}</dd>
          {expires && (
            <>
              <dt className="text-muted">เซสชันหมดอายุ</dt>
              <dd className="text-ink sm:col-span-2">
                {expires.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. (ระบบต่ออายุให้เองเมื่อคุณยังใช้งานอยู่)
              </dd>
            </>
          )}
        </dl>
      </Card>
      <Card title="รหัสผ่านและอีเมล">
        <p className="mb-3 text-csmju-body text-body">
          CS Canvas ใช้บัญชี CSMJU2030 ร่วมกับทุกระบบของสาขา จึงไม่มีรหัสผ่านของตัวเอง เปลี่ยนรหัสผ่านหรืออีเมลได้ที่ Core Hub
        </p>
        <div className="flex flex-wrap gap-2">
          <CoreHubLink path="/">จัดการบัญชีที่ Core Hub</CoreHubLink>
        </div>
      </Card>
      <Card title="ออกจากระบบ">
        <p className="mb-3 text-csmju-body text-body">ออกจาก CS Canvas และจากบัญชี CSMJU2030 บนเบราว์เซอร์นี้</p>
        <Button variant="danger" onClick={() => void signOut()}>ออกจากระบบ</Button>
      </Card>
    </>
  );
}

function PreferenceToggles({ fields }: { fields: { key: keyof Preference; label: string; description: string }[] }) {
  const { query, save } = usePreferences();

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  return (
    <div className="divide-y divide-line">
      {fields.map((field) => (
        <Toggle
          key={field.key}
          label={field.label}
          description={field.description}
          checked={Boolean(query.data![field.key])}
          disabled={save.isPending}
          onChange={(value) => save.mutate({ [field.key]: value })}
        />
      ))}
    </div>
  );
}

function ThemeRow() {
  const { query, save } = usePreferences();

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <label htmlFor="theme-select" className="text-csmju-body font-medium text-ink">ธีม</label>
        <p className="text-csmju-caption text-muted">เลือกหน้าตาของ CS Canvas หรือให้เปลี่ยนตามการตั้งค่าของอุปกรณ์</p>
      </div>
      <select
        id="theme-select"
        value={query.data?.theme ?? 'SYSTEM'}
        disabled={!query.data || save.isPending}
        onChange={(e) => {
          const theme = e.target.value as Preference['theme'];

          applyTheme(theme);
          save.mutate({ theme });
        }}
        className={cx(inputClass, 'sm:w-64')}
      >
        <option value="LIGHT">สว่าง</option>
        <option value="DARK">มืด</option>
        <option value="SYSTEM">ตามการตั้งค่าอุปกรณ์</option>
      </select>
    </div>
  );
}

function AccessibilitySection() {
  return (
    <Card>
      <ThemeRow />
      <PreferenceToggles
        fields={[
          { key: 'largeText', label: 'ข้อความขนาดใหญ่', description: 'ขยายตัวอักษรของหน้าจอทั้งระบบขึ้น 12.5%' },
          { key: 'highContrast', label: 'คอนทราสต์สูง', description: 'เพิ่มความเข้มของข้อความรองและเส้นขอบ' },
          { key: 'reduceMotion', label: 'ลดการเคลื่อนไหว', description: 'ปิดแอนิเมชันและการเปลี่ยนผ่านของหน้าจอ' },
        ]}
      />
    </Card>
  );
}

function MessagesSection() {
  return (
    <Card title="แจ้งเตือนในระบบ">
      <PreferenceToggles
        fields={[
          { key: 'notifyTemplateUsed', label: 'มีคนใช้เทมเพลตของฉัน', description: 'แจ้งเมื่อมีผู้ใช้สร้างงานจากเทมเพลตที่คุณเผยแพร่' },
          { key: 'notifyTrash', label: 'ย้ายงานไปถังขยะ', description: 'เตือนว่างานจะถูกลบถาวรเมื่อครบ 30 วัน' },
        ]}
      />
      <p className="mt-3 text-csmju-caption text-muted">CS Canvas ไม่ส่งอีเมลหรือข้อความออกนอกระบบ แจ้งเตือนทั้งหมดอยู่ที่หน้าแจ้งเตือน</p>
    </Card>
  );
}

function PrivacySection() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const downloadData = async () => {
    setBusy(true);

    try {
      const data = await api.get<unknown>('/data-exports');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `cs-canvas-ข้อมูลของฉัน-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="ข้อมูลที่ CS Canvas เก็บ">
        <ul className="list-disc space-y-1 pl-5 text-csmju-body text-body">
          <li>รหัสอ้างอิงผู้ใช้จากบัญชี CSMJU2030 (ไม่เก็บชื่อ อีเมล หรือรหัสผ่าน)</li>
          <li>งานออกแบบ โฟลเดอร์ และเทมเพลตที่คุณสร้าง</li>
          <li>รูปที่คุณอัปโหลด (เห็นได้เฉพาะคุณ)</li>
          <li>การตั้งค่าและการแจ้งเตือนในระบบนี้</li>
        </ul>
        <p className="mt-3 text-csmju-caption text-muted">งานของคุณเป็นส่วนตัว ไม่มีใครเห็นจนกว่าคุณจะเผยแพร่เป็นเทมเพลต (เฉพาะอาจารย์และบุคลากร)</p>
      </Card>
      <Card title="ดาวน์โหลดข้อมูลของฉัน">
        <p className="mb-3 text-csmju-body text-body">ไฟล์ JSON ที่มีงานทุกชิ้น (รวม JSON state) โฟลเดอร์ รายการรูป เทมเพลต และการตั้งค่าของคุณ</p>
        <Button onClick={() => void downloadData()} loading={busy}>
          <Download aria-hidden className="size-4" /> ดาวน์โหลดข้อมูล
        </Button>
      </Card>
    </>
  );
}

function StorageSection() {
  const query = useQuery({ queryKey: ['quotas'], queryFn: () => api.get<Quota>('/quotas') });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const q = query.data!;
  const percent = Math.min(100, (q.usedBytes / q.quotaBytes) * 100);

  return (
    <>
      <Card title="พื้นที่เก็บรูป">
        <p className="text-csmju-body text-ink tabular-nums">
          ใช้ไป {formatBytes(q.usedBytes)} จาก {formatBytes(q.quotaBytes)}
        </p>
        <div
          role="progressbar"
          aria-label="พื้นที่ที่ใช้ไป"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={cx('h-full rounded-full', percent > 90 ? 'bg-danger' : 'bg-primary')} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-csmju-caption text-muted">คงเหลือ {formatBytes(Math.max(0, q.quotaBytes - q.usedBytes))} · ไฟล์ละไม่เกิน 10 MB</p>
      </Card>
      <Card title="สรุปข้อมูลของคุณ">
        <dl className="grid grid-cols-2 gap-3 text-csmju-body">
          <dt className="text-muted">งานออกแบบ</dt>
          <dd className="text-ink tabular-nums">{q.designCount.toLocaleString('th-TH')} ชิ้น</dd>
          <dt className="text-muted">งานในถังขยะ</dt>
          <dd className="text-ink tabular-nums">{q.trashedDesignCount.toLocaleString('th-TH')} ชิ้น</dd>
          <dt className="text-muted">รูปที่อัปโหลด</dt>
          <dd className="text-ink tabular-nums">{q.assetCount.toLocaleString('th-TH')} รูป</dd>
        </dl>
        <Link href="/trash" className="mt-4 inline-flex min-h-11 items-center gap-2 text-csmju-caption font-medium text-primary hover:underline">
          <Trash2 aria-hidden className="size-4" /> จัดการถังขยะเพื่อคืนพื้นที่
        </Link>
      </Card>
    </>
  );
}

function TeamSection() {
  return (
    <Card>
      <p className="text-csmju-body text-body">
        การทำงานเป็นทีมและแชร์งานให้คนอื่นแก้ร่วมกันอยู่ในแผนของช่วงถัดไป ตอนนี้งานทุกชิ้นเป็นของคุณคนเดียว
      </p>
      <p className="mt-3 text-csmju-caption text-muted">ระหว่างนี้ส่งต่องานให้เพื่อนได้ด้วยการดาวน์โหลด PNG/JPEG หรือให้อาจารย์เผยแพร่เป็นเทมเพลต</p>
    </Card>
  );
}

function AppsSection() {
  return (
    <>
      <Card title="CS Canvas บนเว็บคณะ (CMS)">
        <p className="text-csmju-body text-body">
          ทีมพัฒนาเว็บคณะดึง JSON state ของงานไปแสดงเป็น Dynamic Graphic Block ได้ที่ <code className="font-mono text-csmju-caption">GET /api/v1/designs/{"{id}"}</code> ด้วยสิทธิ์ของเจ้าของงาน
        </p>
        <Link href="/help/save-json" className="mt-3 inline-flex min-h-11 items-center text-csmju-caption font-medium text-primary hover:underline">
          อ่านวิธีใช้ JSON state
        </Link>
      </Card>
      <Card title="แอปที่เชื่อมต่อ">
        <p className="text-csmju-body text-body">ยังไม่มีแอปภายนอกที่เชื่อมกับบัญชีของคุณ — CS Canvas ไม่ส่งข้อมูลของคุณให้บริการภายนอก</p>
      </Card>
    </>
  );
}
