# Road Repair Tracker (iRoad)

PWA สำหรับบันทึกและตรวจสอบการซ่อมถนนด้วย **ภาพก่อนซ่อม/หลังซ่อม (Before/After) ที่ถ่ายจากกล้องในแอปเท่านั้น**
ระบบจะยอมให้ถ่ายภาพหลังซ่อมเมื่อผ่านเกณฑ์ทั้งหมดนี้
- ความแม่นยำ GPS ≤ 3 ม.
- อยู่ห่างจากจุดถ่ายภาพก่อนซ่อมไม่เกิน 3 ม.
- ทิศทางกล้องต่างจากภาพก่อนซ่อมไม่เกิน 10°

ผลตรวจที่เป็นทางการคำนวณที่เซิร์ฟเวอร์ ผลมี 3 แบบคือ **PASS / FAIL / INSUFFICIENT_DATA** และหน้าจอจะแสดง **PENDING** ระหว่างที่ยังไม่มีผลจากเซิร์ฟเวอร์

> **Backend เวอร์ชันนี้ใช้ Google Sheets + Google Apps Script** (ชีต "Iroad") และเก็บรูปต้นฉบับในโฟลเดอร์ Google Drive ส่วนตัว
> วางแผนย้ายไป Supabase ในเฟสถัดไป โดยออกแบบให้ย้ายได้โดยไม่ต้องแก้หน้าจอ (ดู [docs/LIMITATIONS.md](docs/LIMITATIONS.md#migrating-to-supabase-planned))

## ฟีเจอร์

- เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน, รีเซ็ตรหัสผ่านด้วยรหัสทางอีเมล, บังคับเปลี่ยนรหัสผ่านชั่วคราว, ล็อกบัญชีเมื่อใส่รหัสผิดหลายครั้ง
- บทบาท **ผู้ดูแลระบบ / ผู้ตรวจสอบภาคสนาม / ผู้ตรวจรับงาน** ตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุกคำขอ
- หน้าหลัก: ตัวเลขสรุปตามสถานะ ค้นหา/กรองตามสถานะ วันที่ สถานที่ รหัสงาน และมุมมองแผนที่
- สร้างงานพร้อมรหัสอัตโนมัติ `RR-2026-000001`
- **ถ่ายภาพก่อนซ่อม/หลังซ่อม**
  - กล้องหลังแบบสด แสดงค่า GPS และ accuracy แบบเรียลไทม์
  - เข็มทิศบนจอ พร้อมคำแนะนำเมื่อยังไม่ผ่านเกณฑ์
  - ตรวจค่าซ้ำทันทีก่อนกดและหลังถ่าย
  - ให้ตรวจภาพก่อนบันทึก
  - คำนวณ SHA-256 ทั้งฝั่งเครื่องและเซิร์ฟเวอร์
- นำทางไปยังจุดเดิม: แผนที่ ระยะห่าง และลิงก์เปิด Google Maps
- เปรียบเทียบภาพก่อน/หลังแบบเคียงข้างกัน พร้อมพิกัด ระยะ ความต่างทิศทาง และเหตุผลที่ไม่ผ่าน
- ผู้ตรวจรับงานอนุมัติ / ไม่อนุมัติ / ขอให้ถ่ายใหม่ โดยต้องระบุเหตุผล และอนุมัติไม่ได้ถ้าผลตรวจไม่ใช่ PASS
- ถ่ายใหม่ได้โดยเก็บประวัติเดิมไว้ครบ และแก้ไขหลักฐานได้เฉพาะผ่านขั้นตอน "ยกเลิกหลักฐาน" พร้อมเหตุผล
- Audit log แบบ hash chain และ record hash ตรวจจับการแก้ข้อมูลในชีตโดยตรงได้
- รายงาน CSV และหน้าพิมพ์/บันทึกเป็น PDF
- หน้าจอภาษาไทย/อังกฤษ (เพิ่มภาษาลาวได้ภายหลัง), PWA ติดตั้งได้ และไม่ cache ข้อมูลหรือรูปหลักฐาน

## โครงสร้างโปรเจกต์

```
shared/verification/   โมดูลตรวจสอบ (TypeScript) ที่ใช้ร่วมกันทั้งเบราว์เซอร์และเซิร์ฟเวอร์
apps-script/src/       ซอร์ส backend (Apps Script)
apps-script/dist/      Code.gs + appsscript.json ที่ build แล้ว (สำหรับวางลง Apps Script)
src/                   แอป React (pages, features/capture, lib/api, lib/i18n, components)
tests/unit/            unit tests (ระยะทาง, ทิศทาง, การตรวจสอบ, ด่านตรวจก่อนถ่าย, submitter, API client, CSV)
tests/apps-script/     ทดสอบ backend จริงใน fake Apps Script runtime (Sheets/Drive ในหน่วยความจำ)
e2e/                   Playwright: workflow ในเบราว์เซอร์จริงที่เชื่อมกับ Code.gs ตัวจริง
docs/                  เอกสารติดตั้ง สถาปัตยกรรม เกณฑ์ การทดสอบบนอุปกรณ์ deployment และข้อจำกัด
```

## เริ่มต้นใช้งาน

```bash
npm install
npm run build:gas            # สร้าง apps-script/dist/Code.gs
# ติดตั้ง backend ตาม docs/SETUP_APPS_SCRIPT.md แล้วใส่ Web app URL
cp .env.example .env.local   # ตั้ง VITE_APPS_SCRIPT_URL
npm run dev                  # http://localhost:5173 (กล้อง/GPS ทำงานบน localhost หรือ HTTPS เท่านั้น)
```

| คำสั่ง | หน้าที่ |
|---|---|
| `npm test` | build Code.gs แล้วรัน unit + backend tests (Vitest) |
| `npm run test:e2e` | Playwright E2E (ใช้ Chromium, ตั้ง `CHROMIUM_PATH` ได้) |
| `npm run typecheck` | ตรวจ TypeScript |
| `npm run build` | build PWA ไปที่ `dist/` |
| `npm run icons` | สร้างไอคอน PNG จาก `public/favicon.svg` |

## เอกสาร

- [ติดตั้ง backend บน Google Sheets / Apps Script](docs/SETUP_APPS_SCRIPT.md)
- [สถาปัตยกรรม ตาราง สถานะงาน และโมเดลความปลอดภัย](docs/ARCHITECTURE.md)
- [เกณฑ์การตรวจสอบ GPS/ทิศทาง](docs/VERIFICATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Checklist ทดสอบบน Android Chrome / iOS Safari](docs/DEVICE_TESTING.md)
- [ข้อจำกัดและแผนพัฒนาต่อ](docs/LIMITATIONS.md)

## สถานะการทดสอบ

- ✅ Unit tests และ backend tests ผ่าน (`npm test`)
- ✅ E2E ใน headless Chromium ผ่าน โดยใช้กล้องจำลอง GPS จำลอง และ event เข็มทิศจำลอง ร่วมกับ Code.gs ตัวจริงบน Sheets/Drive จำลอง
- ❌ **ยังไม่ได้ deploy ลง Apps Script จริง และยังไม่ได้ทดสอบบนโทรศัพท์จริง** ให้ทำตาม [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md)

## ข้อจำกัดสำคัญ (สรุป)

- พิกัด ทิศทาง และเวลามาจากอุปกรณ์ จึง**พิสูจน์ไม่ได้ 100%** ว่าไม่ถูกปลอมแปลง
- ค่า accuracy เป็นค่าประมาณ ไม่ใช่การรับประกัน
- ทิศทางเป็นค่าประมาณของแกนกล้องหลัง และได้รับผลกระทบจากสนามแม่เหล็ก
- Google Sheets ไม่มี transaction และไม่มี RLS ระบบใช้การตรวจสิทธิ์ในโค้ด, script lock และ hash เพื่อ*ตรวจจับ* (ไม่ใช่ป้องกัน) การแก้ข้อมูลโดยเจ้าของชีต
- รายละเอียดทั้งหมดอยู่ใน [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
