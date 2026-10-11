import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { Alert, Button, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { JOB_STATUSES, reportData, type ReportRow } from '@/lib/api';
import { downloadText, toCsv } from '@/lib/csv';
import { errorMessage, fmtCoord, fmtDateTime, fmtNum, reasonText } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';

const MAX_PHOTO_ROWS = 20;

export function reportCsv(rows: ReportRow[]): string {
  const headers = [
    'job_code', 'road_name', 'location_description', 'damage_type', 'priority', 'status', 'assigned_to', 'created_at', 'completed_at',
    'before_photo_id', 'before_captured_at', 'before_latitude', 'before_longitude', 'before_accuracy_m', 'before_heading_deg', 'before_heading_source', 'before_sha256', 'before_captured_by',
    'after_photo_id', 'after_captured_at', 'after_latitude', 'after_longitude', 'after_accuracy_m', 'after_heading_deg', 'after_heading_source', 'after_sha256', 'after_captured_by', 'after_attempt',
    'verification_status', 'measured_distance_m', 'heading_difference_deg', 'gps_accuracy_pass', 'distance_pass', 'heading_pass', 'failure_reasons', 'rules_version', 'verified_at',
    'review_decision', 'review_reason', 'reviewer', 'reviewed_at',
  ];
  const data = rows.map(({ job, before: b, after: a, verification: v, review: r }) => [
    job.job_code, job.road_name, job.location_description, job.damage_type, job.priority, job.status, job.assigned_to_name, job.created_at, job.completed_at,
    b?.id, b?.captured_at, b?.latitude, b?.longitude, b?.gps_accuracy_m, b?.heading_degrees, b?.heading_source, b?.sha256_hash, b?.captured_by_name,
    a?.id, a?.captured_at, a?.latitude, a?.longitude, a?.gps_accuracy_m, a?.heading_degrees, a?.heading_source, a?.sha256_hash, a?.captured_by_name, a?.attempt_number,
    v?.overall_status ?? 'PENDING', v?.measured_distance_m, v?.heading_difference_degrees, v?.gps_accuracy_pass, v?.distance_pass, v?.heading_pass,
    v ? v.failure_reasons.map((x) => x.code).join('|') : '', v?.rules_version, v?.verified_at,
    r?.decision, r?.reason, r?.reviewer_name, r?.created_at,
  ]);
  return toCsv(headers, data);
}

export function ReportsPage() {
  const { t, intlLocale } = useI18n();
  const [params] = useSearchParams();
  const jobId = params.get('job') ?? '';
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [photos, setPhotos] = useState(!!jobId);
  const { data, error, loading, reload } = useAsync(
    () => reportData({
      job_id: jobId || undefined,
      status: status || undefined,
      date_from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
      date_to: to ? new Date(to + 'T23:59:59.999').toISOString() : undefined,
    }),
    [jobId, status, from, to],
  );
  const rows = data?.rows ?? [];
  const showPhotos = photos && rows.length <= MAX_PHOTO_ROWS;

  return (
    <div>
      <div className="no-print"><PageHeader title={t('report.title')} back={jobId ? `/jobs/${jobId}` : '/'} /></div>
      <div className="space-y-3 p-4">
        <div className="no-print space-y-2">
          {!jobId && (
            <div className="grid grid-cols-3 gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="status">
                <option value="">{t('common.all')}</option>
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('dashboard.from')} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('dashboard.to')} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="h-5 w-5" />
            {t('report.includePhotos')} {rows.length > MAX_PHOTO_ROWS && `(≤ ${MAX_PHOTO_ROWS})`}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!rows.length} onClick={() => downloadText(`road-repair-report-${new Date().toISOString().slice(0, 10)}.csv`, reportCsv(rows))}>
              {t('dashboard.exportCsv')}
            </Button>
            <Button disabled={!rows.length} onClick={() => window.print()}>{t('report.print')}</Button>
          </div>
        </div>
        {error ? <Alert kind="error">{errorMessage(t, error)} <button className="underline" onClick={() => void reload()}>{t('common.retry')}</button></Alert> : null}
        {loading && !data && <div className="flex justify-center p-8"><Spinner /></div>}

        <header className="hidden print:block">
          <h1 className="text-xl font-bold">{t('report.title')}</h1>
        </header>
        <div className="text-xs text-slate-500">{t('report.generated')}: {fmtDateTime(data?.generated_at, intlLocale)} · {rows.length}</div>

        {rows.map(({ job, before, after, verification: v, review }) => (
          <section key={job.id} className="print-break space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-bold">{job.job_code}</div><div className="text-sm text-slate-600">{job.road_name}</div></div>
              <div className="flex gap-1"><StatusBadge status={job.status} /><VerificationBadge status={v?.overall_status ?? 'PENDING'} /></div>
            </div>
            {showPhotos && (
              <div className="grid grid-cols-2 gap-2">
                <EvidenceImage photoId={before?.id} alt={t('job.beforePhoto')} className="aspect-[4/3] w-full rounded-lg" />
                <EvidenceImage photoId={after?.id} alt={t('job.afterPhoto')} className="aspect-[4/3] w-full rounded-lg" />
              </div>
            )}
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th></th><th>{t('job.beforePhoto')}</th><th>{t('job.afterPhoto')}</th></tr></thead>
              <tbody>
                <tr><td className="text-slate-500">{t('job.capturedAt')}</td><td>{fmtDateTime(before?.captured_at, intlLocale)}</td><td>{fmtDateTime(after?.captured_at, intlLocale)}</td></tr>
                <tr><td className="text-slate-500">{t('job.coords')}</td><td>{fmtCoord(before?.latitude, before?.longitude)}</td><td>{fmtCoord(after?.latitude, after?.longitude)}</td></tr>
                <tr><td className="text-slate-500">{t('job.accuracy')}</td><td>{fmtNum(before?.gps_accuracy_m)} m</td><td>{fmtNum(after?.gps_accuracy_m)} m</td></tr>
                <tr><td className="text-slate-500">{t('job.heading')}</td><td>{fmtNum(before?.heading_degrees, 0)}°</td><td>{fmtNum(after?.heading_degrees, 0)}°</td></tr>
                <tr><td className="text-slate-500">{t('job.inspector')}</td><td>{before?.captured_by_name ?? '—'}</td><td>{after?.captured_by_name ?? '—'}</td></tr>
                <tr><td className="text-slate-500">SHA-256</td><td className="break-all font-mono">{before?.sha256_hash.slice(0, 16) ?? '—'}…</td><td className="break-all font-mono">{after?.sha256_hash.slice(0, 16) ?? '—'}…</td></tr>
              </tbody>
            </table>
            {v && (
              <div className="text-xs">
                {t('verification.distance')}: <b>{fmtNum(v.measured_distance_m)} m</b> · {t('verification.headingDiff')}: <b>{fmtNum(v.heading_difference_degrees)}°</b> · {v.rules_version} · {fmtDateTime(v.verified_at, intlLocale)}
                {v.failure_reasons.length > 0 && <ul className="list-inside list-disc">{v.failure_reasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>}
              </div>
            )}
            {review && <div className="text-xs">{t('job.reviews')}: <b>{t(`status.${review.decision}`)}</b> — {review.reason} ({review.reviewer_name}, {fmtDateTime(review.created_at, intlLocale)})</div>}
          </section>
        ))}
        <p className="text-xs text-slate-500">{t('verification.noAiNote')}</p>
      </div>
    </div>
  );
}
