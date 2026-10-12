import type { DisplayVerificationStatus } from '@verification';
import type { JobStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const jobColors: Record<JobStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  AWAITING_REPAIR: 'bg-orange-100 text-orange-800',
  AWAITING_AFTER_PHOTO: 'bg-amber-100 text-amber-800',
  PENDING_REVIEW: 'bg-sky-100 text-sky-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  NEEDS_RECAPTURE: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  DELETED: 'bg-slate-700 text-white',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${jobColors[status]}`}>{t(`status.${status}`)}</span>;
}

const vColors: Record<DisplayVerificationStatus, string> = {
  PASS: 'bg-emerald-600 text-white',
  FAIL: 'bg-red-600 text-white',
  INSUFFICIENT_DATA: 'bg-amber-500 text-white',
  PENDING: 'bg-slate-400 text-white',
};

export function VerificationBadge({ status, large }: { status: DisplayVerificationStatus; large?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full font-bold ${large ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-xs'} ${vColors[status]}`}>
      {t(`verification.${status}`)}
    </span>
  );
}
