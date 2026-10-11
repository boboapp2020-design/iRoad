import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CURRENT_RULES, type VerificationReason } from '@verification';
import { VerificationBadge } from '@/components/badges';
import { Compass } from '@/components/Compass';
import { EvidenceImage } from '@/components/EvidenceImage';
import { Alert, Button, CheckIcon, KeyValue, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError, type CaptureType, type SubmitCapturePayload, type Verification } from '@/lib/api';
import { deviceMetadata } from '@/lib/device';
import { errorMessage, fmtBytes, fmtCoord, fmtDateTime, fmtNum, reasonText } from '@/lib/format';
import { arrayBufferToBase64, sha256Hex, uuid } from '@/lib/hash';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';
import { evaluateGate, measurementFrom, toPayload, type GateCheck } from './captureGate';
import { createSubmitter, type SubmissionState } from './submitter';
import { useCamera, type CaptureMethod } from './useCamera';
import { useGeolocation } from './useGeolocation';
import { useHeading } from './useHeading';

const AFTER_STATUSES = ['AWAITING_AFTER_PHOTO', 'NEEDS_RECAPTURE', 'REJECTED'];
const MAX_CAPTURE_DURATION_MS = 5000;

interface Captured {
  photoId: string;
  blob: Blob;
  url: string;
  sha256: string;
  method: CaptureMethod;
  width: number;
  height: number;
  measurement: ReturnType<typeof measurementFrom>;
  fixTimeSource: string;
  distanceM: number | null;
  headingDiffDeg: number | null;
}

