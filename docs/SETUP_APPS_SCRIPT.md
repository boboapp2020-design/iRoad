# ติดตั้ง Backend บน Google Sheets + Apps Script

Backend ทำงานเป็น **Google Apps Script ที่ผูกกับชีต (container-bound)** บนไฟล์ Google Sheet ชื่อ "Iroad"
ข้อมูลทั้งหมดเก็บในแท็บของชีตนี้ ส่วนรูปต้นฉบับเก็บในโฟลเดอร์ Google Drive แบบส่วนตัว

> ทำทุกขั้นตอนด้วย **บัญชี Google ที่เป็นเจ้าของชีต** เพราะ web app จะรันด้วยบัญชีนี้
> และ**ห้ามแชร์ชีตหรือโฟลเดอร์หลักฐานให้คนอื่นแก้ไขได้** ผู้ใช้ทุกคนต้องเข้าผ่านแอปเท่านั้น

## 1. สร้างไฟล์ Code.gs

```bash
npm install
npm run build:gas      # สร้าง apps-script/dist/Code.gs และ apps-script/dist/appsscript.json
```

`Code.gs` คือไฟล์ที่รวมโมดูลตรวจสอบ (`shared/verification`) กับซอร์สใน `apps-script/src/` เข้าเป็นไฟล์เดียว
ห้ามแก้ไฟล์นี้ด้วยมือ ถ้าต้องการแก้ให้แก้ที่ซอร์สแล้ว build ใหม่

## 2. วางโค้ดลงในชีต

1. เปิดชีต Iroad → เมนู **ส่วนขยาย (Extensions) → Apps Script**
2. ลบโค้ดเดิมในไฟล์ `Code.gs` แล้ววางเนื้อหาทั้งหมดจาก `apps-script/dist/Code.gs`
3. ไปที่ **การตั้งค่าโปรเจกต์ (Project Settings)** → ติ๊ก **"Show 'appsscript.json' manifest file in editor"**
4. เปิดไฟล์ `appsscript.json` ในหน้า editor แล้ววางเนื้อหาจาก `apps-script/dist/appsscript.json`
5. กดบันทึก

(ทางเลือก: ใช้ [clasp](https://github.com/google/clasp) ทำ `clasp push` จากโฟลเดอร์ `apps-script/dist/` แทนการคัดลอกด้วยมือ)

## 3. รัน setup ครั้งแรก

1. ใน editor เลือกฟังก์ชัน `setup` แล้วกด **Run**
2. Google จะขออนุญาต โดยขอสิทธิ์เฉพาะชีตนี้ (`spreadsheets.currentonly`), Drive, ส่งอีเมล และเมนูในชีต ให้กดอนุญาต
3. setup จะทำสิ่งต่อไปนี้
   - สร้างแท็บ `users`, `sessions`, `password_resets`, `repair_jobs`, `repair_photos`, `verification_results`,
     `repair_reviews`, `evidence_corrections`, `audit_logs`, `settings`, `counters` พร้อมหัวคอลัมน์
   - ตั้งรูปแบบเซลล์ทั้งหมดเป็นข้อความ (`@`) เพื่อไม่ให้ชีตแปลงวันที่หรือตัวเลขเอง
   - ล็อก (protect) ทุกแท็บให้แก้ไขได้เฉพาะเจ้าของ
   - ลบแท็บว่าง "ชีต1"
   - สร้างโฟลเดอร์ Drive ส่วนตัวชื่อ `Road Repair Evidence (private) - Iroad` และจำ ID ไว้ใน Script Properties
   - รันซ้ำได้อย่างปลอดภัย และจะไม่เขียนทับแท็บที่มีข้อมูลซึ่งหัวคอลัมน์ไม่ตรงกับที่คาดไว้

## 4. สร้างผู้ดูแลระบบคนแรก

ใช้วิธีใดวิธีหนึ่ง

- รีเฟรชหน้าชีต แล้วใช้เมนู **Road Repair → 2) สร้างผู้ดูแลระบบ** ระบบจะถามอีเมลและชื่อ แล้วแสดง **รหัสผ่านชั่วคราว** ให้ครั้งเดียว
- หรือรันใน editor: `createInitialAdmin('you@example.com', 'ชื่อ นามสกุล')` แล้วดูรหัสผ่านใน Execution log

ผู้ใช้ต้องเปลี่ยนรหัสผ่านชั่วคราวตอนเข้าสู่ระบบครั้งแรก ผู้ใช้อื่นทั้งหมดให้ผู้ดูแลเพิ่มจากหน้า **ผู้ดูแล** ในแอป
ระบบไม่มีการสมัครสมาชิกเอง

## 5. Deploy เป็น Web app

1. **Deploy → New deployment → Select type: Web app**
2. ตั้งค่า **Execute as: Me** (เจ้าของชีต) และ **Who has access: Anyone**
   - ต้องตั้งเป็น "Anyone" เพราะผู้ใช้เข้าสู่ระบบด้วยบัญชีของแอป ไม่ใช่บัญชี Google
   - การยืนยันตัวตนและสิทธิ์ทั้งหมดตรวจในโค้ด (`authenticate`, `requireRole`, `canViewJob` ฯลฯ)
3. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`) ไปใส่ในไฟล์ `.env.local`

   ```
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
   ```

4. ตรวจว่า backend ทำงาน โดยเปิด URL นั้นในเบราว์เซอร์ ควรเห็น `{"ok":true,"data":{"app":"road-repair-tracker",...}}`

**ทุกครั้งที่แก้โค้ด** ต้อง build → วาง Code.gs ใหม่ → **Deploy → Manage deployments → Edit → Version: New version**
ถ้าไม่ทำขั้นนี้ web app จะยังรันโค้ดเวอร์ชันเดิม

## 6. การตั้งค่าเพิ่มเติม

| รายการ | ที่ตั้งค่า |
|---|---|
| อนุญาตให้อนุมัติงานของตัวเอง (ค่าเริ่มต้น: ปิด) | แอป → ผู้ดูแล → การตั้งค่า |
| อายุ session (1–72 ชม., ค่าเริ่มต้น 12) | แอป → ผู้ดูแล → การตั้งค่า |
| เกณฑ์ GPS/ระยะ/ทิศทาง | **แก้ไม่ได้ขณะใช้งาน** ต้องสร้าง rules version ใหม่ใน `shared/verification/rules.ts` แล้ว deploy ใหม่ |
| จำนวนรอบ PBKDF2 | `LIMITS.pbkdf2Iterations` ใน `apps-script/src/00_Config.js` (ค่าที่เก็บต่อผู้ใช้ทำให้เปลี่ยนค่าได้โดยไม่กระทบรหัสเดิม) |

## 7. ตรวจสอบความถูกต้องของข้อมูล

- เมนู **Road Repair → ตรวจสอบ audit log chain** หรือแอป → ผู้ดูแล → "ตรวจสอบความต่อเนื่องของ audit log"
- หน้ารายละเอียดงาน (ผู้ดูแล) → "ตรวจความถูกต้องของไฟล์" ระบบจะคำนวณ SHA-256 ของไฟล์ใน Drive ใหม่ แล้วเทียบกับค่าที่บันทึกไว้ และตรวจ record hash ของแถวหลักฐาน
- ถ้าแก้แถวหลักฐานในชีตตรงๆ ระบบจะแจ้ง "ข้อมูลหลักฐานถูกแก้ไขนอกแอป" และไม่ยอมให้อนุมัติงานนั้น
