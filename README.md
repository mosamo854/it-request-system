# IT Request Center — React + Supabase

ระบบรับแจ้งปัญหา IT สำหรับหลายแผนก พัฒนาด้วย React, TypeScript, Vite และ Supabase

หน้าเว็บใช้ฟอนต์ `Noto Sans Thai` จาก Google Fonts พร้อม fallback เป็น `Leelawadee UI`, Tahoma และ Arial เพื่อให้ภาษาไทยอ่านง่ายและแสดงผลได้ต่อเนื่องหากโหลดฟอนต์ออนไลน์ไม่ได้

## ฟีเจอร์

- Login ด้วย Supabase Auth (Email/Password)
- แยกสิทธิ์ `admin` (ฝ่าย IT) และ `user` (พนักงานแต่ละแผนก)
- Admin สร้างและแก้ไขบัญชี User จากหน้าเว็บผ่าน Supabase Edge Function
- Admin แก้ชื่อ อีเมล เบอร์โทร แผนก และตั้งรหัสผ่านใหม่ให้ User ได้
- Admin เพิ่มแผนกใหม่ได้จากหน้าจัดการผู้ใช้
- การสร้าง User ต้องระบุเบอร์โทร โดยระบบเก็บเป็นรูปแบบ `+66...`
- User ไม่มีหน้า Register และสมัครบัญชีเองไม่ได้
- Admin เห็นทุกคำขอ เปลี่ยนสถานะ ตอบแชต เก็บสำรอง ลบถาวร และดูสถิติได้
- User เห็นเฉพาะคำขอของตัวเอง ส่งคำขอ แชต และดูสถานะได้ แต่เปลี่ยนสถานะไม่ได้
- ห้องแชตแยกตามคำขอ พร้อมรับข้อความใหม่แบบ Realtime
- แนบรูปภาพได้ทั้งตอนส่งคำขอและในห้องแชต (สูงสุด 5 MB ต่อรูป)
- ลบได้เฉพาะคำขอที่เสร็จสิ้น โดยใช้ Soft Delete และเก็บไว้ในคลังสำรอง
- เปิดดูแชต กู้คืน หรือลบคำขอจากคลังสำรองถาวรได้
- ระบบเก็บ Backup ไว้ 7 วัน แล้วลบคำขอ แชต และรูปภาพถาวรอัตโนมัติ
- หน้าสถิติรายวัน 7 วัน, รายเดือน 12 เดือน และรายปี 5 ปี พร้อมกราฟแนวโน้ม
- ส่งคำขอใหม่ไปยังฝ่าย IT
- แสดงคำขอทั้งหมดและสรุปจำนวนตามสถานะ
- ค้นหาด้วยเลขคำขอ หัวข้อ ชื่อผู้แจ้ง หรือแผนก
- กรองตามแผนกและสถานะ
- เปลี่ยนสถานะเป็น รอรับเรื่อง / กำลังดำเนินการ / เสร็จสิ้น
- เก็บข้อมูลจริงใน Supabase PostgreSQL
- Responsive รองรับคอมพิวเตอร์ แท็บเล็ต และมือถือ

## 1. สร้างตารางใน Supabase

