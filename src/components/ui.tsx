import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconBack, IconCheck, IconX } from './icons';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  // Lane yellow is reserved for the single main action on a screen.
  primary: 'bg-lane-500 text-asphalt-950 shadow-[0_2px_0_var(--color-lane-600)] hover:bg-lane-400 active:translate-y-px active:shadow-none disabled:bg-asphalt-100 disabled:text-asphalt-500 disabled:shadow-none',
  secondary: 'bg-white text-asphalt-900 border-2 border-asphalt-100 hover:border-asphalt-300 disabled:text-asphalt-300',
  danger: 'bg-white text-stop-700 border-2 border-stop-600/30 hover:bg-stop-50 disabled:text-asphalt-300',
  success: 'bg-go-600 text-white hover:bg-go-700 disabled:bg-asphalt-100 disabled:text-asphalt-500',
  ghost: 'bg-transparent text-asphalt-800 underline-offset-4 hover:underline',
};

export function Button({ variant = 'primary', className = '', busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
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
    <Link to={to} className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="loading" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-asphalt-700'}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-5 ring-1 ring-asphalt-100 ${className}`}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-asphalt-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-sm text-asphalt-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-stop-700">{error}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-2xl border-2 border-asphalt-100 bg-white px-4 py-3 text-base text-asphalt-900 placeholder:text-asphalt-300 focus:border-asphalt-700 focus:outline-none';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />;

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  const cls = {
    info: 'bg-white text-asphalt-800 ring-asphalt-100',
    error: 'bg-stop-50 text-stop-700 ring-stop-600/25',
    success: 'bg-go-50 text-go-700 ring-go-600/25',
    warning: 'bg-caution-50 text-caution-700 ring-lane-500/40',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ring-1 ${cls}`}>{children}</div>;
}

export function PageHeader({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-1 bg-paper/95 px-2 py-2 backdrop-blur safe-top">
      {back && (
        <button aria-label="back" className="flex h-11 w-11 items-center justify-center rounded-full text-asphalt-800 hover:bg-asphalt-100" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
          <IconBack />
        </button>
      )}
      <h1 className={`flex-1 truncate text-lg font-bold text-asphalt-900 ${back ? '' : 'pl-3'}`}>{title}</h1>
      {right}
    </div>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-asphalt-100 py-2.5 last:border-0">
      <span className="text-sm text-asphalt-500">{label}</span>
      <span className={`text-right text-sm font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export function CheckIcon({ state }: { state: 'ok' | 'bad' | 'waiting' | null }) {
  if (state === 'ok') return <span aria-label="pass" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-go-600 text-white"><IconCheck size={15} strokeWidth={3} /></span>;
  if (state === 'bad') return <span aria-label="fail" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stop-600 text-white"><IconX size={14} strokeWidth={3} /></span>;
  return <span aria-label="unknown" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-asphalt-300 text-white"><Spinner small /></span>;
}
