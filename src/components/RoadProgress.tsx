import { STAGES, currentStage } from '@/lib/workflow';
import type { JobStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { IconCheck } from './icons';

/**
 * The job's progress drawn as a stretch of road: an asphalt strip with a dashed
 * lane line, and one marker per stage. Done stages are painted lane-yellow.
 */
export function RoadProgress({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  const cur = currentStage(status);
  const stopped = cur === null;
  return (
    <div aria-label={t('stage.title')}>
      <div className="relative h-11 rounded-full bg-asphalt-800 px-3">
        <div className="lane-line absolute inset-x-6 top-1/2 -translate-y-1/2 opacity-40" />
        <ol className="relative flex h-full items-center justify-between">
          {STAGES.map((s, i) => {
            const done = !stopped && i < (cur as number);
            const active = !stopped && i === cur;
            return (
              <li key={s} className="flex items-center" aria-current={active ? 'step' : undefined}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-lane-500 text-asphalt-950' : active ? 'bg-white text-asphalt-950 ring-4 ring-lane-500' : 'bg-asphalt-700 text-asphalt-300'
                  }`}
                >
                  {done ? <IconCheck size={15} strokeWidth={3} /> : i + 1}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="mt-1.5 grid grid-cols-5 text-center text-[11px] leading-tight text-asphalt-500">
        {STAGES.map((s, i) => (
          <li key={s} className={!stopped && i === cur ? 'font-semibold text-asphalt-900' : ''}>{t(`stage.${s}`)}</li>
        ))}
      </ol>
    </div>
  );
}
