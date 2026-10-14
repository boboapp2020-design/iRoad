/**
 * "Same view?" score between the Before photo and the After view (0–100).
 *
 * Built for road repairs that finish days later:
 *  - Only the UPPER part of the frame is compared (kerbs, poles, buildings,
 *    trees, skyline). The bottom of the frame — the repaired road surface,
 *    passing cars and the date/name stamp — is ignored.
 *  - It compares edges (brightness gradients), not colours, and normalises
 *    them, so sun, cloud and time of day matter little.
 *  - It searches small shifts and a small zoom, so the framing does not have
 *    to match to the pixel.
 *
 * It is an aid (one part of the v5 match score), runs on the device, and is
 * recomputed from the stored photos when the reviewer opens the job.
 */
export const GRID_W = 64;
export const GRID_H = 48;
/**
 * Share of the frame height (from the top) that is compared. 0.4 was chosen
 * from e2e/similarity.spec.ts: lower values lose the scene, higher values let
 * the repaired patch drag the score down.
 */
export const TOP_FRACTION = 0.4;
const MAX_DX = 4; // ≈ ±6% of the width
const MAX_DY = 3; // ≈ ±6% of the height
/** Extra zoom levels tried in addition to 1.0 (crop factor). */
const ZOOMS = [1, 1.08];

export interface Signature {
  /** One gradient field per zoom level, each GRID_W × GRID_H. */
  levels: Float32Array[];
}

let scratch: HTMLCanvasElement | null = null;

/** Signature of any drawable image (photo, video frame, bitmap). */
export function signatureOf(source: CanvasImageSource, srcW: number, srcH: number): Signature | null {
  if (!srcW || !srcH) return null;
  scratch ??= document.createElement('canvas');
  scratch.width = GRID_W;
  scratch.height = GRID_H;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const levels: Float32Array[] = [];
  for (const zoom of ZOOMS) {
    // Centre-crop to 4:3 (portrait video and landscape photos compare like for like), then zoom in.
    const target = GRID_W / GRID_H;
    let sw = srcW;
    let sh = srcH;
    if (sw / sh > target) sw = sh * target;
    else sh = sw / target;
    sw /= zoom;
    sh /= zoom;
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    ctx.drawImage(source, (srcW - sw) / 2, (srcH - sh) / 2, sw, sh, 0, 0, GRID_W, GRID_H);
    const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H);
    const gray = new Float32Array(GRID_W * GRID_H);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    levels.push(gradientField(gray, GRID_W, GRID_H));
  }
  return { levels };
}

/** Blur lightly, then Sobel gradient magnitude (square-root compressed so a few strong edges do not dominate). */
export function gradientField(gray: Float32Array, w: number, h: number): Float32Array {
  const at = (a: Float32Array, x: number, y: number) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const blur = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += at(gray, x + i, y + j);
      blur[y * w + x] = s / 9;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(blur, x + 1, y - 1) + 2 * at(blur, x + 1, y) + at(blur, x + 1, y + 1) - at(blur, x - 1, y - 1) - 2 * at(blur, x - 1, y) - at(blur, x - 1, y + 1);
      const gy = at(blur, x - 1, y + 1) + 2 * at(blur, x, y + 1) + at(blur, x + 1, y + 1) - at(blur, x - 1, y - 1) - 2 * at(blur, x, y - 1) - at(blur, x + 1, y - 1);
      out[y * w + x] = Math.sqrt(Math.hypot(gx, gy));
    }
  }
  return out;
}

/**
 * Best normalised correlation of the upper region of two gradient fields over
 * small shifts. Returns −1…1.
 */
export function compareFields(a: Float32Array, b: Float32Array, w = GRID_W, h = GRID_H): number {
  const rows = Math.round(h * TOP_FRACTION);
  let best = -1;
  for (let dy = -MAX_DY; dy <= MAX_DY; dy++) {
    for (let dx = -MAX_DX; dx <= MAX_DX; dx++) {
      // Overlap of a(x, y) with b(x + dx, y + dy), both inside the compared top region (1-cell border skipped).
      const x0 = Math.max(1, 1 - dx);
      const x1 = Math.min(w - 1, w - 1 - dx);
      const y0 = Math.max(1, 1 - dy);
      const y1 = Math.min(rows, rows - dy);
      if (x1 - x0 < w / 2 || y1 - y0 < rows / 2) continue;
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const va = a[y * w + x];
          const vb = b[(y + dy) * w + (x + dx)];
          n++;
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const cov = sab - (sa * sb) / n;
      const va = saa - (sa * sa) / n;
      const vb = sbb - (sb * sb) / n;
      if (va <= 1e-9 || vb <= 1e-9) continue;
      const r = cov / Math.sqrt(va * vb);
      if (r > best) best = r;
    }
  }
  return best;
}

/** 0–100. The same view scores high; a different place usually scores low. */
export function similarityScore(a: Signature | null, b: Signature | null): number | null {
  if (!a || !b || !a.levels.length || !b.levels.length) return null;
  let best = -1;
  // Same zoom, and one side zoomed in relative to the other (walked a step closer / further).
  best = Math.max(best, compareFields(a.levels[0], b.levels[0]));
  for (let i = 1; i < a.levels.length; i++) best = Math.max(best, compareFields(a.levels[i], b.levels[0]));
  for (let i = 1; i < b.levels.length; i++) best = Math.max(best, compareFields(a.levels[0], b.levels[i]));
  if (!Number.isFinite(best)) return null;
  return Math.round(Math.max(0, Math.min(1, best)) * 100);
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
