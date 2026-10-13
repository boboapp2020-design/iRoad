import { useState, type ReactNode } from 'react';
import { IconCamera, IconChevron, IconNavigate, IconPin, IconReport, IconWrench } from '@/components/icons';
import { RoadProgress } from '@/components/RoadProgress';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { MapView } from '@/components/MapView';
import { Alert, BottomBar, Button, Card, CheckIcon, KeyValue, LinkButton, PageHeader, Select, Spinner, TextArea } from '@/components/ui';
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
    <Card className="space-y-3 ring-2 ring-primary-500">
      <h2 className="text-[17px] font-bold">{t('review.title')}</h2>
      <p className="text-sm text-asphalt-500">{t('review.separate')}</p>
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
      <h2 className="text-[17px] font-bold">{t('nav.admin')}</h2>
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

/** What happens next on this job: a short explanation, and (in the bottom bar) the one primary action. */
function nextStep(job: JobDetail['job'], canCapture: boolean, canReview: boolean, hasBefore: boolean) {
  let title = '';
  let hint = '';
  let action: { to?: string; label: string; icon: ReactNode; markRepaired?: boolean } | null = null;
  if (job.status === 'APPROVED') title = 'next.done';
  else if (job.status === 'CANCELLED' || job.status === 'DELETED') title = 'next.stopped';
  else if (job.status === 'DRAFT') {
    title = canCapture ? 'next.before' : 'next.waitBefore';
    hint = 'next.beforeHint';
    if (canCapture) action = { to: `/jobs/${job.id}/capture/BEFORE`, label: 'next.before', icon: <IconCamera /> };
  } else if (job.status === 'AWAITING_REPAIR') {
    title = canCapture ? 'next.markRepaired' : 'next.waitRepair';
    hint = 'next.repairHint';
    if (canCapture) action = { label: 'next.markRepaired', icon: <IconWrench />, markRepaired: true };
  } else if (AFTER_STATUSES.includes(job.status)) {
    const label = job.status === 'AWAITING_AFTER_PHOTO' ? 'next.after' : 'next.recapture';
    title = canCapture ? label : 'next.waitAfter';
    hint = 'next.afterHint';
    if (canCapture && hasBefore) action = { to: `/jobs/${job.id}/capture/AFTER`, label, icon: <IconCamera /> };
  } else if (job.status === 'PENDING_REVIEW') {
    title = canReview ? 'next.review' : 'next.waitReview';
    hint = canReview ? 'next.reviewHint' : '';
  }
  return { title, hint, action };
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[17px] font-bold text-asphalt-950">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { t, intlLocale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const step = nextStep(job, permissions.can_capture, permissions.can_review, !!before);
  const finished = job.status === 'APPROVED';
  const showNavigate = !!before && before.latitude != null && before.longitude != null;

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
    <div className="min-h-full bg-paper">
      <PageHeader title={t('job.details')} back="/" />
      <div className="mx-auto max-w-3xl space-y-5 p-4">
        <Card className="space-y-4">
          <div>
            <div className="text-xl font-bold text-asphalt-950">{job.job_code}</div>
            <div className="mt-0.5 flex items-start gap-1.5 text-[15px] text-asphalt-700"><IconPin size={18} className="mt-0.5 shrink-0 text-asphalt-500" />{job.road_name}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StatusBadge status={job.status} />
              {currentV && <VerificationBadge status={currentV.overall_status} />}
            </div>
          </div>
          <RoadProgress status={job.status} />
          {step.title && (
            <div className={`rounded-xl px-4 py-3 ${finished ? 'bg-go-50' : 'bg-primary-50'}`} aria-label={t('next.title')}>
              <div className={`text-[13px] font-semibold ${finished ? 'text-go-700' : 'text-primary-700'}`}>{t('next.title')}</div>
              <div className="font-bold text-asphalt-950">{t(step.title)}</div>
              {step.hint && <div className="text-[15px] text-asphalt-700">{t(step.hint)}</div>}
            </div>
          )}
        </Card>

        {job.status === 'DELETED' && (
          <Alert kind="error">
            <div className="font-semibold">{t('job.deletedBanner', { by: job.deleted_by_name ?? '—', at: fmtDateTime(job.deleted_at, intlLocale) })}</div>
            <div>{t('job.deletedReason', { r: job.delete_reason ?? '—' })}</div>
            <div className="text-xs">{t('job.deletedKept')}</div>
          </Alert>
        )}
        {actionError && <Alert kind="error">{actionError}</Alert>}

        {after && before && (
          <Section title={t('job.result')} right={<Link to={`/jobs/${job.id}/compare`} className="text-[15px] font-semibold text-primary-600">{t('job.compare')}</Link>}>
            <Card className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[{ p: before, l: t('job.beforePhoto') }, { p: after, l: t('job.afterPhoto') }].map(({ p, l }) => (
                  <figure key={p.id}>
                    <figcaption className="mb-1 text-center text-sm font-semibold text-asphalt-700">{l}</figcaption>
                    <EvidenceImage photoId={p.id} variant="thumb" alt={l} className="aspect-[4/3] w-full rounded-xl" />
                  </figure>
                ))}
              </div>
              {currentV && (
                <div>
                  <KeyValue label={t('verification.distance')} value={<span className="inline-flex items-center gap-2">{currentV.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(currentV.measured_distance_m) })}<CheckIcon state={currentV.distance_pass == null ? null : currentV.distance_pass ? 'ok' : 'bad'} /></span>} />
                  <KeyValue label={t('verification.headingDiff')} value={<span className="inline-flex items-center gap-2">{currentV.heading_difference_degrees == null ? '—' : `${fmtNum(currentV.heading_difference_degrees)}°`}<CheckIcon state={currentV.heading_pass == null ? null : currentV.heading_pass ? 'ok' : 'bad'} /></span>} />
                  {typeof after.device_metadata?.image_similarity_score === 'number' && (
                    <KeyValue label={t('verification.similarity')} value={`${after.device_metadata.image_similarity_score}%`} />
                  )}
                </div>
              )}
            </Card>
          </Section>
        )}

        {showNavigate && (
          <div className="relative overflow-hidden rounded-2xl ring-1 ring-asphalt-100">
            <MapView points={[{ id: before!.id, latitude: before!.latitude!, longitude: before!.longitude!, label: job.job_code }]} className="h-44 rounded-none" />
            <Link to={`/jobs/${job.id}/navigate`} className="absolute bottom-3 left-1/2 z-[500] inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-[15px] font-semibold text-primary-600 shadow-lg ring-1 ring-asphalt-100">
              <IconNavigate size={18} />{t('job.navigate')}
            </Link>
          </div>
        )}

        <Section title={t('job.beforePhoto')}>
          <Card>
            {before ? (
              <div className="flex gap-3">
                <EvidenceImage photoId={before.id} variant="thumb" alt={t('job.beforePhoto')} className="h-28 w-28 shrink-0 rounded-xl" />
                <dl className="min-w-0 flex-1 space-y-1 text-[14px] text-asphalt-700">
                  <div>{fmtDateTime(before.captured_at, intlLocale)}</div>
                  <div className="tabular-nums">{fmtCoord(before.latitude, before.longitude)}</div>
                  <div>{t('job.accuracy')}: {t('common.meters', { v: fmtNum(before.gps_accuracy_m) })}</div>
                  <div>{t('job.heading')}: {before.heading_degrees == null ? '—' : `${fmtNum(before.heading_degrees, 0)}°`}</div>
                </dl>
              </div>
            ) : (
              <div className="text-[15px] text-asphalt-500">{t('job.noBefore')}</div>
            )}
          </Card>
        </Section>

        {permissions.can_review && <ReviewPanel detail={data} onDone={() => void reload()} />}

        <Section title={t('job.info')}>
          <Card className="py-1">
            <KeyValue label={t('job.damageType')} value={t(`damage.${job.damage_type}`)} />
            <KeyValue label={t('job.priority')} value={t(`priority.${job.priority}`)} />
            {job.location_description && <KeyValue label={t('job.location')} value={job.location_description} />}
            {job.description && <KeyValue label={t('job.description')} value={job.description} />}
            {job.notes && <KeyValue label={t('job.notes')} value={job.notes} />}
            <KeyValue label={t('job.assignee')} value={job.assigned_to_name ?? '—'} />
            <KeyValue label={t('job.createdAt')} value={fmtDateTime(job.created_at, intlLocale)} />
            {job.cancel_reason && <KeyValue label={t('job.cancelReason')} value={job.cancel_reason} />}
          </Card>
        </Section>

        <details className="group rounded-2xl bg-white ring-1 ring-asphalt-100">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 font-semibold text-asphalt-900">
            {t('job.historyAll')}
            <IconChevron size={20} className="text-asphalt-300 transition group-open:rotate-90" />
          </summary>
          <div className="space-y-4 border-t border-asphalt-100 p-4">
            {before && <div><h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.beforePhoto')}</h3><PhotoMeta photo={before} /></div>}
            {after && <div><h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.afterPhoto')}</h3><PhotoMeta photo={after} /></div>}
            <div>
              <h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.history')}</h3>
              {sortedV.length === 0 && <div className="text-sm text-asphalt-500">{t('verification.PENDING_desc')}</div>}
              <ul className="space-y-2">
                {sortedV.map((v) => (
                  <li key={v.id} className="rounded-xl bg-paper p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t('job.attempt', { n: v.attempt_number })}{v.id === job.current_verification_id ? ' ★' : ''}</span>
                      <VerificationBadge status={v.overall_status} />
                    </div>
                    <div className="mt-1 text-asphalt-500">
                      {t('verification.distance')}: {v.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(v.measured_distance_m) })} ·{' '}
                      {t('verification.headingDiff')}: {v.heading_difference_degrees == null ? '—' : `${fmtNum(v.heading_difference_degrees)}°`}
                    </div>
                    <div className="text-xs text-asphalt-500">{fmtDateTime(v.verified_at, intlLocale)} · {v.rules_version}</div>
                  </li>
                ))}
              </ul>
            </div>
            {data.reviews.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.reviews')}</h3>
                <ul className="space-y-2 text-sm">
                  {data.reviews.map((r) => (
                    <li key={r.id} className="rounded-xl bg-paper p-3">
                      <div className="font-semibold">{t(`status.${r.decision}`)} — {r.reviewer_name}</div>
                      <div>{r.reason}</div>
                      <div className="text-xs text-asphalt-500">{fmtDateTime(r.created_at, intlLocale)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.photos.filter((p) => p.status !== 'ACTIVE').length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.superseded')} / {t('job.invalidated')}</h3>
                <ul className="space-y-1 text-sm">
                  {data.photos.filter((p) => p.status !== 'ACTIVE').map((p) => (
                    <li key={p.id}>{p.capture_type} · {t('job.attempt', { n: p.attempt_number })} · {p.status} — {p.status_reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-sm font-semibold text-asphalt-500">{t('job.audit')} ({data.audit.length})</h3>
              <ul className="space-y-1 text-xs">
                {[...data.audit].reverse().map((a) => (
                  <li key={a.id} className="border-b border-asphalt-100 py-1">
                    <span className="text-asphalt-500">{fmtDateTime(a.created_at, intlLocale)}</span> · <b>{a.action}</b> · {a.actor_name ?? 'system'}
                    {a.details && Object.keys(a.details).length > 0 && <div className="break-all text-asphalt-500">{JSON.stringify(a.details)}</div>}
                  </li>
                ))}
              </ul>
            </div>
            <Link to={`/reports?job=${job.id}`} className="flex items-center gap-2 text-sm font-semibold text-primary-600"><IconReport size={18} />{t('dashboard.report')}</Link>
          </div>
        </details>

        {user?.role === 'admin' && job.status !== 'DELETED' && <AdminTools detail={data} reload={() => void reload()} />}

        {(permissions.can_cancel || permissions.can_delete) && (
          <div className="space-y-2 pt-2">
            {permissions.can_cancel && (
              <ReasonPrompt label={t('job.cancelReason')} minLength={3} buttonLabel={t('job.cancelJob')} onSubmit={async (r) => { await api.cancelJob(job.id, r); await reload(); }} />
            )}
            {permissions.can_delete && (
              <ReasonPrompt
                label={t('job.deleteReason')}
                minLength={5}
                buttonLabel={t('job.deleteJob')}
                onSubmit={async (r) => {
                  await api.deleteJob(job.id, r);
                  navigate('/', { replace: true });
                }}
              />
            )}
          </div>
        )}
      </div>

      {step.action && (
        <BottomBar>
          {step.action.markRepaired ? (
            <Button className="w-full" busy={busy} onClick={markRepaired}>{step.action.icon}{t(step.action.label)}</Button>
          ) : (
            <LinkButton to={step.action.to!} className="w-full">{step.action.icon}{t(step.action.label)}</LinkButton>
          )}
        </BottomBar>
      )}
    </div>
  );
}
