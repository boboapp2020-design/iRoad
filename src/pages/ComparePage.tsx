import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScoreCard } from '@/components/ScoreCard';
import { loadEvidenceUrl } from '@/components/EvidenceImage';
import { signatureOfUrl, similarityScore } from '@/features/capture/imageSimilarity';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { Alert, CheckIcon, PageHeader, Spinner } from '@/components/ui';
import { api, type Photo } from '@/lib/api';
import { errorMessage, fmtCoord, fmtDateTime, fmtNum, reasonText } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';
import { afterAccuracyLimit, beforeAccuracyLimit } from '@/features/capture/captureGate';

function Meta({ p }: { p: Photo }) {
  const { t, intlLocale } = useI18n();
  return (
    <dl className="space-y-1 text-xs">
      <div><dt className="text-asphalt-500">{t('job.capturedAt')}</dt><dd className="font-medium">{fmtDateTime(p.captured_at, intlLocale)}</dd></div>
      <div><dt className="text-asphalt-500">{t('job.coords')}</dt><dd className="font-medium">{fmtCoord(p.latitude, p.longitude)}</dd></div>
      <div><dt className="text-asphalt-500">{t('job.accuracy')}</dt><dd className="font-medium">{t('common.meters', { v: fmtNum(p.gps_accuracy_m) })}</dd></div>
      <div><dt className="text-asphalt-500">{t('job.heading')}</dt><dd className="font-medium">{p.heading_degrees == null ? '—' : `${fmtNum(p.heading_degrees, 0)}°`}</dd></div>
      <div><dt className="text-asphalt-500">{t('job.inspector')}</dt><dd className="font-medium">{p.captured_by_name}</dd></div>
    </dl>
  );
}

export function ComparePage() {
  const { id = '' } = useParams();
  const { t, intlLocale } = useI18n();
  const { data, error, loading } = useAsync(() => api.getJob(id), [id]);
  // Reviewer-side check: recompute the view similarity from the two stored photos.
  const [recomputed, setRecomputed] = useState<number | null>(null);
  const vNow = data?.verifications.find((x) => x.id === data.job.current_verification_id) ?? null;
  const pair = vNow?.score_details ? [vNow.before_photo_id, vNow.after_photo_id] as const : null;
  useEffect(() => {
    if (!pair) return;
    let alive = true;
    Promise.all(pair.map((pid) => loadEvidenceUrl(pid).then(signatureOfUrl)))
      .then(([a, b]) => alive && setRecomputed(similarityScore(a, b)))
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.[0], pair?.[1]]);
  if (loading && !data) return <><PageHeader title={t('job.compare')} back={`/jobs/${id}`} /><div className="flex justify-center p-8"><Spinner /></div></>;
  if (error || !data) return <><PageHeader title={t('job.compare')} back={`/jobs/${id}`} /><div className="p-4"><Alert kind="error">{errorMessage(t, error)}</Alert></div></>;

  const v = data.verifications.find((x) => x.id === data.job.current_verification_id) ?? null;
  const before = data.photos.find((p) => p.id === (v?.before_photo_id ?? data.job.current_before_photo_id));
  const after = data.photos.find((p) => p.id === (v?.after_photo_id ?? data.job.current_after_photo_id));
  const status = v?.overall_status ?? 'PENDING';
  const afterLimit = v ? afterAccuracyLimit(v.thresholds) : null;
  const beforeLimit = v ? beforeAccuracyLimit(v.thresholds) : null;
  const rows: [string, string, boolean | null | undefined][] = v
    ? [
        [t('verification.distance'), v.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(v.measured_distance_m) }), v.distance_pass],
        [t('verification.headingDiff'), v.heading_difference_degrees == null ? '—' : `${fmtNum(v.heading_difference_degrees)}°`, v.heading_pass],
        [t('verification.gpsBefore'), t('common.meters', { v: fmtNum(v.before_accuracy_m) }), beforeLimit === null ? undefined : v.before_accuracy_m == null ? null : v.before_accuracy_m <= beforeLimit],
        [t('verification.gpsAfter'), t('common.meters', { v: fmtNum(v.after_accuracy_m) }), afterLimit === null ? undefined : v.after_accuracy_m == null ? null : v.after_accuracy_m <= afterLimit],
        ...(typeof after?.device_metadata?.image_similarity_score === 'number'
          ? [[t('verification.similarity'), `${after.device_metadata.image_similarity_score}%`, undefined] as [string, string, undefined]]
          : []),
      ]
    : [];

  return (
    <div className="min-h-full bg-paper">
      <PageHeader title={t('job.compare')} back={`/jobs/${id}`} />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div><div className="text-xl font-bold">{data.job.job_code}</div><div className="text-sm text-asphalt-500">{data.job.road_name}</div></div>
          <StatusBadge status={data.job.status} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['job.beforePhoto', before], ['job.afterPhoto', after]].map(([label, p]) => (
            <div key={label as string} className="space-y-2">
              <div className="text-center text-sm font-semibold">{t(label as string)}</div>
              <EvidenceImage photoId={(p as Photo | undefined)?.id} alt={t(label as string)} className="aspect-[3/4] w-full rounded-xl" />
              {p && <Meta p={p as Photo} />}
            </div>
          ))}
        </div>
        {v?.score_details && <ScoreCard score={v.score_details} scoring={(v.thresholds as { scoring?: Parameters<typeof ScoreCard>[0]['scoring'] }).scoring} recomputed={recomputed} />}
        <div className="rounded-2xl bg-white p-4 ring-1 ring-asphalt-100">
          <div className="mb-2 flex items-center justify-between"><span className="font-bold">{t('job.history')}</span><VerificationBadge status={status} large /></div>
          <p className="text-sm text-asphalt-500">{t(`verification.${status}_desc`)}</p>
          {rows.map(([label, value, pass]) => (
            <div key={label} className="flex items-center justify-between border-b border-asphalt-100 py-2 text-sm">
              <span className="text-asphalt-500">{label}</span>
              <span className="flex items-center gap-2 font-semibold">{value}{pass !== undefined && <CheckIcon state={pass === null ? null : pass ? 'ok' : 'bad'} />}</span>
            </div>
          ))}
          {v && v.failure_reasons.length > 0 && <ul className="mt-2 list-inside list-disc text-sm">{v.failure_reasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>}
          {v && <div className="mt-2 text-xs text-asphalt-500">{t('verification.rules')}: {v.rules_version} · {t('verification.verifiedAt')}: {fmtDateTime(v.verified_at, intlLocale)}</div>}
          {v && !v.record_intact && <Alert kind="error">{t('verification.recordTampered')}</Alert>}
        </div>
        <div className="rounded-2xl border-2 border-dashed border-asphalt-100 p-4 text-center text-sm text-asphalt-500">
          🧩 {t('verification.alignPlaceholder')}
        </div>
        <Alert kind="info">{t('verification.noAiNote')}</Alert>
      </div>
    </div>
  );
}
