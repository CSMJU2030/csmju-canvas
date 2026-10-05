'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, Ellipsis, Music, Pause, Play, Repeat, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { EmptyState, ErrorState, IconButton, Menu, Spinner, cx, errorMessage, useToast } from '@/components/csmju/primitives';
import { api, qs } from '@/lib/csmju/api';
import { ACCEPT, createAudioTrack, createVideo, formatDuration, probeMedia, uploadProblem } from '@/lib/editor/media';
import { canEditDoc, currentPage, useEditor } from '@/lib/editor/store';
import type { Asset } from '@/lib/types';
import { PopoverButton, RangeField, ToolbarButton } from './controls';

/// วิดีโอและเสียงของผู้ใช้: รายการในแผงองค์ประกอบ/อัปโหลด · ปุ่มอัปโหลด · แถบเสียงประกอบใต้แถบภาพย่อหน้า
///
/// ไฟล์ทั้งหมดอยู่ในที่เก็บของระบบ (`/api/v1/assets` ต้องมี session) ไม่มีคลังสำเร็จรูปและไม่เรียกบริการภายนอก

type MediaKind = 'video' | 'audio';

/// จำนวนเสียงประกอบสูงสุดต่อหน้า (เพลง + เสียงบรรยาย + เอฟเฟกต์)
const MAX_TRACKS = 5;

// ── ใส่ลงงาน ───────────────────────────────────────────────────────

export function useInsertMedia() {
  const toast = useToast();

  return async (asset: Asset) => {
    const state = useEditor.getState();

    if (!canEditDoc(state)) return;

    try {
      if (asset.mimeType.startsWith('video/')) {
        const info = await probeMedia(asset.contentUrl, 'video');

        state.addElements([createVideo({ width: state.width, height: state.height }, { src: asset.contentUrl, assetId: asset.id, name: asset.fileName, ...info })]);
        return;
      }

      const page = currentPage(state);
      const tracks = page.audio ?? [];

      if (page.locked) {
        toast('หน้านี้ล็อกอยู่ ปลดล็อกก่อนจึงเพิ่มเสียงได้', 'error');
        return;
      }

      if (tracks.length >= MAX_TRACKS) {
        toast(`ใส่เสียงได้หน้าละไม่เกิน ${MAX_TRACKS} เสียง`, 'error');
        return;
      }

      const info = await probeMedia(asset.contentUrl, 'audio');

      state.updatePage(state.pageIndex, {
        audio: [...tracks, createAudioTrack({ src: asset.contentUrl, assetId: asset.id, name: asset.fileName, duration: info.duration })],
      });
      toast(`เพิ่มเสียง “${asset.fileName}” ในหน้า ${state.pageIndex + 1} แล้ว · เล่นตอนพรีเซนต์และอยู่ในไฟล์วิดีโอที่ดาวน์โหลด`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };
}

/// ปุ่มอัปโหลดไฟล์วิดีโอ/เสียง — ตรวจชนิดและขนาดก่อนส่ง · อัปโหลดไฟล์เดียว = ใส่ลงงานทันที
export function useMediaUpload(kinds: MediaKind[], onUploaded?: (asset: Asset) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const done: Asset[] = [];

      for (const file of files) done.push(await api.upload<Asset>('/assets', file));

      return done;
    },
    onSuccess: (done) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['quotas'] });
      if (done.length === 1 && onUploaded) onUploaded(done[0]);
      else toast(`อัปโหลดแล้ว ${done.length} ไฟล์`);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast(errorMessage(error), 'error');
    },
  });

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={kinds.map((k) => ACCEPT[k]).join(',')}
      className="sr-only"
      aria-label={kinds.includes('video') ? 'เลือกวิดีโอที่จะอัปโหลด' : 'เลือกไฟล์เสียงที่จะอัปโหลด'}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        const problems = files.map((file) => uploadProblem(file, kinds)).filter((p): p is string => Boolean(p));
        const ok = files.filter((file) => !uploadProblem(file, kinds));

        event.target.value = '';
        if (problems.length) toast(problems[0], 'error');
        if (ok.length) upload.mutate(ok);
      }}
    />
  );

  return { input, open: () => inputRef.current?.click(), pending: upload.isPending };
}

function UploadButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-csmju-body font-semibold text-on-inverse hover:bg-primary-hover disabled:opacity-60"
    >
      <CloudUpload aria-hidden className="size-5" /> {pending ? 'กำลังอัปโหลด…' : label}
    </button>
  );
}

function useMediaAssets(kind: MediaKind, q = '') {
  return useQuery({
    queryKey: ['assets', 'media', kind, q],
    queryFn: () => api.list<Asset>(`/assets${qs({ kind, q: q || undefined, limit: 60 })}`),
  });
}

function useTrash() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (asset: Asset) => api.patch<Asset>(`/assets/${asset.id}`, { trashed: true }),
    onSuccess: (asset) => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast(`ย้าย “${asset.fileName}” ไปถังขยะแล้ว (งานที่ใช้ไฟล์นี้จะเล่นไม่ได้จนกว่าจะกู้คืน)`);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
}

function AssetMenu({ asset }: { asset: Asset }) {
  const trash = useTrash();

  return (
    <Menu
      label={`ตัวเลือกของ ${asset.fileName}`}
      trigger={<Ellipsis aria-hidden className="size-5" />}
      triggerClassName="bg-surface/90 shadow-none hover:bg-surface-muted"
      items={[{ label: 'ย้ายไปถังขยะ', icon: <Trash2 aria-hidden className="size-4" />, danger: true, onSelect: () => trash.mutate(asset) }]}
    />
  );
}

// ── วิดีโอ ─────────────────────────────────────────────────────────

