/**
 * Full browser workflow against the REAL generated Apps Script backend
 * (apps-script/dist/Code.gs) running in an in-memory Google Sheets/Drive fake.
 * Camera = Chromium fake device, GPS = emulated geolocation, compass =
 * synthetic deviceorientationabsolute events.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createBackend, type Backend } from '../tests/apps-script/fakeGas';
import { E2E_API_URL } from '../playwright.config';

const ORIGIN = { latitude: 13.764321, longitude: 100.538721 };
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;

function seed(b: Backend) {
  b.ctx.setup();
  const temp = b.ctx.createInitialAdmin('admin@example.com', 'Admin').temporary_password;
  const admin = b.call('login', { email: 'admin@example.com', password: temp }).data.token;
  b.call('changePassword', { current_password: temp, new_password: 'Adm1nPassword' }, admin);
  const accounts: Record<string, string> = {};
  for (const [email, name, role] of [['insp@example.com', 'สมชาย ใจดี', 'inspector'], ['rev@example.com', 'สมหญิง ตรวจงาน', 'reviewer']]) {
    const r = b.call('createUser', { email, full_name: name, role }, admin).data;
    const tok = b.call('login', { email, password: r.temporary_password }).data.token;
    b.call('changePassword', { current_password: r.temporary_password, new_password: 'Passw0rd1234' }, tok);
    accounts[role] = email;
  }
  return accounts;
}

async function wireBackend(page: Page, b: Backend, opts: { failNextSubmit?: { count: number } } = {}) {
  await page.route('https://tiles.e2e.invalid/**', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(E2E_API_URL, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const res = b.call(body.action, body.payload, body.token);
    if (body.action === 'submitCapture' && opts.failNextSubmit && opts.failNextSubmit.count > 0) {
      opts.failNextSubmit.count--;
      // The server DID process the request, but the response is lost (network drop).
      return route.abort('connectionreset');
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
}

/** Feed GPS fixes (1 Hz) and absolute-orientation events (10 Hz) like a real phone. */
async function startSensors(context: BrowserContext, page: Page, pos: () => { latitude: number; longitude: number; accuracy: number }, headingDeg: () => number) {
  const gps = setInterval(() => void context.setGeolocation(pos()).catch(() => undefined), 1000);
  await context.setGeolocation(pos());
  await page.exposeFunction('__heading', () => headingDeg());
  await page.addInitScript(() => {
    setInterval(async () => {
      const h = await (window as unknown as { __heading: () => Promise<number> }).__heading();
      // Upright phone: rear camera heading = (360 - alpha) mod 360.
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: (360 - h) % 360, beta: 90, gamma: 0, absolute: true }));
    }, 100);
  });
  return () => clearInterval(gps);
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'หน้าหลัก' })).toBeVisible();
}

