import type { MatchScoreBreakdown } from '@verification';
import { useI18n } from '@/lib/i18n';

interface Scoring { weights: { image: number; heading: number; gps: number }; passScore: number; reviewScore: number }

/** Match score (rules v5+): total with pass / review marks, and the three parts. */
export function ScoreCard({ score, scoring, recomputed }: { score: MatchScoreBreakdown; scoring: Scoring | null | undefined; recomputed?: number | null }) {
  const { t } = useI18n();
  const pass = scoring?.passScore ?? 70;
  const review = scoring?.reviewScore ?? 55;
  const tone = score.total >= pass ? 'text-go-700' : score.total >= review ? 'text-caution-700' : 'text-stop-700';
  const bar = score.total >= pass ? 'bg-go-600' : score.total >= review ? 'bg-caution-500' : 'bg-stop-600';
  const parts: [string, number, number][] = [
    [t('score.image'), score.image, scoring?.weights.image ?? 50],
    [t('score.heading'), score.heading, scoring?.weights.heading ?? 30],
    [t('score.gps'), score.gps, scoring?.weights.gps ?? 20],
  ];
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-asphalt-100">
      <div className="flex items-end justify-between">
        <div className="text-[15px] font-semibold text-asphalt-700">{t('score.title')}</div>
        <div className={`text-3xl font-bold leading-none ${tone}`}>{score.total}<span className="text-base font-semibold text-asphalt-500">/100</span></div>
      </div>
      <div className="relative h-2.5 rounded-full bg-asphalt-100" aria-hidden>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, score.total)}%` }} />
        <div className="absolute top-[-3px] h-4 w-0.5 bg-caution-700" style={{ left: `${review}%` }} />
        <div className="absolute top-[-3px] h-4 w-0.5 bg-go-700" style={{ left: `${pass}%` }} />
      </div>
      <div className="text-[13px] text-asphalt-500">{t('score.legend', { pass, review })}</div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {parts.map(([label, v, max]) => (
          <div key={label} className="rounded-xl bg-paper px-2 py-2">
            <dt className="text-[12px] text-asphalt-500">{label}</dt>
            <dd className="font-bold text-asphalt-900">{fmt(v)}<span className="text-[12px] font-medium text-asphalt-500">/{max}</span></dd>
          </div>
        ))}
      </dl>
      <div className="text-[13px] text-asphalt-500">
        {t('score.similarity', { v: score.imageSimilarity ?? '—' })}
        {recomputed !== undefined && (
          <> · {recomputed === null ? t('score.recomputing') : t('score.recomputed', { v: recomputed })}
            {recomputed !== null && score.imageSimilarity !== null && Math.abs(recomputed - score.imageSimilarity) > 10 && (
              <span className="font-semibold text-stop-700"> {t('score.mismatch')}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
