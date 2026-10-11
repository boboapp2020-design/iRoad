import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
};

export function Button({ variant = 'primary', className = '', busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
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
    <Link to={to} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="loading" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-brand-700'}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />;

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  const cls = {
    info: 'bg-brand-50 text-brand-800 ring-brand-100',
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ring-1 ${cls}`}>{children}</div>;
}

export function PageHeader({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur safe-top">
      {back && (
        <button aria-label="back" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-slate-100" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
          ‹
        </button>
      )}
      <h1 className={`flex-1 truncate text-lg font-bold ${back ? '' : 'pl-2'}`}>{title}</h1>
      {right}
    </div>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-right text-sm font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export function CheckIcon({ state }: { state: 'ok' | 'bad' | 'waiting' | null }) {
  if (state === 'ok') return <span aria-label="pass" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-sm text-white">✓</span>;
  if (state === 'bad') return <span aria-label="fail" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm text-white">✕</span>;
  return <span aria-label="unknown" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-sm text-white">?</span>;
}
