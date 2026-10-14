/**
 * Burns who / when / where into the bottom of the photo before it is hashed,
 * so the information travels with the image itself (prints, shared files).
 * The stamp sits in the bottom band, which the image-similarity check ignores.
 */
export async function stampPhoto(blob: Blob, lines: string[], quality = 0.92): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('STAMP_FAILED');
    g.drawImage(bmp, 0, 0);
    const size = Math.max(14, Math.round(Math.min(canvas.width, canvas.height * 1.33) / 30));
    const pad = Math.round(size * 0.6);
    const lineH = Math.round(size * 1.35);
    const bandH = pad * 2 + lineH * lines.length;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, canvas.height - bandH, canvas.width, bandH);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'top';
    g.font = `600 ${size}px "IBM Plex Sans Thai", "Noto Sans Thai", sans-serif`;
    lines.forEach((line, i) => g.fillText(line, pad, canvas.height - bandH + pad + i * lineH, canvas.width - pad * 2));
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!out) throw new Error('STAMP_FAILED');
    return { blob: out, width: canvas.width, height: canvas.height };
  } finally {
    bmp.close();
  }
}