test('inspector Before → repair → After (PASS) → reviewer approves', async ({ browser }) => {
  const b = createBackend();
  const accounts = seed(b);
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { ...ORIGIN, accuracy: 2.1 } });
  const page = await context.newPage();
  await wireBackend(page, b);
  let position = { ...ORIGIN, accuracy: 2.1 };
  let heading = 125;
  const stop = await startSensors(context, page, () => position, () => heading);

  await login(page, accounts.inspector, 'Passw0rd1234');
  await page.screenshot({ path: 'test-results/01-dashboard.png' });

  // Create job
  await page.getByRole('link', { name: /สร้างรายการใหม่/ }).first().click();
  await page.getByLabel(/ชื่อถนน/).fill('ถ.สุขุมวิท กม.12');
  await page.getByLabel('รายละเอียด', { exact: true }).fill('หลุมลึก ขนาดประมาณ 50 ซม.');
  await expect(page.getByText('13.764321, 100.538721')).toBeVisible();
  await page.screenshot({ path: 'test-results/02-create.png' });
  await page.getByRole('button', { name: 'ถัดไป: ถ่ายภาพก่อนซ่อม' }).click();

  // Before capture
  await page.getByRole('button', { name: 'อนุญาตกล้อง ตำแหน่ง และเข็มทิศ' }).click();
  await expect(page.getByText('GPS accuracy: 2.1 ม. — ใช้ได้', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('ทิศทาง: 125°', { exact: true })).toBeVisible();
  const shutter = page.getByRole('button', { name: 'ถ่ายภาพ' });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/03-before-camera.png' });
  await shutter.click();
  await expect(page.getByRole('heading', { name: 'ตรวจสอบภาพก่อนบันทึก' })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/04-before-review.png' });
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByText('บันทึกภาพก่อนซ่อมเรียบร้อย')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'กลับไปที่งาน' }).click();

  // Job detail -> mark repaired
  await expect(page.getByText('รอซ่อม', { exact: true })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /แจ้งว่าซ่อมเสร็จแล้ว/ }).click();
  await expect(page.getByText('รอถ่ายหลังซ่อม', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/05-job-detail.png', fullPage: true });

  // After capture: start too far away and rotated -> shutter must stay disabled
  position = { latitude: ORIGIN.latitude + 4.2 / M_PER_DEG, longitude: ORIGIN.longitude, accuracy: 2.4 };
  heading = 137;
  await page.getByRole('link', { name: /เริ่มถ่ายภาพหลังซ่อม/ }).click();
  await page.getByRole('button', { name: 'อนุญาตกล้อง ตำแหน่ง และเข็มทิศ' }).click();
  await expect(page.getByText('คุณอยู่ห่างจากจุดเดิม 4.2 ม. ขยับเข้าไปใกล้อีก', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^ทิศทางต่างกัน 12° หมุนอุปกรณ์/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ถ่ายภาพ' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/06-after-blocked.png' });

  // Move into tolerance
  position = { latitude: ORIGIN.latitude + 1.8 / M_PER_DEG, longitude: ORIGIN.longitude, accuracy: 2.4 };
  heading = 128;
  await expect(page.getByText('ระยะจากจุดเดิม: 1.8 ม. — อยู่ในเกณฑ์', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('ทิศทาง: 128° ต่างจากเดิม 3° — อยู่ในเกณฑ์', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ถ่ายภาพ' })).toBeEnabled({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/07-after-ready.png' });
  await page.getByRole('button', { name: 'ถ่ายภาพ' }).click();
  await expect(page.getByText('รอผลตรวจสอบจากเซิร์ฟเวอร์')).toBeVisible({ timeout: 15_000 });
  // No PASS before the server answers.
  await expect(page.getByText('ผ่านเกณฑ์')).toHaveCount(0);
  await page.getByRole('button', { name: 'ยืนยันและบันทึกภาพหลังซ่อม' }).click();
  await expect(page.getByText('บันทึกหลักฐานแล้ว ผลการตรวจสอบ: ผ่านเกณฑ์')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/08-after-result.png', fullPage: true });
  stop();

  const jobs = b.sheet('repair_jobs').rows();
  expect(jobs).toHaveLength(1);
  expect(jobs[0].status).toBe('PENDING_REVIEW');
  expect(b.sheet('verification_results').rows()[0].overall_status).toBe('PASS');

  // Reviewer approves with a reason
  const rctx = await browser.newContext();
  const rpage = await rctx.newPage();
  await wireBackend(rpage, b);
  await login(rpage, accounts.reviewer, 'Passw0rd1234');
  await rpage.getByText(jobs[0].job_code).click();
  await rpage.getByPlaceholder('เหตุผล (จำเป็น)').fill('ผิวถนนเรียบร้อย ไม่มีรอยแตก');
  await rpage.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(rpage.getByText('อนุมัติแล้ว').first()).toBeVisible();
  await rpage.getByRole('link', { name: /ดูผลเปรียบเทียบ/ }).click();
  await expect(rpage.getByText(/ยังไม่มีการเปรียบเทียบภาพด้วย AI/)).toBeVisible();
  await rpage.screenshot({ path: 'test-results/09-compare.png', fullPage: true });
  expect(b.sheet('repair_jobs').rows()[0].status).toBe('APPROVED');
});

test('lost response during upload → no false PASS; retry does not duplicate', async ({ browser }) => {
  const b = createBackend();
  const accounts = seed(b);
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { ...ORIGIN, accuracy: 2 } });
  const page = await context.newPage();
  const fail = { count: 0 };
  await wireBackend(page, b, { failNextSubmit: fail });
  const stop = await startSensors(context, page, () => ({ ...ORIGIN, accuracy: 2 }), () => 90);

  await login(page, accounts.inspector, 'Passw0rd1234');
  await page.getByRole('link', { name: /สร้างรายการใหม่/ }).first().click();
  await page.getByLabel(/ชื่อถนน/).fill('ถ.ลาดกระบัง');
  await page.getByRole('button', { name: 'ถัดไป: ถ่ายภาพก่อนซ่อม' }).click();
  await page.getByRole('button', { name: 'อนุญาตกล้อง ตำแหน่ง และเข็มทิศ' }).click();
  await expect(page.getByRole('button', { name: 'ถ่ายภาพ' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'ถ่ายภาพ' }).click();
  fail.count = 1;
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByText(/ไม่แน่ใจว่าเซิร์ฟเวอร์ได้รับแล้วหรือไม่/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('บันทึกภาพก่อนซ่อมเรียบร้อย')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/10-upload-unknown.png' });
  await page.getByRole('button', { name: 'ลองใหม่' }).click();
  await expect(page.getByText('บันทึกภาพก่อนซ่อมเรียบร้อย')).toBeVisible({ timeout: 15_000 });
  stop();
  expect(b.sheet('repair_photos').rows()).toHaveLength(1);
  expect(b.drive.activeFiles()).toHaveLength(1);
});

test('unsupported heading sensor blocks capture', async ({ browser }) => {
  const b = createBackend();
  const accounts = seed(b);
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { ...ORIGIN, accuracy: 2 } });
  const page = await context.newPage();
  await wireBackend(page, b);
  await login(page, accounts.inspector, 'Passw0rd1234');
  await page.getByRole('link', { name: /สร้างรายการใหม่/ }).first().click();
  await page.getByLabel(/ชื่อถนน/).fill('ถ.บางนา');
  await page.getByRole('button', { name: 'ถัดไป: ถ่ายภาพก่อนซ่อม' }).click();
  await page.getByRole('button', { name: 'อนุญาตกล้อง ตำแหน่ง และเข็มทิศ' }).click();
  await expect(page.getByText('ไม่มีเซ็นเซอร์ทิศทาง ไม่สามารถดำเนินการตรวจสอบได้').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'ถ่ายภาพ' })).toBeDisabled();
});
