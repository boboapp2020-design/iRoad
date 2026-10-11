import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'interrupted' | 'error';
export type CaptureMethod = 'image_capture_api' | 'video_frame_canvas';

interface ImageCaptureLike {
  takePhoto(settings?: Record<string, unknown>): Promise<Blob>;
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined;

/**
 * Live rear-camera stream. Captures come from the camera track itself
 * (ImageCapture.takePhoto when available, otherwise a full-resolution frame
 * of the video track encoded once as JPEG) — never a screenshot of the UI,
 * never a gallery file, with no filters or overlays.
 */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [info, setInfo] = useState<{ width: number; height: number; label: string; facingMode?: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => setStatus('interrupted'));
      const s = track.getSettings();
      setInfo({ width: s.width ?? 0, height: s.height ?? 0, label: track.label, facingMode: s.facingMode });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') setStatus('unavailable');
      else setStatus('error');
    }
  }, [stop, videoRef]);

  useEffect(() => {
    if (!enabled) return;
    void start();
    const onVisibility = () => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (document.visibilityState === 'visible' && (!track || track.readyState === 'ended')) setStatus('interrupted');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [enabled, start, stop]);

  const capture = useCallback(async (): Promise<{ blob: Blob; method: CaptureMethod; width: number; height: number }> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') throw new Error('CAMERA_NOT_LIVE');
    if (typeof ImageCapture !== 'undefined') {
      try {
        const blob = await new ImageCapture(track).takePhoto();
        if (blob && blob.size > 0 && /^image\/(jpeg|png|webp)$/.test(blob.type)) {
          const dims = await imageSize(blob).catch(() => ({ width: 0, height: 0 }));
          return { blob, method: 'image_capture_api', ...dims };
        }
      } catch {
        /* fall back to the video frame below */
      }
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) throw new Error('CAMERA_NOT_READY');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) throw new Error('ENCODE_FAILED');
    return { blob, method: 'video_frame_canvas', width: canvas.width, height: canvas.height };
  }, [videoRef]);

  return { status, info, start, stop, capture };
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const r = { width: bmp.width, height: bmp.height };
  bmp.close();
  return r;
}