function CheckLine({ check }: { check: GateCheck }) {
  const { t } = useI18n();
  const bg = check.state === 'ok' ? 'bg-emerald-50/95 text-emerald-900' : check.state === 'bad' ? 'bg-red-50/95 text-red-900' : 'bg-white/90 text-slate-800';
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow ${bg}`} aria-live="polite">
      <CheckIcon state={check.state} />
      <span>{t(check.message, check.params)}</span>
    </div>
  );
}

export function CapturePage() {
  const { id = '', type = 'BEFORE' } = useParams();
  const captureType = (type === 'AFTER' ? 'AFTER' : 'BEFORE') as CaptureType;
  const { t, intlLocale } = useI18n();
  const navigate = useNavigate();
  const detail = useAsync(() => api.getJob(id), [id]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState<'intro' | 'live' | 'review' | 'done'>('intro');
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showCalib, setShowCalib] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ kind: 'idle' });
  const submitter = useMemo(() => createSubmitter(api.submitCapture, setSubmission), []);

  const sensorsOn = phase === 'live' || phase === 'review';
  const geo = useGeolocation(sensorsOn);
  const heading = useHeading(sensorsOn);
  const camera = useCamera(videoRef, phase === 'live');

  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  // Warn before leaving with an unsaved or in-flight capture.
  useEffect(() => {
    const dirty = (phase === 'review' && submission.kind !== 'success') || submission.kind === 'uploading';
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase, submission.kind]);

  useEffect(() => () => {
    if (captured) URL.revokeObjectURL(captured.url);
  }, [captured]);

  const job = detail.data?.job;
  const before = detail.data?.photos.find((p) => p.id === job?.current_before_photo_id) ?? null;
  const rules = CURRENT_RULES;

  const gate = evaluateGate({ mode: captureType, fix: geo.fix, heading: heading.reading, headingStatus: heading.status, now, rules, before });

  const startSensors = useCallback(async () => {
    if (heading.needsPermission) await heading.requestPermission(); // iOS: must be inside a user gesture
    setPhase('live');
  }, [heading]);

  const shutter = useCallback(async () => {
    if (capturing) return;
    setCaptureError(null);
    setCapturing(true);
    try {
      // 1) Re-check with the freshest readings immediately before capture.
      const t0 = Date.now();
      const pre = evaluateGate({ mode: captureType, fix: geo.fixRef.current, heading: heading.readingRef.current, headingStatus: heading.status, now: t0, rules, before });
      if (!pre.ready) throw new Error('RECHECK');
      const snapshot = measurementFrom(geo.fixRef.current, heading.readingRef.current, t0);
      // 2) Capture from the live camera track.
      const shot = await camera.capture();
      // 3) Re-check again afterwards; discard if anything drifted or capture was slow.
      const t1 = Date.now();
      const post = evaluateGate({ mode: captureType, fix: geo.fixRef.current, heading: heading.readingRef.current, headingStatus: heading.status, now: t1, rules, before });
      if (!post.ready || t1 - t0 > MAX_CAPTURE_DURATION_MS) throw new Error('RECHECK');
      const buf = await shot.blob.arrayBuffer();
      const hash = await sha256Hex(buf);
      setCaptured({
        photoId: uuid(),
        blob: shot.blob,
        url: URL.createObjectURL(shot.blob),
        sha256: hash,
        method: shot.method,
        width: shot.width,
        height: shot.height,
        measurement: snapshot,
        fixTimeSource: geo.fixRef.current?.timeSource ?? 'unknown',
        distanceM: pre.distanceM,
        headingDiffDeg: pre.headingDiffDeg,
      });
      setPhase('review');
    } catch (e) {
      setCaptureError((e as Error).message === 'RECHECK' ? t('capture.recheckFailed') : t('capture.cameraInterrupted'));
    } finally {
      setCapturing(false);
    }
  }, [capturing, captureType, geo.fixRef, heading.readingRef, heading.status, rules, before, camera, t]);

  const payloadRef = useRef<SubmitCapturePayload | null>(null);
  const save = useCallback(async () => {
    if (!captured || !job) return;
    if (!payloadRef.current || payloadRef.current.photo_id !== captured.photoId) {
      payloadRef.current = {
        job_id: job.id,
        capture_type: captureType,
        photo_id: captured.photoId,
        image_base64: arrayBufferToBase64(await captured.blob.arrayBuffer()),
        mime_type: captured.blob.type || 'image/jpeg',
        client_sha256: captured.sha256,
        capture_method: captured.method,
        device_metadata: deviceMetadata({
          camera: camera.info,
          image: { width: captured.width, height: captured.height },
          fix_time_source: captured.fixTimeSource,
          heading_samples: heading.reading?.sampleCount ?? null,
        }),
        measurement: toPayload(captured.measurement),
      };
    }
    const s = await submitter.submit(payloadRef.current);
    if (s.kind === 'success') setPhase('done');
  }, [captured, job, captureType, camera.info, heading.reading, submitter]);

  const retake = () => {
    if (submission.kind === 'uploading') return;
    if (captured && submission.kind !== 'rejected' && !window.confirm(t('capture.cancelConfirm'))) return;
    setCaptured(null);
    payloadRef.current = null;
    setSubmission({ kind: 'idle' });
    setPhase('live');
  };

  const leave = () => {
    if (phase === 'review' && submission.kind !== 'success' && !window.confirm(t('capture.cancelConfirm'))) return;
    navigate(`/jobs/${id}`);
  };

  const title = captureType === 'BEFORE' ? t('capture.beforeTitle') : t('capture.afterTitle');

  /* ---------------------------------------------------------------- guards */
  if (detail.loading && !detail.data) return <><PageHeader title={title} back={`/jobs/${id}`} /><div className="flex justify-center p-8"><Spinner /></div></>;
  if (detail.error || !job) return <><PageHeader title={title} back={`/jobs/${id}`} /><div className="p-4"><Alert kind="error">{errorMessage(t, detail.error)}</Alert></div></>;
  const allowed = detail.data!.permissions.can_capture && (captureType === 'BEFORE' ? job.status === 'DRAFT' : AFTER_STATUSES.includes(job.status) && !!before);
  if (!allowed && phase !== 'done') {
    return (
      <><PageHeader title={title} back={`/jobs/${id}`} />
        <div className="p-4"><Alert kind="warning">{captureType === 'AFTER' && !before ? t('errors.BEFORE_REQUIRED') : t('errors.INVALID_STATE')}</Alert></div></>
    );
  }

  /* ------------------------------------------------------------------ intro */
  if (phase === 'intro') {
    return (
      <div className="min-h-full bg-white">
        <PageHeader title={title} back={`/jobs/${id}`} />
        <div className="space-y-4 p-4">
          <div className="text-lg font-bold">{job.job_code} · {job.road_name}</div>
          <p className="text-slate-700">{t('capture.permissionsIntro')}</p>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 font-semibold">{t('capture.criteria')}</div>
            <ul className="list-inside list-disc space-y-1 text-sm">
              <li>{t('capture.critAccuracy', { v: rules.maxGpsAccuracyM })}</li>
              {captureType === 'AFTER' && <li>{t('capture.critDistance', { v: rules.maxDistanceM })}</li>}
              {captureType === 'AFTER' && <li>{t('capture.critHeading', { v: rules.maxHeadingDifferenceDeg })}</li>}
              <li>{t('capture.critFresh', { v: rules.maxLocationAgeMs / 1000 })}</li>
            </ul>
          </div>
          <Alert kind="info">{t('capture.gpsLimitNote')}<br />{t('capture.headingNote')}</Alert>
          <Alert kind="info">{t('capture.calibrate')}</Alert>
          <Button className="w-full" onClick={() => void startSensors()}>{t('capture.requestPermissions')}</Button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- done */
  if (phase === 'done' && submission.kind === 'success') {
    const r = submission.result;
    if (captureType === 'BEFORE') {
      return (
        <div className="min-h-full bg-white">
          <PageHeader title={title} />
          <div className="space-y-4 p-4">
            <Alert kind="success">{t('capture.beforeSaved')}</Alert>
            <EvidenceImage photoId={r.photo.id} alt="before" className="aspect-[4/3] w-full rounded-xl" />
            <KeyValue label={t('job.sha256')} value={r.photo.sha256_hash} mono />
            <Button className="w-full" onClick={() => navigate(`/jobs/${id}`, { replace: true })}>{t('navigate.backToJob')}</Button>
          </div>
        </div>
      );
    }
    return <AfterResult verification={r.verification!} beforeId={before!.id} afterId={r.photo.id} onBack={() => navigate(`/jobs/${id}`, { replace: true })} />;
  }

  /* ----------------------------------------------------------------- review */
  if (phase === 'review' && captured) {
    const m = captured.measurement;
    const rejectReasons = submission.kind === 'rejected' ? ((submission.error.details as { reasons?: VerificationReason[] } | null)?.reasons ?? []) : [];
    return (
      <div className="min-h-full bg-white">
        <PageHeader title={t('capture.review')} right={<button className="px-3 text-sm font-semibold text-slate-600" onClick={leave}>{t('common.cancel')}</button>} />
        <div className="space-y-3 p-4">
          <img src={captured.url} alt={title} className="w-full rounded-xl" />
          <div>
            <KeyValue label={t('job.capturedAt')} value={fmtDateTime(new Date(m.capturedAt as number).toISOString(), intlLocale)} />
            <KeyValue label={t('job.coords')} value={fmtCoord(m.latitude, m.longitude)} />
            <KeyValue label={t('job.accuracy')} value={t('common.meters', { v: fmtNum(m.accuracyM) })} />
            <KeyValue label={t('job.heading')} value={m.headingDeg == null ? '—' : `${fmtNum(m.headingDeg, 0)}° ±${fmtNum(m.headingUncertaintyDeg)}`} />
            {captureType === 'AFTER' && <KeyValue label={t('verification.distance')} value={t('common.meters', { v: fmtNum(captured.distanceM) })} />}
            {captureType === 'AFTER' && <KeyValue label={t('verification.headingDiff')} value={`${fmtNum(captured.headingDiffDeg)}°`} />}
            <KeyValue label={t('job.fileSize')} value={`${fmtBytes(captured.blob.size)} · ${captured.width}×${captured.height}`} />
            <KeyValue label={t('job.sha256')} value={captured.sha256} mono />
          </div>
          {captureType === 'AFTER' && submission.kind !== 'success' && <Alert kind="info">{t('capture.pendingServer')}</Alert>}
          {submission.kind === 'uploading' && <Alert kind="info"><Spinner small /> {t('capture.uploading')} {t('capture.leaveWarning')}</Alert>}
          {submission.kind === 'unknown' && <Alert kind="warning">{t('capture.uploadUnknown')}</Alert>}
          {submission.kind === 'rejected' && (
            <Alert kind="error">
              <div className="font-semibold">{t('capture.rejected')}: {errorMessage(t, submission.error)}</div>
              {rejectReasons.length > 0 && <ul className="mt-1 list-inside list-disc">{rejectReasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={retake} disabled={submission.kind === 'uploading' || submission.kind === 'unknown'}>{t('capture.retake')}</Button>
            {submission.kind === 'rejected' ? (
              <Button onClick={retake}>{t('capture.retake')}</Button>
            ) : (
              <Button busy={submission.kind === 'uploading'} onClick={() => void save()}>
                {submission.kind === 'unknown' ? t('common.retry') : captureType === 'BEFORE' ? t('capture.saveBefore') : t('capture.submitAfter')}
              </Button>
            )}
          </div>
          {submission.kind === 'rejected' && submission.error instanceof ApiError && submission.error.code === 'CAPTURE_TOO_OLD' && <Alert kind="warning">{t('capture.tooOld')}</Alert>}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- live */
  const gpsCheck = gate.checks.find((c) => c.key === 'gps')!;
  const headingCheck = gate.checks.find((c) => c.key === 'heading')!;
  const blocked = gate.checks.find((c) => c.state !== 'ok');
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 px-2 py-2 safe-top">
        <button aria-label="back" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl" onClick={leave}>‹</button>
        <h1 className="flex-1 text-center text-lg font-bold">{title}</h1>
        <button className="h-11 rounded-full px-3 text-sm" onClick={() => setShowCalib((v) => !v)} aria-label="calibration">🧭</button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {camera.status !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            {camera.status === 'starting' && <Spinner />}
            {camera.status === 'denied' && <p>{t('capture.cameraDenied')}</p>}
            {camera.status === 'unavailable' && <p>{t('capture.cameraUnavailable')}</p>}
            {(camera.status === 'interrupted' || camera.status === 'error') && (
              <Button variant="secondary" onClick={() => void camera.start()}>{t('capture.cameraInterrupted')}</Button>
            )}
          </div>
        )}
        <div className="absolute inset-x-2 top-2 space-y-2">
          {captureType === 'AFTER' ? (
            gate.checks.map((c) => <CheckLine key={c.key} check={c} />)
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <CheckLine check={gpsCheck} />
              <CheckLine check={headingCheck} />
            </div>
          )}
          {heading.status === 'needs-permission' && <Button variant="secondary" onClick={() => void heading.requestPermission()}>{t('capture.headingPermission')}</Button>}
          {geo.status === 'denied' && <Alert kind="error">{t('capture.gpsDenied')}</Alert>}
          {geo.status === 'unavailable' && <Alert kind="error">{t('capture.gpsUnavailable')}</Alert>}
          {showCalib && <Alert kind="info">{t('capture.calibrate')}</Alert>}
          {captureError && <Alert kind="error">{captureError}</Alert>}
        </div>
        <div className="absolute bottom-2 right-2">
          <Compass heading={heading.reading?.headingDeg ?? null} target={captureType === 'AFTER' ? before?.heading_degrees : null} tolerance={rules.maxHeadingDifferenceDeg} size={110} />
        </div>
        <div className="absolute bottom-2 left-2 rounded-xl bg-black/65 px-3 py-2 font-mono text-xs leading-5">
          <div>Lat: {geo.fix ? geo.fix.latitude.toFixed(6) : '—'}</div>
          <div>Lng: {geo.fix ? geo.fix.longitude.toFixed(6) : '—'}</div>
          <div>Accuracy: {geo.fix ? `${fmtNum(geo.fix.accuracy)} m` : '—'}</div>
          <div>Heading: {heading.reading ? `${Math.round(heading.reading.headingDeg)}° ±${fmtNum(heading.reading.uncertaintyDeg)}` : '—'}</div>
          {captureType === 'AFTER' && before && <div>{t('capture.target')}: {fmtNum(before.heading_degrees, 0)}°</div>}
        </div>
      </div>
      <div className="flex items-center justify-between bg-black px-6 py-4 safe-bottom">
        <div className="h-14 w-14 overflow-hidden rounded-lg ring-1 ring-white/30">
          {captureType === 'AFTER' && before ? <EvidenceImage photoId={before.id} variant="thumb" alt={t('capture.original')} className="h-14 w-14" /> : null}
        </div>
        <button
          aria-label={t('capture.capture')}
          disabled={!gate.ready || capturing || camera.status !== 'live'}
          onClick={() => void shutter()}
          className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${gate.ready && camera.status === 'live' ? 'border-white bg-white/90 active:scale-95' : 'border-slate-500 bg-slate-700'}`}
        >
          {capturing ? <Spinner /> : <span className={`h-14 w-14 rounded-full ${gate.ready ? 'bg-white ring-2 ring-slate-300' : 'bg-slate-600'}`} />}
        </button>
        <button aria-label="restart camera" className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl" onClick={() => { geo.retry(); void camera.start(); }}>⟳</button>
      </div>
      {!gate.ready && blocked && (
        <div className="bg-black px-4 pb-3 text-center text-sm text-amber-300">{t('capture.wait')}{t(blocked.message, blocked.params)}</div>
      )}
    </div>
  );
}