1. สร้างโปรเจกต์ที่ [Supabase](https://supabase.com/)
2. เปิด **SQL Editor**
3. คัดลอกโค้ดทั้งหมดจาก `supabase/schema.sql`
4. กด **Run**

ไฟล์ SQL จะสร้างตาราง `departments`, `profiles`, `it_requests`, ตารางแชต `it_request_messages`, role, requester ownership, เบอร์โทร, คลังสำรอง, Storage bucket ส่วนตัว, trigger, Realtime และ RLS policies ที่แยกสิทธิ์ Admin/User

หากเคย Run `schema.sql` รุ่นก่อนแล้ว ให้ Run รุ่นล่าสุดทั้งไฟล์อีกครั้ง สคริปต์จะย้ายรายชื่อแผนกเดิมเข้าสู่ตาราง `departments`, เพิ่มคอลัมน์ `phone`, สร้าง Profile ให้บัญชี Auth เดิมเป็น role `user` และเชื่อมคำขอเดิมกับบัญชีที่อีเมลตรงกัน โดยไม่ลบคำขอ ข้อความ หรือรูปภาพเดิม

เบอร์โทรของบัญชีเดิมจะเป็นค่าว่างได้ แต่การสร้าง User ใหม่จากหน้า Admin จะบังคับกรอกเบอร์ไทย เช่น `0812345678` หรือ `+66812345678` และบันทึกเป็นรูปแบบ `+66...`

รูปภาพรองรับไฟล์ JPG, PNG, WEBP และ GIF ขนาดไม่เกิน 5 MB ไฟล์จะอยู่ใน bucket แบบ private และหน้าเว็บจะสร้างลิงก์ชั่วคราวให้เฉพาะผู้ที่ Login แล้ว

### ถ้าเคยพบ error `it_requests_requester_email_check`

สคริปต์รุ่นก่อนมีปัญหาการ escape Regular Expression ของอีเมล หากตารางถูกสร้างไปแล้ว ให้เลือกวิธีใดวิธีหนึ่ง:

1. Run `supabase/fix_email_constraint.sql` แล้ว Run `supabase/schema.sql` อีกครั้ง หรือ
2. Run `supabase/schema.sql` รุ่นล่าสุดทั้งไฟล์ เพราะสคริปต์สามารถซ่อม constraint เดิมให้อัตโนมัติ

## 2. ตั้งค่า Admin ฝ่าย IT คนแรก

1. เปิด Supabase Dashboard > **Authentication > Providers** และตรวจสอบว่า Email/Password เปิดใช้งานอยู่
2. ปิด **Allow new users to sign up** เพื่อไม่ให้บุคคลทั่วไปสมัครเอง
3. ไปที่ **Authentication > Users** และสร้างบัญชีสำหรับผู้ดูแลฝ่าย IT หนึ่งบัญชี หากมีบัญชีเดิมอยู่แล้วใช้บัญชีนั้นได้
4. เปิดไฟล์ `supabase/promote_admin.sql`
5. เปลี่ยน `YOUR_IT_ADMIN_EMAIL@company.co.th` เป็นอีเมลของผู้ดูแลจริง
6. Run ไฟล์ใน SQL Editor
7. ตรวจผลลัพธ์ด้านล่าง ต้องแสดง `role = admin` และ `department = ฝ่าย IT`

ห้ามแจกสิทธิ์ Admin ให้บัญชีพนักงานทั่วไป

## 3. Deploy Edge Functions

การสร้างบัญชี Auth และการลบไฟล์ใน Backup ใช้ `service_role` จึงทำผ่าน Edge Function ฝั่ง Server เท่านั้น ห้ามใส่ `service_role` ใน React หรือ Vercel

เปิด Terminal ที่โฟลเดอร์โปรเจกต์แล้วรัน:

```bash
npx supabase login
npx supabase link --project-ref qhdwztrzljhkjmacfrkn
npx supabase functions deploy create-user
npx supabase functions deploy update-user
```

สร้างรหัสลับแบบสุ่มด้วยคำสั่งนี้ แล้วคัดลอกค่าที่แสดงไว้:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

นำค่าที่ได้มาแทน `PASTE_RANDOM_SECRET_HERE` แล้วรัน:

```bash
npx supabase secrets set BACKUP_CLEANUP_SECRET=PASTE_RANDOM_SECRET_HERE
npx supabase functions deploy purge-backups --no-verify-jwt
```

ต้องใช้ `--no-verify-jwt` เพื่อให้ Cron เรียกฟังก์ชันด้วย Cleanup Secret ได้ ตัวฟังก์ชันยังตรวจความปลอดภัยเองทุกครั้ง: การลบจากหน้าเว็บต้องเป็นบัญชี `admin` ส่วนการลบอัตโนมัติต้องส่ง Cleanup Secret ที่ตรงกัน

Supabase จะมี `SUPABASE_URL`, `SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY` ให้ Edge Function โดยอัตโนมัติ เมื่อ Deploy สำเร็จ Admin จะใช้หน้า **จัดการผู้ใช้** เพื่อสร้างและแก้ไขบัญชี User และใช้ปุ่ม **ลบถาวรทันที** ในคลังสำรองได้ หากเปลี่ยนอีเมล ผู้ใช้ต้องใช้อีเมลใหม่ในการ Login ครั้งถัดไป ส่วนช่องรหัสผ่านใหม่สามารถเว้นว่างได้เมื่อต้องการเก็บรหัสผ่านเดิม

หากอัปเดตจากเวอร์ชันก่อนที่ยังไม่มีแผนกแบบไดนามิกและเบอร์โทร ต้อง Run `schema.sql` รุ่นล่าสุดก่อน แล้ว Deploy ฟังก์ชันจัดการผู้ใช้ใหม่:

```bash
npx supabase functions deploy create-user
npx supabase functions deploy update-user
```

## 4. ตั้งเวลาลบ Backup อัตโนมัติ 7 วัน

1. เปิด `supabase/setup_backup_cleanup.sql`
2. เปลี่ยน `YOUR_PUBLISHABLE_OR_ANON_KEY` เป็น Publishable key หรือ anon key จาก Supabase Dashboard > **Project Settings > API**
3. เปลี่ยน `YOUR_BACKUP_CLEANUP_SECRET` เป็นรหัสสุ่มค่าเดียวกับที่ใช้ในข้อ 3
4. คัดลอก SQL ทั้งไฟล์ไป Run ใน Supabase Dashboard > **SQL Editor**
5. ผลลัพธ์ด้านล่างต้องแสดง `purge-it-request-backups-hourly` และ `active = true`

ไฟล์นี้เปิด `pg_cron` และ `pg_net`, เก็บค่าที่ใช้เรียกฟังก์ชันไว้ใน Supabase Vault และเรียก `purge-backups` ทุกชั่วโมงในนาทีที่ 5 ฟังก์ชันจะลบเฉพาะรายการที่มี `archived_at` ครบ 7 วันแล้ว โดยลบรูปผ่าน Storage API ก่อน แล้วจึงลบคำขอและแชตจากฐานข้อมูล

หาก Run ไฟล์นี้ซ้ำ ระบบจะอัปเดตค่าใน Vault และแทนที่ Cron Job เดิม ไม่สร้าง Job ซ้ำ

## 5. ตั้งค่า Environment Variables

คัดลอกไฟล์ตัวอย่าง:

```bash
cp .env.example .env
```

บน Windows CMD:

```cmd
copy .env.example .env
```

เปิด Supabase Dashboard > **Project Settings > API** แล้วนำค่า Project URL และ anon key มาใส่ใน `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

ห้ามนำ `service_role` key มาใส่ใน React เพราะเป็น secret key

## 6. ติดตั้งและรัน

```bash
npm install
npm run dev
```

เปิด URL ที่ Vite แสดงใน Terminal โดยปกติคือ `http://localhost:5173`

## ตรวจสอบ Production Build

```bash
npm run build
npm run preview
```

## โครงสร้างสำคัญ

```text
src/
├─ components/ArchivePage.tsx # คลังสำรองและการกู้คืนคำขอ
├─ components/AttachmentImage.tsx # โหลดรูปส่วนตัวด้วย signed URL
├─ components/ChatDrawer.tsx # ห้องแชตของแต่ละคำขอ
├─ components/LoginPage.tsx  # หน้า Login ไม่มี Register
├─ components/StatisticsPage.tsx # สถิติรายวัน/เดือน/ปีและกราฟแนวโน้ม
├─ components/UserManagementPage.tsx # Admin สร้าง แก้ไข และดูรายชื่อ User
├─ lib/supabase.ts           # Supabase client และ Auth client
├─ services/departmentService.ts # โหลดและเพิ่มแผนก
├─ services/imageService.ts  # ตรวจสอบ/อัปโหลด/เปิดรูปจาก Storage
├─ services/messageService.ts # โหลด/ส่ง/subscribe ข้อความ
├─ services/profileService.ts # Profile, role และเรียก Edge Function
├─ services/ticketService.ts # คำสั่ง select/insert/update
├─ types/message.ts          # TypeScript type ของข้อความ
├─ types/department.ts       # TypeScript type ของแผนก
├─ types/profile.ts          # TypeScript type ของ Admin/User
├─ types/ticket.ts           # TypeScript types
├─ App.tsx                   # Session guard, dashboard และ state หลัก
├─ index.css                 # Login + Dashboard responsive styles
└─ main.tsx
supabase/
├─ functions/create-user/index.ts # สร้าง Auth User ฝั่ง Server
├─ functions/update-user/index.ts # แก้ Profile/Auth User ฝั่ง Server
├─ functions/purge-backups/index.ts # Admin ลบถาวรและ Cron ลบ Backup ครบ 7 วัน
├─ promote_admin.sql         # ตั้งค่า Admin ฝ่าย IT คนแรก
├─ setup_backup_cleanup.sql  # Vault + Cron เรียกลบ Backup ทุกชั่วโมง
└─ schema.sql                # Profiles, ตาราง, role และ RLS
```

## หมายเหตุด้านสิทธิ์

| ความสามารถ | Admin ฝ่าย IT | User ทั่วไป |
| --- | --- | --- |
| ดูคำขอ | ทุกคน | เฉพาะของตัวเอง |
| ส่งคำขอ | — | ได้ |
| แชต | ทุกคำขอ | เฉพาะของตัวเอง |
| เปลี่ยนสถานะ | ได้ | ไม่ได้ |
| เก็บสำรอง/กู้คืน | ได้ | ไม่ได้ |
| ลบ Backup ถาวร | ได้ | ไม่ได้ |
| ดูสถิติ | ได้ | ไม่ได้ |
| สร้างบัญชี User | ได้ | ไม่ได้ |
| แก้ไขบัญชี User | ได้ | ไม่ได้ |
| เพิ่มแผนก | ได้ | ไม่ได้ |

การซ่อนปุ่มใน React เป็นเพียงส่วนของ UI ส่วนการบังคับสิทธิ์จริงอยู่ที่ Supabase RLS และ Edge Functions การสร้าง User ใช้ `auth.admin.createUser()` และการแก้ User ใช้ `auth.admin.updateUserById()` เฉพาะฝั่ง Server โดย `update-user` ตรวจว่าผู้เรียกเป็น Admin และเป้าหมายเป็น role `user` ทุกครั้ง บัญชี Admin จึงแก้จากหน้าจอนี้ไม่ได้ ส่วนการลบถาวรใช้ Service Role เฉพาะใน `purge-backups` และตรวจ role หรือ Cleanup Secret ก่อนทุกครั้ง

เมื่อคำขอถูกลบถาวรแล้ว ข้อมูลคำขอ แชต รูปภาพ และข้อมูลของรายการนั้นในหน้าสถิติจะไม่สามารถกู้คืนได้