/// วิดีโอที่ผู้ใช้อัปโหลด (แผงองค์ประกอบ → วิดีโอ และแท็บวิดีโอของแผงอัปโหลด) · กดเพื่อใส่ลงหน้า
export function VideoLibrary({ q = '', showUpload = true }: { q?: string; showUpload?: boolean }) {
  const insert = useInsertMedia();
  const upload = useMediaUpload(['video'], (asset) => void insert(asset));
  const assets = useMediaAssets('video', q);
  const readOnly = useEditor((s) => !canEditDoc(s));
  const uploadButton = <UploadButton label="อัปโหลดวิดีโอ" pending={upload.pending} onClick={upload.open} />;

  return (
    <div className="flex flex-col gap-3">
      {upload.input}
      {showUpload && !readOnly && uploadButton}
      <p className="text-csmju-caption text-muted">MP4 หรือ WebM ไม่เกิน 50 MB · เล่นตอนพรีเซนต์และในไฟล์วิดีโอที่ดาวน์โหลด · ไฟล์ของคุณเห็นได้เฉพาะคุณ</p>
      {assets.isLoading ? (
        <Spinner label="กำลังโหลดวิดีโอ…" />
      ) : assets.isError ? (
        <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
      ) : assets.data!.items.length === 0 ? (
        q ? (
          <p className="text-csmju-caption text-muted">ไม่พบวิดีโอที่ค้นหา</p>
        ) : (
          <EmptyState
            title="ยังไม่มีวิดีโอ"
            description="อัปโหลดคลิปของคุณเอง แล้วกดที่คลิปเพื่อใส่ลงหน้า ตัดต่อ ปิดเสียง หรือเล่นวนซ้ำได้จากแถบด้านบน"
            action={readOnly ? undefined : uploadButton}
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {assets.data!.items.map((asset) => (
            <li key={asset.id} className="group relative">
              <VideoTile asset={asset} disabled={readOnly} onInsert={() => void insert(asset)} />
              <div className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
                <AssetMenu asset={asset} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VideoTile({ asset, disabled, onInsert }: { asset: Asset; disabled: boolean; onInsert: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onInsert}
      aria-label={`ใส่วิดีโอ ${asset.fileName}${duration !== null ? ` ยาว ${formatDuration(duration)}` : ''}`}
      title={asset.fileName}
      // ชี้ค้างเพื่อดูตัวอย่างแบบไม่มีเสียง (แบบ Canva)
      onPointerEnter={() => void videoRef.current?.play().catch(() => undefined)}
      onPointerLeave={() => {
        const video = videoRef.current;

        if (!video) return;
        video.pause();
        video.currentTime = 0.1;
      }}
      className="relative block aspect-video w-full overflow-hidden rounded-xl bg-inverse text-on-inverse hover:shadow-csmju-md disabled:cursor-default"
    >
      {broken ? (
        <span className="flex size-full items-center justify-center px-2 text-center text-csmju-caption">เบราว์เซอร์นี้เปิดคลิปนี้ไม่ได้</span>
      ) : (
        <video
          ref={videoRef}
          src={`${asset.contentUrl}#t=0.1`}
          preload="metadata"
          muted
          loop
          playsInline
          aria-hidden
          tabIndex={-1}
          onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)}
          onError={() => setBroken(true)}
          className="pointer-events-none size-full object-cover"
        />
      )}
      {duration !== null && (
        <span className="absolute bottom-1 left-1 rounded bg-inverse/75 px-1.5 text-csmju-caption leading-tight tabular-nums">{formatDuration(duration)}</span>
      )}
    </button>
  );
}

// ── เสียง ──────────────────────────────────────────────────────────

/// ตัวฟังตัวอย่างเสียงตัวเดียวทั้งหน้า — กดฟังเสียงใหม่แล้วเสียงเดิมหยุด
const preview = { audio: null as HTMLAudioElement | null, src: null as string | null, listeners: new Set<() => void>() };

function notifyPreview() {
  for (const listener of preview.listeners) listener();
}

function stopPreview() {
  preview.audio?.pause();
  preview.src = null;
  notifyPreview();
}

function togglePreview(src: string, volume = 1) {
  if (preview.src === src) {
    stopPreview();
    return;
  }

  preview.audio ??= new Audio();
  preview.audio.onended = stopPreview;
  preview.audio.src = src;
  preview.audio.volume = volume;
  preview.src = src;
  void preview.audio.play().catch(stopPreview);
  notifyPreview();
}

function usePreviewing(src: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      preview.listeners.add(listener);

      return () => preview.listeners.delete(listener);
    },
    () => preview.src === src,
    () => false,
  );
}

function PreviewButton({ src, name, volume }: { src: string; name: string; volume?: number }) {
  const playing = usePreviewing(src);

  return (
    <IconButton label={playing ? `หยุดฟัง ${name}` : `ฟังตัวอย่าง ${name}`} onClick={() => togglePreview(src, volume)} className={cx('shrink-0', playing && 'bg-primary-soft text-primary')}>
      {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
    </IconButton>
  );
}

/// ไฟล์เสียงที่ผู้ใช้อัปโหลด · กดชื่อเพื่อเพิ่มเป็นเสียงประกอบของหน้าปัจจุบัน
export function AudioLibrary({ q = '', showUpload = true }: { q?: string; showUpload?: boolean }) {
  const insert = useInsertMedia();
  const upload = useMediaUpload(['audio'], (asset) => void insert(asset));
  const assets = useMediaAssets('audio', q);
  const readOnly = useEditor((s) => !canEditDoc(s));
  const uploadButton = <UploadButton label="อัปโหลดเสียง" pending={upload.pending} onClick={upload.open} />;

  // ปิดแผงแล้วเสียงตัวอย่างหยุด
  useEffect(() => stopPreview, []);

  return (
    <div className="flex flex-col gap-3">
      {upload.input}
      {showUpload && !readOnly && uploadButton}
      <p className="text-csmju-caption text-muted">MP3 · M4A · OGG · WAV ไม่เกิน 50 MB · เสียงเล่นตอนพรีเซนต์หน้านั้นและอยู่ในไฟล์วิดีโอที่ดาวน์โหลด</p>
      {assets.isLoading ? (
        <Spinner label="กำลังโหลดเสียง…" />
      ) : assets.isError ? (
        <ErrorState message={errorMessage(assets.error)} onRetry={() => void assets.refetch()} />
      ) : assets.data!.items.length === 0 ? (
        q ? (
          <p className="text-csmju-caption text-muted">ไม่พบไฟล์เสียงที่ค้นหา</p>
        ) : (
          <EmptyState
            title="ยังไม่มีไฟล์เสียง"
            description="อัปโหลดเพลงหรือเสียงบรรยายที่คุณมีสิทธิ์ใช้ แล้วกดเพื่อเพิ่มลงหน้านี้"
            icon={<Music aria-hidden className="size-8" />}
            action={readOnly ? undefined : uploadButton}
          />
        )
      ) : (
        <ul className="flex flex-col gap-1">
          {assets.data!.items.map((asset) => (
            <AudioRow key={asset.id} asset={asset} disabled={readOnly} onAdd={() => void insert(asset)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AudioRow({ asset, disabled, onAdd }: { asset: Asset; disabled: boolean; onAdd: () => void }) {
  const [duration, setDuration] = useState<number | null>(null);

  return (
    <li className="group flex items-center gap-1 rounded-xl pr-1 hover:bg-surface-muted">
      <PreviewButton src={asset.contentUrl} name={asset.fileName} />
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        aria-label={`เพิ่มเสียง ${asset.fileName} ลงหน้านี้`}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left disabled:cursor-default"
      >
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-type-red to-type-pink text-on-inverse">
          <Music className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-csmju-caption font-semibold text-ink">{asset.fileName}</span>
          <span className="block text-csmju-caption text-muted tabular-nums">{duration !== null ? formatDuration(duration) : '…'}</span>
        </span>
      </button>
      {/* อ่านแค่ส่วนหัวของไฟล์เพื่อรู้ความยาว */}
      <audio src={asset.contentUrl} preload="metadata" aria-hidden className="hidden" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
      <AssetMenu asset={asset} />
    </li>
  );
}

// ── แถบเสียงประกอบของหน้า (ใต้แถบภาพย่อหน้า) ─────────────────────

/// เสียงประกอบของหน้าปัจจุบัน แบบแถบเสียงใต้หน้าของ Canva: ฟังตัวอย่าง · ความดัง · เล่นวน · ลบ
export function AudioTrackBar() {
  const pageIndex = useEditor((s) => s.pageIndex);
  const tracks = useEditor((s) => currentPage(s).audio);
  const locked = useEditor((s) => Boolean(currentPage(s).locked));
  const readOnly = useEditor((s) => !canEditDoc(s)) || locked;

  if (!tracks?.length) return null;

  const update = (id: string, patch: { volume?: number; loop?: boolean }) =>
    useEditor.getState().updatePage(pageIndex, { audio: tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const remove = (id: string) => {
    const next = tracks.filter((t) => t.id !== id);

    stopPreview();
    useEditor.getState().updatePage(pageIndex, { audio: next.length ? next : undefined });
  };

  return (
    <div className="shrink-0 bg-stage px-3 pb-2">
      <ul aria-label={`เสียงประกอบของหน้า ${pageIndex + 1}`} className="flex flex-col gap-1">
        {tracks.map((track) => (
          <li key={track.id} className="flex min-h-11 items-center gap-1 rounded-lg border border-type-purple/40 bg-type-purple/15 pr-1">
            <PreviewButton src={track.src} name={track.name} volume={track.volume} />
            <Waveform />
            <span className="min-w-0 flex-1 truncate text-csmju-caption font-semibold text-ink">{track.name || 'เสียงประกอบ'}</span>
            <span className="text-csmju-caption text-body tabular-nums">{formatDuration(track.duration)}</span>
            {!readOnly && (
              <>
                <PopoverButton label={`ความดังของ ${track.name}`} trigger={<Volume2 aria-hidden className="size-5" />} panelClassName="w-72 p-4">
                  <RangeField label="ความดัง" value={Math.round(track.volume * 100)} min={0} max={100} suffix="%" onChange={(v) => update(track.id, { volume: v / 100 })} />
                </PopoverButton>
                <ToolbarButton label={track.loop ? 'เลิกเล่นวน' : 'เล่นวนจนกว่าจะเปลี่ยนหน้า'} active={track.loop} onClick={() => update(track.id, { loop: !track.loop })}>
                  <Repeat aria-hidden className="size-5" />
                </ToolbarButton>
                <IconButton label={`ลบเสียง ${track.name} ออกจากหน้านี้`} onClick={() => remove(track.id)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/// ลายคลื่นเสียงประดับ (คงที่ ไม่ได้อ่านจากไฟล์)
function Waveform(): ReactNode {
  return (
    <svg aria-hidden viewBox="0 0 40 16" className="hidden h-4 w-10 shrink-0 text-type-purple sm:block">
      {[3, 7, 11, 5, 13, 9, 4, 12, 6, 10].map((h, i) => (
        <rect key={i} x={i * 4} y={(16 - h) / 2} width={2} height={h} rx={1} fill="currentColor" />
      ))}
    </svg>
  );
}
