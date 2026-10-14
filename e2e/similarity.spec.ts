/**
 * Image-similarity calibration in a real browser (same canvas code as the app).
 *
 * Road photos in e2e/fixtures/roads/ (cut from the client's mockup): two pairs of
 * the same road before (pothole) and after repair, and a different road.
 * Each "same place" photo is re-shot in many ways (shift, zoom, tilt, another
 * day's light, shadows, cars, people, blur, noise) and compared with its Before
 * photo; other places are compared as negatives. Then the v5 match score is
 * computed for typical field situations.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIX = join(process.cwd(), 'e2e/fixtures/roads');
const FILES = ['cmp_before', 'cmp_after', 'before_cam', 'after_cam', 'before_review', 'login_road'];

test('image similarity separates same place from other places', async ({ page }) => {
  for (const f of FILES) {
    await page.route(`**/__fixtures/${f}.png`, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(FIX, `${f}.png`)) }));
  }
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/login');

  const result = await page.evaluate(async (files) => {
    const simPath = '/src/features/capture/imageSimilarity.ts';
    const verPath = '/shared/verification/index.ts';
    const sim = (await import(/* @vite-ignore */ simPath)) as typeof import('../src/features/capture/imageSimilarity');
    const ver = (await import(/* @vite-ignore */ verPath)) as typeof import('../shared/verification/index');
    const load = async (name: string) => {
      const img = new Image();
      img.src = `/__fixtures/${name}.png`;
      await img.decode();
      return img;
    };
    const imgs: Record<string, HTMLImageElement> = {};
    for (const f of files) imgs[f] = await load(f);

    // Render a "re-shot" version of an image at 640×480 with the given changes.
    type Opt = { dx?: number; dy?: number; zoom?: number; rot?: number; bright?: number; contrast?: number; tint?: string; shadow?: boolean; car?: boolean; person?: boolean; blur?: number; noise?: number; flip?: boolean; jpeg?: number };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const render = async (img: HTMLImageElement, o: Opt = {}) => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const g = c.getContext('2d')!;
      g.fillStyle = '#777';
      g.fillRect(0, 0, 640, 480);
      g.save();
      const filters = [];
      if (o.bright) filters.push(`brightness(${o.bright})`);
      if (o.contrast) filters.push(`contrast(${o.contrast})`);
      if (o.blur) filters.push(`blur(${o.blur}px)`);
      g.filter = filters.join(' ') || 'none';
      g.translate(320 + (o.dx ?? 0) * 640, 240 + (o.dy ?? 0) * 480);
      if (o.rot) g.rotate((o.rot * Math.PI) / 180);
      const z = o.zoom ?? 1;
      g.scale(o.flip ? -z : z, z);
      g.drawImage(img, -320, -240, 640, 480);
      g.restore();
      if (o.tint) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = o.tint;
        g.fillRect(0, 0, 640, 480);
        g.globalCompositeOperation = 'source-over';
      }
      if (o.shadow) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.moveTo(0, 60); g.lineTo(260, 0); g.lineTo(420, 0); g.lineTo(0, 300);
        g.fill();
      }
      if (o.car) {
        g.fillStyle = '#b22222';
        g.fillRect(380, 330, 220, 110);
        g.fillStyle = '#222';
        g.fillRect(400, 430, 50, 30); g.fillRect(540, 430, 50, 30);
      }
      if (o.person) {
        g.fillStyle = '#1e3a8a';
        g.fillRect(90, 120, 40, 140);
        g.beginPath(); g.arc(110, 105, 18, 0, 7); g.fill();
      }
      if (o.noise) {
        const d = g.getImageData(0, 0, 640, 480);
        for (let i = 0; i < d.data.length; i += 4) {
          const n = (rnd() - 0.5) * o.noise;
          d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
        }
        g.putImageData(d, 0, 0);
      }
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', o.jpeg ?? 0.85));
      return sim.signatureOfBlob(blob);
    };

    const rows: { group: string; name: string; score: number | null }[] = [];
    const add = async (group: string, name: string, ref: string, img: string, o: Opt = {}) => {
      rows.push({ group, name, score: sim.similarityScore(await render(imgs[ref]), await render(imgs[img], o)) });
    };

    const day2 = { bright: 0.8, contrast: 0.9, tint: '#ffd9a8' };
    // Same place, same road surface (re-shot moments later)
    for (const ref of ['cmp_before', 'before_cam', 'before_review']) {
      await add('same', `${ref}: ถ่ายซ้ำ (แทบไม่ขยับ)`, ref, ref, { noise: 6 });
      await add('same', `${ref}: เลื่อน 3%`, ref, ref, { dx: 0.03, noise: 6 });
      await add('same', `${ref}: เลื่อน 6%`, ref, ref, { dx: -0.06, dy: 0.02 });
      await add('same', `${ref}: ซูม 5% (ก้าวเข้าไป 1 ก้าว)`, ref, ref, { zoom: 1.05 });
      await add('same', `${ref}: ซูม 10%`, ref, ref, { zoom: 1.1 });
      await add('same', `${ref}: เอียง 3°`, ref, ref, { rot: 3 });
      await add('same', `${ref}: วันอื่น แสงเย็น`, ref, ref, day2);
      await add('same', `${ref}: แดดจ้า`, ref, ref, { bright: 1.3, contrast: 1.1 });
      await add('same', `${ref}: มีเงาต้นไม้`, ref, ref, { shadow: true });
      await add('same', `${ref}: มีรถบังด้านล่าง`, ref, ref, { car: true });
      await add('same', `${ref}: มีคนเดินผ่าน`, ref, ref, { person: true });
      await add('same', `${ref}: ภาพเบลอ`, ref, ref, { blur: 2 });
      await add('same', `${ref}: วันอื่น+เลื่อน+ซูม+รถ`, ref, ref, { ...day2, dx: 0.04, zoom: 1.04, car: true, noise: 8 });
    }
    // Same place, road repaired (the real case)
    await add('repaired', 'คู่ก่อน/หลังซ่อม (หน้าเทียบผล)', 'cmp_before', 'cmp_after');
    await add('repaired', 'คู่ก่อน/หลังซ่อม + วันอื่น + เลื่อน 4%', 'cmp_before', 'cmp_after', { ...day2, dx: 0.04 });
    await add('repaired', 'คู่ก่อน/หลังซ่อม + รถบัง', 'cmp_before', 'cmp_after', { car: true });
    // Different place / wrong direction
    await add('other', 'ถนนอื่น (หน้า login)', 'cmp_before', 'login_road');
    await add('other', 'ถนนอื่น vs ภาพกล้อง', 'before_cam', 'login_road');
    await add('other', 'ถนนอื่น 2', 'before_review', 'login_road');
    await add('other', 'คนละจุด (cmp vs ภาพกล้อง)', 'cmp_before', 'before_cam');
    await add('other', 'ฉากคล้ายกันแต่คนละที่ (ภาพ AI 2 ภาพ)', 'before_cam', 'after_cam');

    // Typical field situations → v5 score
    const scen = (name: string, imageSimilarity: number | null, distanceM: number, headingDiffDeg: number) => {
      const s = ver.computeMatchScore({ distanceM, headingDiffDeg, imageSimilarity }, ver.RULES_V5)!;
      const r = ver.RULES_V5.scoring!;
      return { name, imageSimilarity, distanceM, headingDiffDeg, total: s.total, verdict: s.total >= r.passScore ? 'PASS' : s.total >= r.reviewScore ? 'PASS (ให้ผู้ตรวจดู)' : 'ถ่ายใหม่' };
    };
    const byName = (n: string) => rows.find((x) => x.name === n)!.score;
    const scenarios = [
      scen('ยืนจุดเดิม GPS แกว่ง 8 ม. ทิศต่าง 4°', byName('cmp_before: ถ่ายซ้ำ (แทบไม่ขยับ)'), 8, 4),
      scen('ซ่อมเสร็จ วันอื่น GPS แกว่ง 12 ม. ทิศต่าง 6°', byName('คู่ก่อน/หลังซ่อม + วันอื่น + เลื่อน 4%'), 12, 6),
      scen('ซ่อมเสร็จ มีรถบัง GPS 15 ม. ทิศต่าง 8°', byName('คู่ก่อน/หลังซ่อม + รถบัง'), 15, 8),
      scen('ภาพตรงแต่ GPS เพี้ยนมาก 28 ม. ทิศ 9°', byName('cmp_before: วันอื่น+เลื่อน+ซูม+รถ'), 28, 9),
      scen('ถนนอื่นห่าง 20 ม. ทิศบังเอิญตรง', byName('ถนนอื่น (หน้า login)'), 20, 3),
      scen('ถนนอื่นแต่ GPS ใกล้ 4 ม. ทิศตรง 0°', byName('ถนนอื่น (หน้า login)'), 4, 0),
      scen('ภาพวัดไม่ได้ (null) GPS 3 ม. ทิศ 2°', null, 3, 2),
    ];
    return { rows, scenarios };
  }, FILES);

  const out = join(process.cwd(), 'test-results');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'similarity-report.json'), JSON.stringify(result, null, 2));
  console.log('\nกลุ่ม | กรณี | คะแนนภาพ');
  for (const r of result.rows) console.log(`${r.group} | ${r.name} | ${r.score}`);
  console.log('\nสถานการณ์ | ภาพ | ระยะ | ทิศ | คะแนนรวม | ผล');
  for (const s of result.scenarios) console.log(`${s.name} | ${s.imageSimilarity} | ${s.distanceM} | ${s.headingDiffDeg} | ${s.total} | ${s.verdict}`);

  const same = result.rows.filter((r) => r.group === 'same').map((r) => r.score!);
  const repaired = result.rows.filter((r) => r.group === 'repaired').map((r) => r.score!);
  const other = result.rows.filter((r) => r.group === 'other').map((r) => r.score!);
  expect(Math.min(...same)).toBeGreaterThan(Math.max(...other));
  expect(Math.min(...repaired)).toBeGreaterThan(Math.max(...other));
  const v = Object.fromEntries(result.scenarios.map((s) => [s.name, s.verdict]));
  expect(v['ยืนจุดเดิม GPS แกว่ง 8 ม. ทิศต่าง 4°']).toBe('PASS');
  expect(v['ซ่อมเสร็จ วันอื่น GPS แกว่ง 12 ม. ทิศต่าง 6°']).toBe('PASS');
  expect(v['ซ่อมเสร็จ มีรถบัง GPS 15 ม. ทิศต่าง 8°']).toBe('PASS');
  expect(v['ภาพตรงแต่ GPS เพี้ยนมาก 28 ม. ทิศ 9°']).not.toBe('ถ่ายใหม่');
  expect(v['ภาพวัดไม่ได้ (null) GPS 3 ม. ทิศ 2°']).toBe('ถ่ายใหม่');
  expect(v['ถนนอื่นห่าง 20 ม. ทิศบังเอิญตรง']).toBe('ถ่ายใหม่');
  expect(v['ถนนอื่นแต่ GPS ใกล้ 4 ม. ทิศตรง 0°']).toBe('ถ่ายใหม่');
});
