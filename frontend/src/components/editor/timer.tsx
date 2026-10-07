'use client';

import { Minus, Music, Pause, Play, Plus, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import { FloatingPanel, useAnchoredMenu } from '@/components/csmju/floating';
import { cx } from '@/components/csmju/primitives';

/// ตัวจับเวลา (ภาพบรีฟ "ตัวจับเวลา") — นับถอยหลัง ปรับทีละ 1 นาที เปิดเพลงประกอบได้
///
/// เพลงและเสียงเตือนสังเคราะห์ด้วย Web Audio ในเบราว์เซอร์ ไม่มีไฟล์เสียงหรือบริการภายนอก

type TrackKey = 'calm' | 'upbeat' | 'playful' | 'chime' | 'lofi' | 'none';

interface TimerState {
  visible: boolean;
  duration: number;
  remaining: number;
  running: boolean;
  endsAt: number | null;
  track: TrackKey;
  volume: number;
  finished: boolean;
  show(): void;
  hide(): void;
  adjust(minutes: number): void;
  start(): void;
  pause(): void;
  reset(): void;
  tick(): void;
  setTrack(track: TrackKey): void;
  setVolume(volume: number): void;
}

const MINUTE = 60_000;

export const useTimerStore = create<TimerState>((set, get) => ({
  visible: false,
  duration: 5 * MINUTE,
  remaining: 5 * MINUTE,
  running: false,
  endsAt: null,
  track: 'none',
  volume: 0.5,
  finished: false,

  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  adjust(minutes) {
    const s = get();
    const duration = Math.max(MINUTE, Math.min(60 * MINUTE, s.duration + minutes * MINUTE));
    const remaining = Math.max(0, Math.min(duration, s.remaining + minutes * MINUTE));

    set({ duration, remaining, endsAt: s.running ? Date.now() + remaining : null, finished: false });
  },
  start() {
    const s = get();
    const remaining = s.remaining > 0 ? s.remaining : s.duration;

    set({ running: true, remaining, endsAt: Date.now() + remaining, finished: false });
    audio.music(s.track, s.volume);
  },
  pause() {
    const s = get();

    set({ running: false, endsAt: null, remaining: s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remaining });
    audio.stopMusic();
  },
  reset() {
    set({ running: false, endsAt: null, remaining: get().duration, finished: false });
    audio.stopMusic();
  },
  tick() {
    const s = get();

    if (!s.running || !s.endsAt) return;

    const remaining = Math.max(0, s.endsAt - Date.now());

    if (remaining === 0) {
      set({ running: false, endsAt: null, remaining: 0, finished: true });
      audio.stopMusic();
      audio.chime(s.volume);
    } else {
      set({ remaining });
    }
  },
  setTrack(track) {
    set({ track });
    if (get().running) audio.music(track, get().volume);
  },
  setVolume(volume) {
    set({ volume });
    audio.setVolume(volume);
  },
}));

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);

  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/// ใช้ในแถบล่าง: ปุ่มตัวจับเวลาแสดงเวลาที่เหลือขณะเดิน
export function useTimer() {
  const visible = useTimerStore((s) => s.visible);
  const running = useTimerStore((s) => s.running);
  const remaining = useTimerStore((s) => s.remaining);

  useTimerTicker();

  return {
    visible,
    running,
    label: formatClock(remaining),
    toggle: () => (visible ? useTimerStore.getState().hide() : useTimerStore.getState().show()),
  };
}

function useTimerTicker() {
  const running = useTimerStore((s) => s.running);

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => useTimerStore.getState().tick(), 250);

    return () => window.clearInterval(id);
  }, [running]);
}

const TRACKS: { key: TrackKey; label: string }[] = [
  { key: 'calm', label: 'ผ่อนคลาย' },
  { key: 'upbeat', label: 'เร้าใจ' },
  { key: 'playful', label: 'สนุกสนาน' },
  { key: 'chime', label: 'กระดิ่ง' },
  { key: 'lofi', label: 'โลไฟ' },
  { key: 'none', label: 'ไม่มีเพลง' },
];

