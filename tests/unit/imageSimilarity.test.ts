import { describe, expect, it } from 'vitest';
import { gradientSignature, similarityScore } from '@/features/capture/imageSimilarity';

const W = 48;
const H = 36;
function scene(seed: number, shiftX = 0, brightness = 0) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x + shiftX;
      g[y * W + x] = brightness + 128 + 60 * Math.sin((sx * (3 + seed)) / 7) * Math.cos((y * (2 + seed)) / 5) + (sx > 20 + seed * 3 ? 40 : 0);
    }
  }
  return g;
}

describe('image similarity', () => {
  it('scores an identical view ~100 regardless of brightness', () => {
    const a = gradientSignature(scene(1), W, H);
    expect(similarityScore(a, gradientSignature(scene(1), W, H))).toBe(100);
    expect(similarityScore(a, gradientSignature(scene(1, 0, 40), W, H))).toBeGreaterThanOrEqual(99);
  });
  it('scores a slightly shifted view higher than a different scene', () => {
    const a = gradientSignature(scene(1), W, H);
    const shifted = similarityScore(a, gradientSignature(scene(1, 1), W, H))!;
    const other = similarityScore(a, gradientSignature(scene(4), W, H))!;
    expect(shifted).toBeGreaterThan(other);
  });
  it('returns null when a signature is missing', () => {
    expect(similarityScore(null, gradientSignature(scene(1), W, H))).toBeNull();
  });
});
