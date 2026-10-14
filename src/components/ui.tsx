import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconBack, IconCheck, IconX } from './icons';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  // Blue is reserved for the single main action on a screen.
  primary: 'bg-primary-600 text-white shadow-sm shadow-primary-600/30 hover:bg-primary-700 active:bg-primary-700 disabled:bg-asphalt-100 disabled:text-asphalt-500 disabled:shadow-none',
  secondary: 'bg-white text-asphalt-900 ring-1 ring-asphalt-100 hover:ring-asphalt-300 disabled:text-asphalt-300',
  danger: 'bg-white text-stop-700 ring-1 ring-stop-600/30 hover:bg-stop-50 disabled:text-asphalt-300',
  success: 'bg-go-600 text-white hover:bg-go-700 disabled:bg-asphalt-100 disabled:text-asphalt-500',
  ghost: 'bg-transparent text-primary-600 hover:bg-primary-50',
};

export function Button({ variant = 'primary', className = '', busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', className = '', children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="loading" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-asphalt-700'}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,27,45,0.06)] ring-1 ring-asphalt-100/80 ${className}`}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-medium text-asphalt-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-sm text-asphalt-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-stop-700">{error}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-asphalt-100 bg-white px-4 py-3 text-base text-asphalt-900 placeholder:text-asphalt-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />;

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  const cls = {
    info: 'bg-primary-50 text-asphalt-800 ring-primary-100',
    error: 'bg-stop-50 text-stop-700 ring-stop-600/25',
    success: 'bg-go-50 text-go-700 ring-go-600/25',
    warning: 'bg-caution-50 text-caution-700 ring-caution-500/40',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-[15px] leading-relaxed ring-1 ${cls}`}>{children}</div>;
}

export function PageHeader({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 border-b border-asphalt-100 bg-white/95 backdrop-blur safe-top no-print">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
        <div className="w-11">
          {back && (
            <button aria-label="back" className="flex h-11 w-11 items-center justify-center rounded-full text-asphalt-900 hover:bg-asphalt-100" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
              <IconBack />
            </button>
          )}
        </div>
        <h1 className="flex-1 truncate text-center text-[17px] font-bold text-asphalt-950">{title}</h1>
        <div className="flex min-w-11 justify-end">{right}</div>
      </div>
    </div>
  );
}

/** Thumb-reach action area pinned above the bottom edge (and above the tab bar when present). */
export function BottomBar({ children, aboveNav }: { children: ReactNode; aboveNav?: boolean }) {
  return (
    <>
      <div className="h-24" aria-hidden />
      <div className={`fixed inset-x-0 z-30 border-t border-asphalt-100 bg-white/95 backdrop-blur no-print ${aboveNav ? 'bottom-[calc(4rem+max(env(safe-area-inset-bottom),0.5rem))]' : 'bottom-0 safe-bottom'}`}>
        <div className="mx-auto flex max-w-3xl gap-2 px-4 pt-3 pb-3">{children}</div>
      </div>
    </>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-asphalt-100 py-3 last:border-0">
      <span className="text-[15px] text-asphalt-500">{label}</span>
      <span className={`text-right text-[15px] font-medium text-asphalt-900 ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export function CheckIcon({ state }: { state: 'ok' | 'bad' | 'waiting' | null }) {
  if (state === 'ok') return <span aria-label="pass" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-go-600 text-white"><IconCheck size={15} strokeWidth={3} /></span>;
  if (state === 'bad') return <span aria-label="fail" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stop-600 text-white"><IconX size={14} strokeWidth={3} /></span>;
  return <span aria-label="unknown" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-asphalt-300 text-white"><Spinner small /></span>;
}
