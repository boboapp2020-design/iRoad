import type { DisplayVerificationStatus } from '@verification';
import type { JobStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const jobColors: Record<JobStatus, string> = {
  DRAFT: 'bg-asphalt-100 text-asphalt-800',
  AWAITING_REPAIR: 'bg-caution-50 text-caution-700 ring-1 ring-lane-500/50',
  AWAITING_AFTER_PHOTO: 'bg-caution-50 text-caution-700 ring-1 ring-lane-500/50',
  PENDING_REVIEW: 'bg-asphalt-800 text-white',
  APPROVED: 'bg-go-50 text-go-700 ring-1 ring-go-600/30',
  REJECTED: 'bg-stop-50 text-stop-700 ring-1 ring-stop-600/30',
  NEEDS_RECAPTURE: 'bg-stop-50 text-stop-700 ring-1 ring-stop-600/30',
  CANCELLED: 'bg-asphalt-100 text-asphalt-500',
  DELETED: 'bg-asphalt-100 text-asphalt-500 line-through',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${jobColors[status]}`}>{t(`status.${status}`)}</span>;
}

const vColors: Record<DisplayVerificationStatus, string> = {
  PASS: 'bg-go-600 text-white',
  FAIL: 'bg-stop-600 text-white',
  INSUFFICIENT_DATA: 'bg-lane-500 text-asphalt-950',
  PENDING: 'bg-asphalt-300 text-asphalt-950',
};

export function VerificationBadge({ status, large }: { status: DisplayVerificationStatus; large?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full font-bold ${large ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-xs'} ${vColors[status]}`}>
      {t(`verification.${status}`)}
    </span>
  );
}
