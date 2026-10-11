import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { MapView } from '@/components/MapView';
import { Alert, Button, Card, KeyValue, LinkButton, PageHeader, Select, Spinner, TextArea } from '@/components/ui';
import { api, ApiError, type JobDetail, type Photo } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fmtBytes, fmtCoord, fmtDateTime, fmtNum } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';

const AFTER_STATUSES = ['AWAITING_AFTER_PHOTO', 'NEEDS_RECAPTURE', 'REJECTED'];

export function PhotoMeta({ photo }: { photo: Photo }) {
  const { t, intlLocale } = useI18n();
  return (
    <div>
      <KeyValue label={t('job.capturedAt')} value={fmtDateTime(photo.captured_at, intlLocale)} />
      <KeyValue label={t('job.coords')} value={fmtCoord(photo.latitude, photo.longitude)} />
      <KeyValue label={t('job.accuracy')} value={t('common.meters', { v: fmtNum(photo.gps_accuracy_m) })} />
      <KeyValue label={t('job.heading')} value={photo.heading_degrees == null ? '—' : `${fmtNum(photo.heading_degrees, 0)}° (${photo.heading_source ?? '?'})`} />
      <KeyValue label={t('job.inspector')} value={photo.captured_by_name ?? '—'} />
      <KeyValue label={t('job.fileSize')} value={fmtBytes(photo.file_size_bytes)} />
      <KeyValue label={t('job.sha256')} value={photo.sha256_hash} mono />
      {!photo.record_intact && <Alert kind="error">{t('verification.recordTampered')}</Alert>}
    </div>
  );
}

