'use client';

import { CircleAlert, Inbox, LoaderCircle, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

/// ชิ้นส่วนหน้าจอพื้นฐานของ CS Canvas — ใช้ token ล้วน (globals.css)
///
/// เขียนเองเพราะยังติดตั้ง @csmju2030/design-system ไม่ได้ (ต้องมี PAT ของ org)
/// ชื่อและพฤติกรรมเลียน component ของ DS เพื่อให้ย้ายไปใช้ของจริงได้ง่าย

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-inverse hover:bg-primary-hover active:bg-primary-active',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-ink hover:bg-primary-soft',
  danger: 'bg-danger text-on-inverse hover:opacity-90',
};

export function Button({
  variant = 'secondary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-csmju-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/// ปุ่มไอคอนต้องมี label เสมอ (เป็นทั้ง aria-label และ tooltip)
export function IconButton({
  label,
  active = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={rest['aria-pressed']}
      {...rest}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-primary-soft text-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-csmju-caption font-medium text-ink">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-csmju-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-csmju-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-csmju-body text-ink placeholder:text-muted focus:border-primary focus:outline-none';

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="text-csmju-body font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-csmju-caption text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'inline-block size-5 rounded-full bg-surface shadow-csmju-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-csmju-caption text-muted">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <div className="text-muted">{icon ?? <Inbox aria-hidden className="size-8" />}</div>
      <p className="text-csmju-body font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-csmju-caption text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-2xl border border-danger-line bg-danger-bg px-6 py-8 text-center">
      <CircleAlert aria-hidden className="size-7 text-danger" />
      <p className="text-csmju-body font-semibold text-danger">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="max-w-md text-csmju-caption text-body">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-2">
          ลองอีกครั้ง
        </Button>
      )}
    </div>
  );
}

/// ป๊อปอัปบน <dialog> ของเบราว์เซอร์ — ได้ focus trap, Esc และ backdrop มาฟรี
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby={`${title}-title`}
      className={cx(
        'm-auto w-11/12 rounded-3xl bg-surface p-0 text-body shadow-csmju-lg backdrop:bg-inverse/50',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-3xl',
        size === 'xl' && 'max-w-6xl',
      )}
    >
      {open && (
        <div className="flex max-h-dialog flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
            <h2 id={`${title}-title`} className="text-csmju-h3 font-semibold text-ink">
              {title}
            </h2>
            <IconButton label="ปิด" onClick={onClose}>
              <X aria-hidden className="size-5" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

const ToastContext = createContext<((message: string, tone?: ToastItem['tone']) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = Date.now() + Math.random();

    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-3 text-csmju-caption shadow-csmju-lg',
              item.tone === 'error' ? 'bg-danger text-on-inverse' : 'bg-inverse text-on-inverse',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);

  if (!push) throw new Error('useToast ต้องอยู่ใต้ <ToastProvider>');

  return push;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
}

// ── เมนูแบบป๊อปโอเวอร์ ─────────────────────────────────────────────────

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

/// ปุ่มเปิดเมนู + รายการ · ปิดเมื่อคลิกข้างนอกหรือกด Esc (ฟัง keydown ที่ document
/// เพราะ focus อาจไม่อยู่ในเมนู — บทเรียนจากเทสต์ที่ผ่านบ้างตกบ้างของ nexus)
export function Menu({
  label,
  trigger,
  items,
  align = 'right',
  triggerClassName,
}: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cx(
          'inline-flex size-11 items-center justify-center rounded-xl bg-surface/90 text-ink shadow-csmju-sm hover:bg-surface',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <ul
          role="menu"
          className={cx(
            'absolute z-40 mt-1 min-w-52 rounded-xl border border-line bg-surface py-1 shadow-csmju-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  'flex min-h-11 w-full items-center gap-3 px-4 text-left text-csmju-caption hover:bg-surface-muted disabled:opacity-40',
                  item.danger ? 'text-danger' : 'text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