function AfterResult({ verification: v, beforeId, afterId, onBack }: { verification: Verification; beforeId: string; afterId: string; onBack: () => void }) {
  const { t } = useI18n();
  const row = (label: string, value: string, pass: boolean | null) => (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2 font-semibold">{value}<CheckIcon state={pass === null ? null : pass ? 'ok' : 'bad'} /></span>
    </div>
  );
  const box = v.overall_status === 'PASS' ? 'bg-emerald-50 ring-emerald-200' : v.overall_status === 'FAIL' ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200';
  return (
    <div className="min-h-full bg-white">
      <PageHeader title={t('job.compare')} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div><div className="mb-1 text-center text-sm font-semibold">{t('job.beforePhoto')}</div><EvidenceImage photoId={beforeId} alt="before" className="aspect-[3/4] w-full rounded-xl" /></div>
          <div><div className="mb-1 text-center text-sm font-semibold">{t('job.afterPhoto')}</div><EvidenceImage photoId={afterId} alt="after" className="aspect-[3/4] w-full rounded-xl" /></div>
        </div>
        <div>
          {row(t('verification.distance'), v.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(v.measured_distance_m) }), v.distance_pass)}
          {row(t('verification.headingDiff'), v.heading_difference_degrees == null ? '—' : `${fmtNum(v.heading_difference_degrees)}°`, v.heading_pass)}
          {row(t('verification.gpsBefore'), t('common.meters', { v: fmtNum(v.before_accuracy_m) }), v.before_accuracy_m == null ? null : v.before_accuracy_m <= (v.thresholds.max_gps_accuracy_m ?? 3))}
          {row(t('verification.gpsAfter'), t('common.meters', { v: fmtNum(v.after_accuracy_m) }), v.after_accuracy_m == null ? null : v.after_accuracy_m <= (v.thresholds.max_gps_accuracy_m ?? 3))}
        </div>
        <div className={`rounded-2xl p-4 ring-1 ${box}`}>
          <div className="flex items-center gap-3"><VerificationBadge status={v.overall_status} large /></div>
          <p className="mt-2 text-sm">{t('capture.saved', { status: t(`verification.${v.overall_status}`) })}</p>
          <p className="text-sm text-slate-600">{t(`verification.${v.overall_status}_desc`)}</p>
          {v.failure_reasons.filter((r) => r.severity !== 'WARNING' || v.overall_status === 'PASS').length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm">{v.failure_reasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>
          )}
        </div>
        <Button className="w-full" onClick={onBack}>{t('navigate.backToJob')}</Button>
      </div>
    </div>
  );
}
