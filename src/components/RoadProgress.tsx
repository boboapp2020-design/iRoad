import { STAGES, currentStage } from '@/lib/workflow';
import type { JobStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { IconCheck } from './icons';

/** The job's five stages as a connected stepper: done = blue check, current = ringed, later = grey. */
export function RoadProgress({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  const cur = currentStage(status);
  const stopped = cur === null;
  return (
    <ol className="grid grid-cols-5" aria-label={t('stage.title')}>
      {STAGES.map((s, i) => {
        const done = !stopped && i < (cur as number);
        const active = !stopped && i === cur;
        return (
          <li key={s} className="relative flex flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${done || active ? 'bg-primary-600' : 'bg-asphalt-100'}`} aria-hidden />}
            <span
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-primary-600 text-white' : active ? 'bg-white text-primary-600 ring-2 ring-primary-600' : 'bg-asphalt-100 text-asphalt-500'
              }`}
            >
              {done ? <IconCheck size={15} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[12px] leading-tight ${active ? 'font-semibold text-primary-700' : done ? 'text-asphalt-700' : 'text-asphalt-500'}`}>{t(`stage.${s}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
