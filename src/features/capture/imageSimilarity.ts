/**
 * Rough "same view?" score between the Before photo and the After view.
 *
 * Both images are shrunk to a small grid of local brightness gradients
 * (edges of kerbs, lane markings, poles, buildings), normalised so overall
 * brightness and contrast do not matter, and compared with a correlation.
 * The repaired patch itself changes, so the score mostly reflects the
 * surroundings. It is an aid for lining up the shot and for the reviewer,
 * not a pass/fail criterion, and it runs on the device (not tamper-proof).
 */
export const SIG_W = 48;
export const SIG_H = 36;

export type Signature = Float32Array;

let scratch: HTMLCanvasElement | null = null;

/** Gradient-magnitude signature of an image, cropped to 4:3 like the camera preview. */
export function signatureOf(source: CanvasImageSource, srcW: number, srcH: number): Signature | null {
  if (!srcW || !srcH) return null;
  scratch ??= document.createElement('canvas');
  scratch.width = SIG_W;
  scratch.height = SIG_H;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // Centre-crop to 4:3 so a portrait video frame and a landscape photo compare like for like.
  const target = SIG_W / SIG_H;
  let sw = srcW;
  let sh = srcH;
  if (sw / sh > target) sw = sh * target;
  else sh = sw / target;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (srcW - sw) / 2, (srcH - sh) / 2, sw, sh, 0, 0, SIG_W, SIG_H);
  const { data } = ctx.getImageData(0, 0, SIG_W, SIG_H);
  const gray = new Float32Array(SIG_W * SIG_H);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return gradientSignature(gray, SIG_W, SIG_H);
}

/** Pure part (testable without a canvas): gradient magnitudes, zero-mean, unit-length. */
export function gradientSignature(gray: Float32Array, w: number, h: number): Signature {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = gray[y * w + Math.min(x + 1, w - 1)] - gray[y * w + Math.max(x - 1, 0)];
      const gy = gray[Math.min(y + 1, h - 1) * w + x] - gray[Math.max(y - 1, 0) * w + x];
      out[i] = Math.hypot(gx, gy);
    }
  }
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  let norm = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** 0–100. Identical view ≈ 100; unrelated scenes are usually below ~30. */
export function similarityScore(a: Signature | null, b: Signature | null): number | null {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  if (!Number.isFinite(dot)) return null;
  return Math.round(Math.max(0, Math.min(1, dot)) * 100);
}

export async function signatureOfUrl(url: string): Promise<Signature | null> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return signatureOf(img, img.naturalWidth, img.naturalHeight);
}

export async function signatureOfBlob(blob: Blob): Promise<Signature | null> {
  const bmp = await createImageBitmap(blob);
  try {
    return signatureOf(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}
