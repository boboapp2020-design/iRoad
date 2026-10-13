import type { DisplayVerificationStatus } from '@verification';
import type { JobStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const jobColors: Record<JobStatus, string> = {
  DRAFT: 'bg-sky-tile text-sky-ink',
  AWAITING_REPAIR: 'bg-coral-tile text-coral-ink',
  AWAITING_AFTER_PHOTO: 'bg-amber-tile text-amber-ink',
  PENDING_REVIEW: 'bg-primary-50 text-primary-700',
  APPROVED: 'bg-mint-tile text-mint-ink',
  REJECTED: 'bg-stop-50 text-stop-700',
  NEEDS_RECAPTURE: 'bg-stop-50 text-stop-700',
  CANCELLED: 'bg-asphalt-100 text-asphalt-500',
  DELETED: 'bg-asphalt-100 text-asphalt-500 line-through',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${jobColors[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}

const vColors: Record<DisplayVerificationStatus, string> = {
  PASS: 'bg-go-600 text-white',
  FAIL: 'bg-stop-600 text-white',
  INSUFFICIENT_DATA: 'bg-caution-500 text-asphalt-950',
  PENDING: 'bg-asphalt-100 text-asphalt-700',
};

export function VerificationBadge({ status, large }: { status: DisplayVerificationStatus; large?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full font-bold ${large ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-[13px] leading-none'} ${vColors[status]}`}>
      {t(`verification.${status}`)}
    </span>
  );
}