function ReviewPanel({ detail, onDone }: { detail: JobDetail; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = detail.verifications.find((v) => v.id === detail.job.current_verification_id);
  const canApprove = current?.overall_status === 'PASS';

  async function decide(decision: 'APPROVE' | 'REJECT' | 'REQUEST_RECAPTURE') {
    if (busy) return;
    setBusy(decision);
    setError(null);
    try {
      await api.reviewJob(detail.job.id, decision, reason);
      onDone();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('review.title')}</h2>
      <p className="text-sm text-slate-500">{t('review.separate')}</p>
      {!canApprove && <Alert kind="warning">{t('review.cannotApprove')}</Alert>}
      <TextArea placeholder={t('review.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="success" disabled={!canApprove || reason.trim().length < 3} busy={busy === 'APPROVE'} onClick={() => decide('APPROVE')}>{t('review.approve')}</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} busy={busy === 'REJECT'} onClick={() => decide('REJECT')}>{t('review.reject')}</Button>
        <Button variant="secondary" disabled={reason.trim().length < 3} busy={busy === 'REQUEST_RECAPTURE'} onClick={() => decide('REQUEST_RECAPTURE')}>{t('review.recapture')}</Button>
      </div>
    </Card>
  );
}

function ReasonPrompt({ label, minLength, onSubmit, buttonLabel, variant = 'danger' }: { label: string; minLength: number; onSubmit: (reason: string) => Promise<void>; buttonLabel: string; variant?: 'danger' | 'secondary' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button variant={variant} className="w-full" onClick={() => setOpen(true)}>{buttonLabel}</Button>;
  return (
    <Card className="space-y-2">
      <div className="text-sm font-semibold">{label}</div>
      <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        <Button
          variant={variant}
          className="flex-1"
          busy={busy}
          disabled={reason.trim().length < minLength}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(reason.trim());
              setOpen(false);
              setReason('');
            } catch (e) {
              setError(errorMessage(t, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('common.confirm')}
        </Button>
      </div>
    </Card>
  );
}

function AdminTools({ detail, reload }: { detail: JobDetail; reload: () => void }) {
  const { t } = useI18n();
  const [integrity, setIntegrity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inspectors, setInspectors] = useState<{ id: string; full_name: string }[] | null>(null);
  const [assignee, setAssignee] = useState('');
  const activeBefore = detail.photos.find((p) => p.capture_type === 'BEFORE' && p.status === 'ACTIVE');
  const activeAfter = detail.photos.find((p) => p.capture_type === 'AFTER' && p.status === 'ACTIVE');
  const closed = detail.job.status === 'APPROVED' || detail.job.status === 'CANCELLED';
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('nav.admin')}</h2>
      <Button
        variant="secondary"
        className="w-full"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.checkEvidenceIntegrity(detail.job.id);
            const ok = r.photos.every((p) => p.file_hash_ok && p.record_ok) && r.verifications.every((v) => v.record_ok);
            setIntegrity(ok ? '✓ OK' : '✕ ' + JSON.stringify(r.photos.filter((p) => !p.file_hash_ok || !p.record_ok)));
          } catch (e) {
            setIntegrity(errorMessage(t, e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('job.integrity')}
      </Button>
      {integrity && <Alert kind={integrity.startsWith('✓') ? 'success' : 'error'}>{integrity}</Alert>}
      {!closed && (
        <div className="flex gap-2">
          <Select value={assignee} onFocus={() => inspectors === null && api.listInspectors().then((r) => setInspectors(r.inspectors))} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('job.assignee')}…</option>
            {(inspectors ?? []).map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
          </Select>
          <Button variant="secondary" disabled={!assignee} onClick={async () => { await api.assignJob(detail.job.id, assignee); reload(); }}>{t('job.assign')}</Button>
        </div>
      )}
      {!closed && activeBefore && (
        <ReasonPrompt label={`${t('job.invalidateReason')} — ${t('job.beforePhoto')}`} minLength={5} buttonLabel={`${t('job.invalidate')}: ${t('job.beforePhoto')}`}
          onSubmit={async (r) => { await api.invalidateEvidence(activeBefore.id, r); reload(); }} />
      )}
      {!closed && activeAfter && (
        <ReasonPrompt label={`${t('job.invalidateReason')} — ${t('job.afterPhoto')}`} minLength={5} buttonLabel={`${t('job.invalidate')}: ${t('job.afterPhoto')}`}
          onSubmit={async (r) => { await api.invalidateEvidence(activeAfter.id, r); reload(); }} />
      )}
    </Card>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { t, intlLocale } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.getJob(id), [id]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <><PageHeader title={t('job.details')} back="/" /><div className="flex justify-center p-8"><Spinner /></div></>;
  if (error || !data) {
    const notFound = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <>
        <PageHeader title={t('job.details')} back="/" />
        <div className="p-4"><Alert kind="error">{notFound ? t('job.notFound') : errorMessage(t, error)}</Alert>
          {!notFound && <Button className="mt-3" variant="secondary" onClick={() => void reload()}>{t('common.retry')}</Button>}</div>
      </>
    );
  }

  const { job, permissions } = data;
  const before = data.photos.find((p) => p.id === job.current_before_photo_id) ?? null;
  const after = data.photos.find((p) => p.id === job.current_after_photo_id) ?? null;
  const currentV = data.verifications.find((v) => v.id === job.current_verification_id) ?? null;
  const sortedV = [...data.verifications].sort((a, b) => b.attempt_number - a.attempt_number);

  async function markRepaired() {
    if (busy || !window.confirm(t('job.confirmRepaired'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.markRepairDone(job.id);
      await reload();
    } catch (e) {
      setActionError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('job.details')} back="/" />
      <div className="space-y-4 p-4">
        <div>
          <div className="text-2xl font-bold">{job.job_code}</div>
          <div className="text-slate-600">📍 {job.road_name}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={job.status} />
            <VerificationBadge status={currentV?.overall_status ?? 'PENDING'} />
          </div>
        </div>

        {before && before.latitude != null && before.longitude != null && (
          <div className="relative">
            <MapView points={[{ id: before.id, latitude: before.latitude, longitude: before.longitude, label: job.job_code }]} className="h-48" />
            <LinkButton to={`/jobs/${job.id}/navigate`} variant="secondary" className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 shadow">📍 {t('job.navigate')}</LinkButton>
          </div>
        )}

        {actionError && <Alert kind="error">{actionError}</Alert>}
        <div className="grid gap-2">
          {permissions.can_capture && job.status === 'DRAFT' && <LinkButton to={`/jobs/${job.id}/capture/BEFORE`} className="w-full">📷 {t('job.startBefore')}</LinkButton>}
          {permissions.can_capture && job.status === 'AWAITING_REPAIR' && <Button className="w-full" busy={busy} onClick={markRepaired}>🛠 {t('job.markRepaired')}</Button>}
          {permissions.can_capture && AFTER_STATUSES.includes(job.status) && before && <LinkButton to={`/jobs/${job.id}/capture/AFTER`} className="w-full">📷 {t('job.startAfter')}</LinkButton>}
          {after && <LinkButton to={`/jobs/${job.id}/compare`} variant="secondary" className="w-full">⇆ {t('job.compare')}</LinkButton>}
        </div>

        {permissions.can_review && <ReviewPanel detail={data} onDone={() => void reload()} />}

        <Card>
          <h2 className="mb-2 font-bold">{t('job.details')}</h2>
          <KeyValue label={t('job.damageType')} value={t(`damage.${job.damage_type}`)} />
          <KeyValue label={t('job.priority')} value={t(`priority.${job.priority}`)} />
          {job.location_description && <KeyValue label={t('job.location')} value={job.location_description} />}
          {job.description && <KeyValue label={t('job.description')} value={job.description} />}
          {job.notes && <KeyValue label={t('job.notes')} value={job.notes} />}
          <KeyValue label={t('job.assignee')} value={job.assigned_to_name ?? '—'} />
          <KeyValue label={t('job.capturedAt')} value={fmtDateTime(job.created_at, intlLocale)} />
          {job.cancel_reason && <KeyValue label={t('job.cancelReason')} value={job.cancel_reason} />}
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">{t('job.beforePhoto')}</h2>
          {before ? (
            <div className="space-y-2">
              <EvidenceImage photoId={before.id} alt={t('job.beforePhoto')} className="aspect-[4/3] w-full rounded-xl" />
              <PhotoMeta photo={before} />
            </div>
          ) : (
            <Alert kind="warning">{t('job.noBefore')}</Alert>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">{t('job.history')}</h2>
          {sortedV.length === 0 && <div className="text-sm text-slate-500">{t('verification.PENDING_desc')}</div>}
          <ul className="space-y-2">
            {sortedV.map((v) => (
              <li key={v.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t('job.attempt', { n: v.attempt_number })}{v.id === job.current_verification_id ? ' ★' : ''}</span>
                  <VerificationBadge status={v.overall_status} />
                </div>
                <div className="mt-1 text-slate-600">
                  {t('verification.distance')}: {v.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(v.measured_distance_m) })} ·{' '}
                  {t('verification.headingDiff')}: {v.heading_difference_degrees == null ? '—' : `${fmtNum(v.heading_difference_degrees)}°`}
                </div>
                <div className="text-xs text-slate-400">{fmtDateTime(v.verified_at, intlLocale)} · {v.rules_version}</div>
              </li>
            ))}
          </ul>
        </Card>

        {data.reviews.length > 0 && (
          <Card>
            <h2 className="mb-2 font-bold">{t('job.reviews')}</h2>
            <ul className="space-y-2 text-sm">
              {data.reviews.map((r) => (
                <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="font-semibold">{t(`status.${r.decision}`)} — {r.reviewer_name}</div>
                  <div>{r.reason}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(r.created_at, intlLocale)}</div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data.photos.filter((p) => p.status !== 'ACTIVE').length > 0 && (
          <Card>
            <h2 className="mb-2 font-bold">{t('job.superseded')} / {t('job.invalidated')}</h2>
            <ul className="space-y-1 text-sm">
              {data.photos.filter((p) => p.status !== 'ACTIVE').map((p) => (
                <li key={p.id}>{p.capture_type} · {t('job.attempt', { n: p.attempt_number })} · {p.status} — {p.status_reason}</li>
              ))}
            </ul>
          </Card>
        )}

        <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-bold">{t('job.audit')} ({data.audit.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {[...data.audit].reverse().map((a) => (
              <li key={a.id} className="border-b border-slate-100 py-1">
                <span className="text-slate-400">{fmtDateTime(a.created_at, intlLocale)}</span> · <b>{a.action}</b> · {a.actor_name ?? 'system'}
                {a.details && Object.keys(a.details).length > 0 && <div className="break-all text-slate-500">{JSON.stringify(a.details)}</div>}
              </li>
            ))}
          </ul>
        </details>

        {permissions.can_cancel && (
          <ReasonPrompt label={t('job.cancelReason')} minLength={3} buttonLabel={t('job.cancelJob')} onSubmit={async (r) => { await api.cancelJob(job.id, r); await reload(); }} />
        )}
        {user?.role === 'admin' && <AdminTools detail={data} reload={() => void reload()} />}
        <Link to={`/reports?job=${job.id}`} className="block text-center text-sm font-semibold text-brand-700">📄 {t('dashboard.report')}</Link>
      </div>
    </div>
  );
}