/// วงกลมตัวจับเวลาที่ลอยมุมซ้ายล่างของผืนผ้าใบ
export function TimerWidget() {
  const s = useTimerStore();
  const { open: musicOpen, setOpen: setMusicOpen, anchorRef: musicAnchor, menuRef: musicMenu } = useAnchoredMenu('start');
  const { open: volumeOpen, setOpen: setVolumeOpen, anchorRef: volumeAnchor, menuRef: volumeMenu } = useAnchoredMenu('start');
  const progress = s.duration > 0 ? 1 - s.remaining / s.duration : 0;
  const R = 54;
  const C = 2 * Math.PI * R;

  useTimerTicker();

  if (!s.visible) return null;

  return (
    <div className="csmju-pop pointer-events-auto absolute bottom-4 left-4 z-20 flex flex-col items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 rounded-full bg-surface px-2 py-1 shadow-csmju-md">
        <button
          ref={musicAnchor}
          type="button"
          aria-label="เพลงประกอบ"
          title="เพลงประกอบ"
          aria-expanded={musicOpen}
          onClick={() => setMusicOpen((v) => !v)}
          className="inline-flex size-8 items-center justify-center rounded-full text-ink hover:bg-surface-muted"
        >
          <Music aria-hidden className="size-4" />
        </button>
        <button
          ref={volumeAnchor}
          type="button"
          aria-label="ระดับเสียง"
          title="ระดับเสียง"
          aria-expanded={volumeOpen}
          onClick={() => setVolumeOpen((v) => !v)}
          className="inline-flex size-8 items-center justify-center rounded-full text-ink hover:bg-surface-muted"
        >
          <Volume2 aria-hidden className="size-4" />
        </button>
        <button type="button" aria-label="ย่อให้เล็กสุด" title="ย่อให้เล็กสุด" onClick={() => s.hide()} className="inline-flex size-8 items-center justify-center rounded-full text-ink hover:bg-surface-muted">
          <Minus aria-hidden className="size-4" />
        </button>
      </div>
      <FloatingPanel open={musicOpen} menuRef={musicMenu} label="เลือกเพลงประกอบ" className="w-48 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg">
        {TRACKS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="menuitemradio"
            aria-checked={s.track === t.key}
            onClick={() => {
              s.setTrack(t.key);
              setMusicOpen(false);
            }}
            className={cx('flex min-h-10 w-full items-center px-3 text-left text-csmju-caption hover:bg-surface-muted', s.track === t.key ? 'font-semibold text-primary' : 'text-ink')}
          >
            {t.label}
          </button>
        ))}
      </FloatingPanel>
      <FloatingPanel open={volumeOpen} menuRef={volumeMenu} role="dialog" label="ระดับเสียง" className="rounded-xl border border-line bg-surface px-3 py-2 shadow-csmju-lg">
        <label className="flex items-center gap-2 text-csmju-caption text-ink">
          <span className="sr-only">ระดับเสียง</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.setVolume(Number(e.target.value))} className="w-32 accent-primary" />
        </label>
      </FloatingPanel>
      <div className={cx('relative flex size-36 items-center justify-center rounded-full shadow-csmju-lg', s.finished ? 'bg-primary text-on-inverse' : 'bg-surface text-ink')}>
        <svg aria-hidden viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90">
          <circle cx={60} cy={60} r={R} fill="none" strokeWidth={5} className="stroke-surface-muted" />
          <circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 250ms linear' }}
          />
        </svg>
        <div className="relative flex flex-col items-center">
          <div className="flex items-center gap-1 text-csmju-caption">
            <button type="button" aria-label="ลด 1 นาที" onClick={() => s.adjust(-1)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-muted/60">
              −
            </button>
            1 นาที
            <button type="button" aria-label="เพิ่ม 1 นาที" onClick={() => s.adjust(1)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-muted/60">
              <Plus aria-hidden className="size-3" />
            </button>
          </div>
          <p role="timer" aria-live="off" className={cx('text-csmju-h1 font-bold tabular-nums', s.running && !s.finished && 'text-primary')}>
            {formatClock(s.remaining)}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={s.running ? 'หยุดชั่วคราว' : 'เริ่ม'}
              onClick={() => (s.running ? s.pause() : s.start())}
              className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-on-inverse"
            >
              {s.running ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
            </button>
            <button type="button" aria-label="เริ่มใหม่" onClick={() => s.reset()} className="inline-flex size-7 items-center justify-center rounded-full hover:bg-surface-muted/60">
              <RotateCcw aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>
      {s.finished && <p className="sr-only" role="status">หมดเวลาแล้ว</p>}
    </div>
  );
}

// ── เสียง (Web Audio) ───────────────────────────────────────────────

const PATTERNS: Record<Exclude<TrackKey, 'none'>, { bpm: number; wave: OscillatorType; notes: number[] }> = {
  calm: { bpm: 60, wave: 'sine', notes: [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2] },
  upbeat: { bpm: 128, wave: 'square', notes: [329.6, 0, 392, 329.6, 440, 0, 392, 523.3] },
  playful: { bpm: 110, wave: 'triangle', notes: [523.3, 659.3, 784, 659.3, 587.3, 698.5, 880, 698.5] },
  chime: { bpm: 50, wave: 'sine', notes: [880, 0, 1318.5, 0, 1046.5, 0, 784, 0] },
  lofi: { bpm: 75, wave: 'triangle', notes: [220, 261.6, 329.6, 0, 196, 246.9, 293.7, 0] },
};

const audio = (() => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer: number | null = null;

  const ensure = () => {
    if (typeof window === 'undefined') return null;

    ctx ??= new AudioContext();
    if (!master) {
      master = ctx.createGain();
      master.connect(ctx.destination);
    }

    void ctx.resume();

    return ctx;
  };

  const note = (freq: number, at: number, length: number, wave: OscillatorType, level: number) => {
    if (!ctx || !master || !freq) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };

  return {
    music(track: TrackKey, volume: number) {
      this.stopMusic();

      if (track === 'none') return;

      const c = ensure();

      if (!c || !master) return;

      master.gain.value = volume;

      const pattern = PATTERNS[track];
      const beat = 60 / pattern.bpm;
      let step = 0;
      const play = () => {
        const t = c.currentTime + 0.05;

        note(pattern.notes[step % pattern.notes.length], t, beat * 0.9, pattern.wave, pattern.wave === 'square' ? 0.05 : 0.12);
        step++;
      };

      play();
      timer = window.setInterval(play, beat * 1000);
    },
    stopMusic() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    },
    setVolume(volume: number) {
      if (master) master.gain.value = volume;
    },
    chime(volume: number) {
      const c = ensure();

      if (!c || !master) return;

      master.gain.value = Math.max(0.2, volume);
      [1046.5, 1318.5, 1568].forEach((f, i) => note(f, c.currentTime + 0.05 + i * 0.22, 1.2, 'sine', 0.25));
    },
  };
})();

/// หยุดเพลงของตัวจับเวลาเมื่อออกจากหน้าแก้ไข
export function stopTimerAudio() {
  audio.stopMusic();
}
