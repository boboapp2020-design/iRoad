import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { bearingDeg, CURRENT_RULES, type VerificationReason } from '@verification';
import { IconArrowUp, IconBack, IconCamera, IconCheckCircle, IconCompass, IconHelp, IconNavigate, IconPin, IconRefresh, IconRotateLeft, IconRotateRight } from '@/components/icons';
import { isInAppBrowser } from '@/lib/device';
import { turnDelta } from '@/lib/workflow';
import { VerificationBadge } from '@/components/badges';
import { Compass } from '@/components/Compass';
import { EvidenceImage } from '@/components/EvidenceImage';
import { Alert, BottomBar, Button, CheckIcon, KeyValue, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError, type CaptureType, type SubmitCapturePayload, type Verification } from '@/lib/api';
import { deviceMetadata } from '@/lib/device';
import { errorMessage, fmtBytes, fmtCoord, fmtDateTime, fmtNum, reasonText } from '@/lib/format';
import { arrayBufferToBase64, sha256Hex, uuid } from '@/lib/hash';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';
import { DemoBanner } from '@/demo/DemoBanner';
import { afterAccuracyLimit, beforeAccuracyLimit, evaluateGate, measurementFrom, toPayload, type GateCheck } from './captureGate';
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
  positionSamples: number;
  distanceM: number | null;
  headingDiffDeg: number | null;
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

  const inAppBrowser = useMemo(() => isInAppBrowser(), []);
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
      // 3) The measurement recorded is the one taken at the shutter press (above);
      //    small jitter afterwards must not discard a correct photo. The server re-verifies it.
      if (Date.now() - t0 > MAX_CAPTURE_DURATION_MS) throw new Error('SLOW_CAPTURE');
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
        positionSamples: geo.fixRef.current?.sampleCount ?? 0,
        distanceM: pre.distanceM,
        headingDiffDeg: pre.headingDiffDeg,
      });
      setPhase('review');
    } catch (e) {
      const code = (e as Error).message;
      setCaptureError(
        code === 'RECHECK' ? t('capture.recheckFailed')
          : code === 'SLOW_CAPTURE' ? t('capture.slowCapture')
          : code === 'CAMERA_NOT_LIVE' || code === 'CAMERA_NOT_READY' ? t('capture.cameraInterrupted')
          : `${t('capture.captureFailed')} (${code || 'unknown'})`,
      );
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
          position_method: 'accuracy_weighted_mean_5s',
          position_samples: captured.positionSamples,
          heading_platform_accuracy_deg: heading.readingRef.current?.platformAccuracyDeg ?? null,
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
    const needs = [
      { icon: <IconCamera />, title: t('capture.needCamera'), text: t('capture.needCameraText') },
      { icon: <IconPin />, title: t('capture.needLocation'), text: captureType === 'AFTER' ? t('capture.needLocationAfter', { d: rules.maxDistanceM }) : t('capture.needLocationBefore') },
      { icon: <IconCompass />, title: t('capture.needCompass'), text: captureType === 'AFTER' ? t('capture.needCompassAfter', { h: rules.maxHeadingDifferenceDeg }) : t('capture.needCompassBefore') },
    ];
    return (
      <div className="min-h-full bg-paper">
        <PageHeader title={title} back={`/jobs/${id}`} />
        <div className="mx-auto max-w-3xl space-y-5 p-4">
          <div>
            <div className="text-sm font-semibold text-asphalt-500">{job.job_code}</div>
            <div className="text-xl font-bold text-asphalt-950">{job.road_name}</div>
            <p className="mt-1 text-[15px] text-asphalt-700">{t('capture.introLead')}</p>
          </div>
          {inAppBrowser && <Alert kind="warning">{t('capture.inAppBrowser')}</Alert>}
          <ul className="space-y-2">
            {needs.map((n) => (
              <li key={n.title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-asphalt-100">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">{n.icon}</span>
                <span>
                  <span className="block font-semibold text-asphalt-950">{n.title}</span>
                  <span className="block text-[15px] text-asphalt-500">{n.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <details className="rounded-2xl bg-white px-4 py-3.5 text-[15px] text-asphalt-700 ring-1 ring-asphalt-100">
            <summary className="cursor-pointer font-semibold text-asphalt-900">{t('capture.tipsTitle')}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t('capture.calibrate')}</li>
              <li>{t('capture.gpsLimitNote')}</li>
              <li>{t('capture.headingNote')}</li>
            </ul>
          </details>
        </div>
        <BottomBar>
          <Button className="w-full" onClick={() => void startSensors()}><IconCamera />{t('capture.openCamera')}</Button>
        </BottomBar>
      </div>
    );
  }

  /* ------------------------------------------------------------------- done */
  if (phase === 'done' && submission.kind === 'success') {
    const r = submission.result;
    if (captureType === 'BEFORE') {
      return (
        <div className="min-h-full bg-paper">
          <PageHeader title={title} />
          <div className="mx-auto max-w-3xl space-y-4 p-4">
            <div className="flex items-center gap-3 rounded-2xl bg-go-50 p-4 text-go-700">
              <IconCheckCircle size={32} className="shrink-0" />
              <div>
                <div className="text-lg font-bold">{t('capture.beforeSaved')}</div>
                <div className="text-[15px] text-asphalt-700">{t('capture.beforeSavedNext')}</div>
              </div>
            </div>
            <EvidenceImage photoId={r.photo.id} alt="before" className="aspect-[4/3] w-full rounded-2xl" />
          </div>
          <BottomBar>
            <Button className="w-full" onClick={() => navigate(`/jobs/${id}`, { replace: true })}>{t('navigate.backToJob')}</Button>
          </BottomBar>
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
      <div className="min-h-full bg-paper">
        <PageHeader title={t('capture.review')} right={<button className="px-3 text-[15px] font-semibold text-asphalt-500" onClick={leave}>{t('common.cancel')}</button>} />
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          <img src={captured.url} alt={title} className="w-full rounded-2xl" />
          <div className="rounded-2xl bg-white px-4 py-1 ring-1 ring-asphalt-100">
            <KeyValue label={t('job.capturedAt')} value={fmtDateTime(new Date(m.capturedAt as number).toISOString(), intlLocale)} />
            <KeyValue label={t('job.coords')} value={fmtCoord(m.latitude, m.longitude)} />
            <KeyValue label={t('job.accuracy')} value={t('common.meters', { v: fmtNum(m.accuracyM) })} />
            <KeyValue label={t('job.heading')} value={m.headingDeg == null ? '—' : `${fmtNum(m.headingDeg, 0)}° ±${fmtNum(m.headingUncertaintyDeg)}`} />
            {captureType === 'AFTER' && <KeyValue label={t('verification.distance')} value={t('common.meters', { v: fmtNum(captured.distanceM) })} />}
            {captureType === 'AFTER' && <KeyValue label={t('verification.headingDiff')} value={`${fmtNum(captured.headingDiffDeg)}°`} />}
            <KeyValue label={t('job.fileSize')} value={`${fmtBytes(captured.blob.size)} · ${captured.width}×${captured.height}`} />
            <KeyValue label={t('job.sha256')} value={captured.sha256} mono />
          </div>
          {captureType === 'BEFORE' && rules.maxGpsAccuracyM !== null && m.accuracyM != null && m.accuracyM > rules.maxGpsAccuracyM && <Alert kind="warning">{t('capture.referenceWeakNote')}</Alert>}
          {captureType === 'AFTER' && submission.kind !== 'success' && <Alert kind="info">{t('capture.pendingServer')}</Alert>}
          {submission.kind === 'uploading' && <Alert kind="info"><Spinner small /> {t('capture.uploading')} {t('capture.leaveWarning')}</Alert>}
          {submission.kind === 'unknown' && <Alert kind="warning">{t('capture.uploadUnknown')}</Alert>}
          {submission.kind === 'rejected' && (
            <Alert kind="error">
              <div className="font-semibold">{t('capture.rejected')}: {errorMessage(t, submission.error)}</div>
              {rejectReasons.length > 0 && <ul className="mt-1 list-inside list-disc">{rejectReasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>}
            </Alert>
          )}
          {submission.kind === 'rejected' && submission.error instanceof ApiError && submission.error.code === 'CAPTURE_TOO_OLD' && <Alert kind="warning">{t('capture.tooOld')}</Alert>}
        </div>
        <BottomBar>
          {submission.kind === 'rejected' ? (
            <Button className="w-full" onClick={retake}><IconCamera />{t('capture.retake')}</Button>
          ) : (
            <>
              <Button variant="secondary" className="flex-1" onClick={retake} disabled={submission.kind === 'uploading' || submission.kind === 'unknown'}>{t('capture.retake')}</Button>
              <Button className="flex-[2]" busy={submission.kind === 'uploading'} onClick={() => void save()}>
                {submission.kind === 'unknown' ? t('common.retry') : captureType === 'BEFORE' ? t('capture.saveBefore') : t('capture.submitAfter')}
              </Button>
            </>
          )}
        </BottomBar>
      </div>
    );
  }

  /* ------------------------------------------------------------------- live */
  const blocked = gate.checks.find((c) => c.state === 'bad') ?? gate.checks.find((c) => c.state !== 'ok');
  const ready = gate.ready && camera.status === 'live';
  // Guidance for the After photo: which way to turn, and which way to walk.
  const turn = captureType === 'AFTER' && heading.reading && before?.heading_degrees != null ? turnDelta(heading.reading.headingDeg, before.heading_degrees) : null;
  const walkBearing = captureType === 'AFTER' && geo.fix && before ? bearingDeg(geo.fix, { latitude: before.latitude, longitude: before.longitude }) : null;
  const walkRelative = walkBearing !== null && heading.reading ? turnDelta(heading.reading.headingDeg, walkBearing) : null;
  const distanceBad = gate.checks.find((c) => c.key === 'distance')?.state === 'bad';
  const headingBad = gate.checks.find((c) => c.key === 'heading')?.state === 'bad' && turn !== null && Math.abs(turn) > rules.maxHeadingDifferenceDeg;
  const instruction = ready
    ? t('capture.readyNow')
    : distanceBad && gate.distanceM !== null
      ? t('capture.walkTo', { v: fmtNum(gate.distanceM) })
      : headingBad && turn !== null
        ? t(turn > 0 ? 'capture.turnRight' : 'capture.turnLeft', { d: Math.round(Math.abs(turn)) })
        : blocked ? t(blocked.message, blocked.params) : t('capture.waitingGps');
  const checkCard = (key: GateCheck['key'], icon: ReactNode, label: string, detail?: string) => {
    const c = gate.checks.find((x) => x.key === key);
    if (!c) return null;
    const tone = c.state === 'ok' ? 'bg-go-50/95 text-go-700' : c.state === 'bad' ? 'bg-stop-50/95 text-stop-700' : 'bg-white/90 text-asphalt-700';
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 shadow-sm ${tone}`} title={t(c.message, c.params)}>
        <span className="shrink-0">{c.state === 'ok' ? <IconCheckCircle size={22} /> : icon}</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-bold">{label}</span>
          {detail && <span className="block truncate text-[12px] font-medium opacity-80">{detail}</span>}
        </span>
      </div>
    );
  };
  const okWord = (key: GateCheck['key']) => {
    const c = gate.checks.find((x) => x.key === key);
    return c?.state === 'ok' ? t('capture.inRange') : c?.state === 'bad' ? t('capture.outOfRange') : t('capture.measuring');
  };
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <DemoBanner />
      <div className="flex items-center gap-1 bg-black px-2 py-2 safe-top">
        <button aria-label={t('common.back')} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={leave}><IconBack /></button>
        <h1 className="flex-1 text-center text-[17px] font-bold">{title}</h1>
        <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setShowCalib((v) => !v)} aria-label={t('capture.tipsTitle')} aria-expanded={showCalib}><IconHelp /></button>
      </div>
      <div className={`relative flex-1 overflow-hidden transition ${ready ? 'ring-4 ring-inset ring-go-600' : ''}`}>
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {camera.status !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
            {camera.status === 'starting' && <Spinner />}
            {camera.status === 'denied' && <p className="max-w-xs">{t('capture.cameraDenied')}</p>}
            {camera.status === 'unavailable' && <p className="max-w-xs">{t('capture.cameraUnavailable')}</p>}
            {(camera.status === 'interrupted' || camera.status === 'error' || camera.status === 'denied') && (
              <Button onClick={() => void camera.start()}><IconRefresh />{t('capture.restartCamera')}</Button>
            )}
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex gap-2">
          {captureType === 'AFTER'
            ? checkCard('distance', <IconNavigate size={20} />, gate.distanceM !== null ? t('capture.cardDistance', { v: fmtNum(gate.distanceM) }) : t('capture.cardDistanceWait'), `${okWord('distance')} (≤ ${rules.maxDistanceM} ${t('common.m')})`)
            : checkCard('gps', <IconPin size={20} />, geo.fix ? `GPS ±${fmtNum(geo.fix.accuracy)} ${t('common.m')}` : t('capture.chipGps'), okWord('gps'))}
          {checkCard(
            'heading',
            <IconCompass size={20} />,
            heading.reading ? t('capture.cardHeading', { v: Math.round(heading.reading.headingDeg) }) : t('capture.chipHeading'),
            captureType === 'AFTER' && turn !== null ? `${t('capture.cardHeadingDiff', { d: Math.round(Math.abs(turn)) })} (≤ ${rules.maxHeadingDifferenceDeg}°)` : okWord('heading'),
          )}
        </div>
        {captureType === 'AFTER' && !ready && (distanceBad || headingBad) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="flex h-36 w-36 items-center justify-center rounded-full bg-black/45">
              {distanceBad && walkRelative !== null ? (
                <IconArrowUp size={84} strokeWidth={2.5} className="text-white" style={{ transform: `rotate(${walkRelative}deg)` }} />
              ) : headingBad && turn !== null ? (
                turn > 0 ? <IconRotateRight size={84} className="text-white" /> : <IconRotateLeft size={84} className="text-white" />
              ) : null}
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-white/90">
          <div>Lat: {geo.fix ? geo.fix.latitude.toFixed(6) : '—'}</div>
          <div>Lng: {geo.fix ? geo.fix.longitude.toFixed(6) : '—'}</div>
          <div>Accuracy: {geo.fix ? `${fmtNum(geo.fix.accuracy)} ${t('common.m')}` : '—'}</div>
          <div>Heading: {heading.reading ? `${Math.round(heading.reading.headingDeg)}°` : '—'}</div>
        </div>
        {captureType === 'AFTER' && (
          <div className="absolute bottom-3 right-3">
            <Compass heading={heading.reading?.headingDeg ?? null} target={before?.heading_degrees} tolerance={rules.maxHeadingDifferenceDeg} size={84} />
          </div>
        )}
        {(showCalib || captureError || heading.status === 'needs-permission' || geo.status === 'denied' || geo.status === 'unavailable') && (
          <div className="absolute inset-x-3 top-20 space-y-2">
            {heading.status === 'needs-permission' && <Button onClick={() => void heading.requestPermission()} className="w-full"><IconCompass />{t('capture.headingPermission')}</Button>}
            {geo.status === 'denied' && <Alert kind="error">{t('capture.gpsDenied')}</Alert>}
            {geo.status === 'unavailable' && <Alert kind="error">{t('capture.gpsUnavailable')}</Alert>}
            {captureError && <Alert kind="error">{captureError}</Alert>}
            {showCalib && (
              <div className="rounded-2xl bg-white p-4 text-[15px] text-asphalt-800">
                <div className="mb-1 font-semibold">{t('capture.tipsTitle')}</div>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t('capture.calibrate')}</li>
                  <li>{t('capture.tipOutdoor')}</li>
                  <li>{t('capture.inAppBrowser')}</li>
                </ul>
                <div className="mt-2 font-mono text-xs text-asphalt-500">
                  {geo.fix ? `${fmtNum(Math.max(0, now - geo.fix.timestamp) / 1000)} s · n=${geo.fix.sampleCount}` : '—'}
                  {heading.reading && ` · ±${fmtNum(heading.reading.uncertaintyDeg)}°`}
                  {captureType === 'AFTER' && before && ` · ${t('capture.target')} ${fmtNum(before.heading_degrees, 0)}°`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-black px-5 pb-4 pt-3 safe-bottom">
        <p className={`mb-3 text-center text-[17px] font-bold leading-snug ${ready ? 'text-go-600' : 'text-white'}`} aria-live="polite">{instruction}</p>
        <div className="flex items-center justify-between">
          <div className="h-14 w-14 overflow-hidden rounded-xl bg-white/10">
            {captureType === 'AFTER' && before ? <EvidenceImage photoId={before.id} variant="thumb" alt={t('capture.original')} className="h-14 w-14" /> : null}
          </div>
          <button
            aria-label={t('capture.capture')}
            disabled={!ready || capturing}
            onClick={() => void shutter()}
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition ${ready ? 'border-white active:scale-95' : 'border-white/30'}`}
          >
            <span className={`flex h-[62px] w-[62px] items-center justify-center rounded-full ${ready ? 'bg-white' : 'bg-white/20'}`}>
              {capturing ? <Spinner small /> : null}
            </span>
          </button>
          <button aria-label={t('capture.restartCamera')} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white" onClick={() => { geo.retry(); void camera.start(); }}><IconRefresh /></button>
        </div>
      </div>
    </div>
  );
}

function AfterResult({ verification: v, beforeId, afterId, onBack }: { verification: Verification; beforeId: string; afterId: string; onBack: () => void }) {
  const { t } = useI18n();
  const beforeLimit = beforeAccuracyLimit(v.thresholds);
  const afterLimit = afterAccuracyLimit(v.thresholds);
  const row = (label: string, value: string, pass: boolean | null | undefined) => (
    <div className="flex items-center justify-between border-b border-asphalt-100 py-3 text-[15px] last:border-0">
      <span className="text-asphalt-500">{label}</span>
      <span className="flex items-center gap-2 font-semibold">{value}{pass !== undefined && <CheckIcon state={pass === null ? null : pass ? 'ok' : 'bad'} />}</span>
    </div>
  );
  const box = v.overall_status === 'PASS' ? 'bg-go-50 text-go-700' : v.overall_status === 'FAIL' ? 'bg-stop-50 text-stop-700' : 'bg-caution-50 text-caution-700';
  return (
    <div className="min-h-full bg-paper">
      <PageHeader title={t('capture.resultTitle')} />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div><div className="mb-1 text-center text-sm font-semibold">{t('job.beforePhoto')}</div><EvidenceImage photoId={beforeId} alt="before" className="aspect-[3/4] w-full rounded-xl" /></div>
          <div><div className="mb-1 text-center text-sm font-semibold">{t('job.afterPhoto')}</div><EvidenceImage photoId={afterId} alt="after" className="aspect-[3/4] w-full rounded-xl" /></div>
        </div>
        <div className="rounded-2xl bg-white px-4 py-1 ring-1 ring-asphalt-100">
          {row(t('verification.distance'), v.measured_distance_m == null ? '—' : t('common.meters', { v: fmtNum(v.measured_distance_m) }), v.distance_pass)}
          {row(t('verification.headingDiff'), v.heading_difference_degrees == null ? '—' : `${fmtNum(v.heading_difference_degrees)}°`, v.heading_pass)}
          {row(t('verification.gpsBefore'), t('common.meters', { v: fmtNum(v.before_accuracy_m) }), beforeLimit === null ? undefined : v.before_accuracy_m == null ? null : v.before_accuracy_m <= beforeLimit)}
          {row(t('verification.gpsAfter'), t('common.meters', { v: fmtNum(v.after_accuracy_m) }), afterLimit === null ? undefined : v.after_accuracy_m == null ? null : v.after_accuracy_m <= afterLimit)}
        </div>
        <div className={`rounded-2xl p-4 ${box}`}>
          <div className="flex items-center gap-3">
            {v.overall_status === 'PASS' ? <IconCheckCircle size={36} className="shrink-0" /> : <VerificationBadge status={v.overall_status} large />}
            <div>
              <div className="text-lg font-bold">{t(`verification.${v.overall_status}`)}</div>
              <div className="text-[15px] text-asphalt-700">{t(`capture.result_${v.overall_status}`)}</div>
            </div>
          </div>
          {v.failure_reasons.filter((r) => r.severity !== 'WARNING' || v.overall_status === 'PASS').length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm">{v.failure_reasons.map((r, i) => <li key={i}>{reasonText(t, r)}</li>)}</ul>
          )}
        </div>
      </div>
      <BottomBar>
        <Button className="w-full" onClick={onBack}>{t('navigate.backToJob')}</Button>
      </BottomBar>
    </div>
  );
}
