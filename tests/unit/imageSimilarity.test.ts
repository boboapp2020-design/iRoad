import { describe, expect, it } from 'vitest';
import { compareFields, gradientField, GRID_H, GRID_W } from '@/features/capture/imageSimilarity';

const W = GRID_W;
const H = GRID_H;
function scene(seed: number, opts: { shiftX?: number; brightness?: number; bottom?: number } = {}) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x + (opts.shiftX ?? 0);
      let v = 128 + 50 * Math.sin((sx * (3 + seed)) / 7) * Math.cos((y * (2 + seed)) / 5) + (sx > 20 + seed * 5 ? 40 : 0) + (opts.brightness ?? 0);
      if (opts.bottom !== undefined && y > H * 0.65) v = opts.bottom + 30 * Math.sin(x * y);
      g[y * W + x] = v;
    }
  }
  return gradientField(g, W, H);
}

describe('image similarity (upper region, gradients, shift search)', () => {
  it('identical view ≈ 1, brightness change still ≈ 1', () => {
    expect(compareFields(scene(1), scene(1))).toBeCloseTo(1, 5);
    expect(compareFields(scene(1), scene(1, { brightness: 40 }))).toBeGreaterThan(0.99);
  });
  it('ignores the bottom of the frame (the repaired road)', () => {
    expect(compareFields(scene(1), scene(1, { bottom: 20 }))).toBeGreaterThan(0.99);
  });
  it('tolerates a small shift', () => {
    expect(compareFields(scene(1), scene(1, { shiftX: 3 }))).toBeGreaterThan(0.95);
  });
  it('a different scene scores clearly lower', () => {
    expect(compareFields(scene(1), scene(4))).toBeLessThan(0.6);
  });
});
