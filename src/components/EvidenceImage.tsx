import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { base64ToBlob } from '@/lib/hash';
import { Spinner } from './ui';

/**
 * Evidence images are fetched through the authenticated API and kept only as
 * in-memory object URLs (never in the service worker cache or storage).
 */
const cache = new Map<string, Promise<{ url: string; integrityOk: boolean | null }>>();

export function clearEvidenceCache() {
  cache.forEach((p) => p.then((r) => URL.revokeObjectURL(r.url)).catch(() => undefined));
  cache.clear();
}

/** Object URL for an evidence photo (shared cache with <EvidenceImage>). */
export function loadEvidenceUrl(photoId: string, variant: 'thumb' | 'original' = 'original') {
  return load(photoId, variant).then((r) => r.url);
}

function load(photoId: string, variant: 'thumb' | 'original') {
  const key = `${photoId}:${variant}`;
  let p = cache.get(key);
  if (!p) {
    p = api.getPhoto(photoId, variant).then((r) => ({
      url: URL.createObjectURL(base64ToBlob(r.image_base64, r.mime_type)),
      integrityOk: r.integrity_ok ?? null,
    }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function EvidenceImage({ photoId, variant = 'original', alt, className = '' }: { photoId: string | null | undefined; variant?: 'thumb' | 'original'; alt: string; className?: string }) {
  const [state, setState] = useState<{ url: string; integrityOk: boolean | null } | 'loading' | 'error' | null>(photoId ? 'loading' : null);

  useEffect(() => {
    if (!photoId) return;
    let alive = true;
    setState('loading');
    load(photoId, variant).then(
      (r) => alive && setState(r),
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
    };
  }, [photoId, variant]);

  if (!photoId) return <div className={`flex items-center justify-center bg-asphalt-100 text-asphalt-500 ${className}`}>—</div>;
  if (state === 'loading') return <div className={`flex items-center justify-center bg-asphalt-100 ${className}`}><Spinner /></div>;
  if (state === 'error' || state === null) return <div className={`flex items-center justify-center bg-asphalt-100 text-sm text-stop-700 ${className}`}>⚠</div>;
  return (
    <div className="relative">
      <img src={state.url} alt={alt} className={`object-cover ${className}`} />
      {state.integrityOk === false && (
        <span className="absolute left-1 top-1 rounded bg-stop-600 px-2 py-0.5 text-xs font-bold text-white">SHA-256 ✕</span>
      )}
    </div>
  );
}
