# Request Center — React + Supabase

ระบบส่งและติดตามคำขอระหว่างแผนกภายในองค์กร พัฒนาด้วย React, TypeScript, Vite และ Supabase

หน้าเว็บใช้ฟอนต์ `Noto Sans Thai` จาก Google Fonts พร้อม fallback เป็น `Leelawadee UI`, Tahoma และ Arial เพื่อให้ภาษาไทยอ่านง่ายและแสดงผลได้ต่อเนื่องหากโหลดฟอนต์ออนไลน์ไม่ได้

## ฟีเจอร์

- Login ด้วย Supabase Auth (Email/Password)
- แยกบทบาท `super_admin`, `admin` และ `user`
- Super Admin แต่งตั้งหรือลดบทบาท Admin และกำหนดสิทธิ์รายฟังก์ชันได้จากหน้าเว็บ
- ผู้ส่งเลือกแผนกปลายทางได้ทุกครั้งที่สร้างคำขอ
- คำขอเก็บทั้งแผนกผู้ส่งและแผนกปลายทาง
- Admin เห็นและดำเนินการได้เฉพาะคำขอที่ส่งมายังแผนกของตนเอง
- Admin ที่มีสิทธิ์แก้ไขคำขอสามารถมอบหมายงานให้ Admin หรือ User ในแผนกปลายทางเดียวกันได้
- ผู้ได้รับมอบหมายจะเห็นคำขอ เปิดแชต และเปลี่ยนสถานะได้ โดยไม่มีสิทธิ์เก็บสำรองหรือลบคำขอ
- Super Admin เห็นคำขอของทุกแผนก
- Admin แต่ละแผนกเห็นเฉพาะเมนูและปุ่มที่ Super Admin อนุญาต
- Admin สร้างและแก้ไขบัญชี User จากหน้าเว็บผ่าน Supabase Edge Function
- Admin แก้ชื่อ อีเมล เบอร์โทร แผนก และตั้งรหัสผ่านใหม่ให้ User ได้
- Admin เพิ่มแผนกใหม่ได้จากหน้าจัดการผู้ใช้
- การสร้าง User ต้องระบุเบอร์โทร โดยระบบเก็บเป็นรูปแบบ `+66...`
- User ไม่มีหน้า Register และสมัครบัญชีเองไม่ได้
- สิทธิ์ Admin แยกเป็น ดู/แก้ไข/เก็บคำขอ, ดู/กู้คืน/ลบคลังสำรอง, สถิติ/Export, Audit Trail/Export, ผู้ใช้ และแผนก
- User เห็นคำขอที่ตัวเองส่งและคำขอที่ได้รับมอบหมาย โดยเปลี่ยนสถานะได้เฉพาะรายการที่ได้รับมอบหมาย
- ห้องแชตแยกตามคำขอ พร้อมรับข้อความใหม่แบบ Realtime
- ศูนย์แจ้งเตือนในเว็บแบบ Realtime พร้อมจำนวนที่ยังไม่อ่านและปุ่มอ่านทั้งหมด
- Admin ได้รับแจ้งเตือนเฉพาะคำขอและข้อความที่ส่งมายังแผนกของตนเอง ส่วน User ได้รับแจ้งเตือนเมื่อสถานะเปลี่ยนหรือแผนกปลายทางตอบแชต
- แนบรูปภาพได้ทั้งตอนส่งคำขอและในห้องแชต (สูงสุด 5 MB ต่อรูป)
- ลบได้เฉพาะคำขอที่เสร็จสิ้น โดยใช้ Soft Delete และเก็บไว้ในคลังสำรอง
- เปิดดูแชต กู้คืน หรือลบคำขอจากคลังสำรองถาวรได้
- ระบบเก็บ Backup ไว้ 7 วัน แล้วลบคำขอ แชต และรูปภาพถาวรอัตโนมัติ
- หน้าสถิติรายวัน 7 วัน, รายเดือน 12 เดือน และรายปี 5 ปี พร้อมกราฟแนวโน้ม
- Export รายงานสถิติเป็นไฟล์ CSV ภาษาไทย พร้อมสรุป รายละเอียดแต่ละช่วง และรายการคำขอ
- หน้า Audit Trail สำหรับ Admin แสดงประวัติผู้ดำเนินการ เวลา และรายละเอียด พร้อมค้นหา กรอง และ Export CSV
- ส่งคำขอใหม่ไปยังแผนกที่ผู้ใช้เลือก
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

ไฟล์ SQL จะสร้างตาราง `departments`, `profiles`, `it_requests`, ตารางแชต `it_request_messages`, แผนกผู้ส่ง, แผนกปลายทาง, role, permissions, requester ownership, เบอร์โทร, คลังสำรอง, Storage bucket ส่วนตัว, trigger, Realtime และ RLS policies

หากเคย Run `schema.sql` รุ่นก่อนแล้ว ให้ Run รุ่นล่าสุดทั้งไฟล์อีกครั้ง สคริปต์จะย้ายรายชื่อแผนกเดิมเข้าสู่ตาราง `departments`, เพิ่มคอลัมน์ `phone`, สร้าง Profile ให้บัญชี Auth เดิมเป็น role `user` และเชื่อมคำขอเดิมกับบัญชีที่อีเมลตรงกัน โดยไม่ลบคำขอ ข้อความ หรือรูปภาพเดิม

เบอร์โทรของบัญชีเดิมจะเป็นค่าว่างได้ แต่การสร้าง User ใหม่จากหน้า Admin จะบังคับกรอกเบอร์ไทย เช่น `0812345678` หรือ `+66812345678` และบันทึกเป็นรูปแบบ `+66...`

รูปภาพรองรับไฟล์ JPG, PNG, WEBP และ GIF ขนาดไม่เกิน 5 MB ไฟล์จะอยู่ใน bucket แบบ private และหน้าเว็บจะสร้างลิงก์ชั่วคราวให้เฉพาะผู้ที่ Login แล้ว

### 1.1 เปิดใช้ศูนย์แจ้งเตือนในเว็บ

หลัง Run `schema.sql` แล้ว ให้เปิด `supabase/setup_notifications.sql` คัดลอกโค้ดทั้งหมดไป Run ใน **SQL Editor** อีกหนึ่งครั้ง ไฟล์นี้จะสร้างตารางแจ้งเตือน, Trigger, Realtime และ RLS โดยไม่ส่งข้อมูลออกไปยัง Email หรือ LINE

ระบบจะสร้างแจ้งเตือนให้อัตโนมัติในกรณีต่อไปนี้:

- User ส่งคำขอใหม่ → แจ้ง Admin ของแผนกปลายทางเท่านั้น
- Admin เปลี่ยนสถานะคำขอ → แจ้ง User เจ้าของคำขอ
- User ส่งข้อความหรือรูปในแชต → แจ้ง Admin ของแผนกปลายทาง
- Admin ตอบข้อความหรือส่งรูปในแชต → แจ้ง User เจ้าของคำขอในชื่อแผนกปลายทาง
- Admin มอบหมายคำขอ → แจ้งผู้รับผิดชอบที่ถูกเลือก
- ผู้รับผิดชอบตอบแชต → แจ้ง User เจ้าของคำขอ

ผู้ใช้แต่ละคนอ่านได้เฉพาะแจ้งเตือนของตัวเองผ่าน RLS และการกดแจ้งเตือนจะเปิดคำขอพร้อมห้องแชตที่เกี่ยวข้อง

### 1.2 เปิดใช้ประวัติการดำเนินการ

เปิด `supabase/setup_activity_logs.sql` คัดลอกโค้ดทั้งหมดไป Run ใน **SQL Editor** หนึ่งครั้ง ไฟล์นี้จะสร้างตาราง `activity_logs`, Trigger, Realtime และ RLS ที่อนุญาตให้เฉพาะ Admin อ่านประวัติได้

ระบบจะเริ่มเก็บประวัติตั้งแต่เวลาที่ Run ไฟล์นี้ โดยบันทึกการสร้างคำขอ เปลี่ยนสถานะ เก็บสำรอง กู้คืน ลบถาวร ลบอัตโนมัติ เพิ่มแผนก สร้างผู้ใช้ และแก้ไขผู้ใช้ ประวัติเก่าก่อนติดตั้งจะไม่สามารถสร้างย้อนหลังได้อย่างถูกต้องจึงไม่นำมาเพิ่มอัตโนมัติ

### 1.3 อัปเกรดระบบเดิมเป็น Super Admin

หากระบบมีข้อมูลอยู่แล้ว ไม่ต้องลบตาราง ให้ Run ตามลำดับนี้ใน SQL Editor:

1. `supabase/setup_super_admin_permissions.sql`
2. `supabase/setup_activity_logs.sql` อีกครั้ง เพื่อเพิ่มกิจกรรมการกำหนดสิทธิ์
3. `supabase/setup_notifications.sql` อีกครั้ง เพื่อส่งแจ้งเตือนเฉพาะ Admin ที่มีสิทธิ์ดูคำขอ

Admin เดิมจะได้รับสิทธิ์เดิมครบทุกข้อชั่วคราว จึงไม่เกิดการล็อกผู้ดูแลออกจากระบบ จากนั้น Super Admin สามารถปรับสิทธิ์ของแต่ละบัญชีผ่านหน้าเว็บได้

### 1.4 อัปเกรดจากระบบ IT Ticket เป็นระบบหลายแผนก

หากมีข้อมูลจากเวอร์ชันก่อนอยู่แล้ว ให้ Run ตามลำดับนี้ใน SQL Editor โดยไม่ต้องลบตาราง:

1. `supabase/setup_multi_department_requests.sql`
2. `supabase/setup_activity_logs.sql` อีกครั้ง
3. `supabase/setup_notifications.sql` อีกครั้ง

Migration จะเพิ่ม `target_department` และกำหนดคำขอเก่าทั้งหมดให้ส่งถึง `ฝ่าย IT` โดยอัตโนมัติ เนื่องจากคำขอเหล่านั้นมาจากระบบ IT เดิม ส่วนคำขอใหม่จะใช้เลขรูปแบบ `REQ-...` และผู้ส่งเป็นผู้เลือกแผนกปลายทาง

RLS, ห้องแชต, รูปภาพ, คลังสำรอง, สถิติ, Audit Trail และการแจ้งเตือนจะตรวจแผนกปลายทางเสมอ Admin จึงไม่สามารถเปิดคำขอของแผนกอื่นด้วยการเรียก API โดยตรง

### 1.5 เปิดใช้การมอบหมายผู้รับผิดชอบในแผนก

หากอัปเกรดจากระบบหลายแผนกเวอร์ชันก่อน ให้ Run ตามลำดับนี้ใน SQL Editor:

1. `supabase/setup_request_assignment.sql`
2. `supabase/setup_activity_logs.sql` อีกครั้ง เพื่อบันทึกประวัติการมอบหมาย
3. `supabase/setup_notifications.sql` อีกครั้ง เพื่อแจ้งผู้ได้รับมอบหมายและปรับการแจ้งเตือนแชต

Migration จะเพิ่มผู้รับผิดชอบ เวลาและผู้มอบหมาย รวมถึง RLS สำหรับคำขอ แชต และรูปภาพ Admin ต้องมีสิทธิ์ `requests.update` และเลือกได้เฉพาะ Profile ที่อยู่ในแผนกปลายทางของคำขอเท่านั้น การตรวจสอบนี้อยู่ใน Database Function จึงข้ามด้วยการแก้หน้าเว็บหรือเรียก API โดยตรงไม่ได้

การอัปเดตส่วนนี้ไม่ต้อง Deploy Edge Function เพิ่ม เพราะคำสั่งมอบหมายทำงานผ่าน PostgreSQL RPC ที่สร้างโดยไฟล์ SQL

### ถ้าเคยพบ error `it_requests_requester_email_check`

สคริปต์รุ่นก่อนมีปัญหาการ escape Regular Expression ของอีเมล หากตารางถูกสร้างไปแล้ว ให้เลือกวิธีใดวิธีหนึ่ง:

1. Run `supabase/fix_email_constraint.sql` แล้ว Run `supabase/schema.sql` อีกครั้ง หรือ
2. Run `supabase/schema.sql` รุ่นล่าสุดทั้งไฟล์ เพราะสคริปต์สามารถซ่อม constraint เดิมให้อัตโนมัติ

## 2. ตั้งค่า Super Admin คนแรก

1. เปิด Supabase Dashboard > **Authentication > Providers** และตรวจสอบว่า Email/Password เปิดใช้งานอยู่
2. ปิด **Allow new users to sign up** เพื่อไม่ให้บุคคลทั่วไปสมัครเอง
3. ไปที่ **Authentication > Users** และสร้างบัญชีเจ้าของระบบหนึ่งบัญชี หากมี Admin เดิมอยู่แล้วใช้บัญชีนั้นได้
4. เปิดไฟล์ `supabase/promote_super_admin.sql`
5. เปลี่ยน `YOUR_SUPER_ADMIN_EMAIL@company.co.th` เป็นอีเมลของเจ้าของระบบจริง
6. Run ไฟล์ใน SQL Editor
7. ตรวจผลลัพธ์ด้านล่าง ต้องแสดง `role = super_admin`

ควรมี Super Admin เท่าที่จำเป็น และใช้ปุ่ม **แต่งตั้ง Admin** ในหน้า **จัดการผู้ใช้** สำหรับผู้ดูแลคนอื่น

## 3. Deploy Edge Functions

การสร้างบัญชี Auth และการลบไฟล์ใน Backup ใช้ `service_role` จึงทำผ่าน Edge Function ฝั่ง Server เท่านั้น ห้ามใส่ `service_role` ใน React หรือ Vercel

เปิด Terminal ที่โฟลเดอร์โปรเจกต์แล้วรัน:

```bash
npx supabase login
npx supabase link --project-ref qhdwztrzljhkjmacfrkn
npx supabase functions deploy create-user
npx supabase functions deploy update-user
npx supabase functions deploy manage-admin-access
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

ต้องใช้ `--no-verify-jwt` เพื่อให้ Cron เรียกฟังก์ชันด้วย Cleanup Secret ได้ ตัวฟังก์ชันยังตรวจความปลอดภัยเองทุกครั้ง: การลบจากหน้าเว็บต้องมีสิทธิ์ `archive.delete` และคำขอต้องส่งมายังแผนกของ Admin ส่วนการลบอัตโนมัติต้องส่ง Cleanup Secret ที่ตรงกัน

Supabase จะมี `SUPABASE_URL`, `SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY` ให้ Edge Function โดยอัตโนมัติ เมื่อ Deploy สำเร็จ Admin จะใช้หน้า **จัดการผู้ใช้** เพื่อสร้างและแก้ไขบัญชี User และใช้ปุ่ม **ลบถาวรทันที** ในคลังสำรองได้ หากเปลี่ยนอีเมล ผู้ใช้ต้องใช้อีเมลใหม่ในการ Login ครั้งถัดไป ส่วนช่องรหัสผ่านใหม่สามารถเว้นว่างได้เมื่อต้องการเก็บรหัสผ่านเดิม

หากอัปเดตจากเวอร์ชันก่อน หลัง Run `setup_activity_logs.sql` แล้ว ต้อง Deploy Edge Functions ทั้งสามตัวใหม่เพื่อให้การสร้างผู้ใช้ แก้ไขผู้ใช้ และลบ Backup ถูกบันทึกในประวัติ:

```bash
npx supabase functions deploy create-user
npx supabase functions deploy update-user
npx supabase functions deploy manage-admin-access
npx supabase functions deploy purge-backups --no-verify-jwt
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
├─ components/AdminAccessDialog.tsx # Super Admin กำหนดบทบาทและสิทธิ์
├─ components/ActivityLogPage.tsx # ประวัติการดำเนินการ ค้นหา กรอง และ Export
├─ components/AttachmentImage.tsx # โหลดรูปส่วนตัวด้วย signed URL
├─ components/ChatDrawer.tsx # ห้องแชตของแต่ละคำขอ
├─ components/EditUserDialog.tsx # Modal แก้ไข User ผ่าน React Portal
├─ components/LoginPage.tsx  # หน้า Login ไม่มี Register
├─ components/NotificationCenter.tsx # กระดิ่ง รายการ และ Toast แจ้งเตือน
├─ components/StatisticsPage.tsx # สถิติรายวัน/เดือน/ปีและกราฟแนวโน้ม
├─ components/UserManagementPage.tsx # Admin สร้าง แก้ไข และดูรายชื่อ User
├─ lib/supabase.ts           # Supabase client และ Auth client
├─ services/departmentService.ts # โหลดและเพิ่มแผนก
├─ services/activityLogService.ts # โหลดและ subscribe ประวัติ Admin
├─ services/assignmentService.ts # รายชื่อสมาชิกในแผนกและคำสั่งมอบหมาย
├─ services/imageService.ts  # ตรวจสอบ/อัปโหลด/เปิดรูปจาก Storage
├─ services/messageService.ts # โหลด/ส่ง/subscribe ข้อความ
├─ services/notificationService.ts # โหลด อ่าน และ subscribe แจ้งเตือน
├─ services/profileService.ts # Profile, role และเรียก Edge Function
├─ services/reportExportService.ts # สร้างและดาวน์โหลด CSV ภาษาไทย
├─ services/ticketService.ts # คำสั่ง select/insert/update
├─ types/message.ts          # TypeScript type ของข้อความ
├─ types/notification.ts     # TypeScript type ของการแจ้งเตือน
├─ types/department.ts       # TypeScript type ของแผนก
├─ types/activityLog.ts      # TypeScript type ของประวัติการดำเนินการ
├─ types/assignment.ts       # TypeScript type ของผู้รับมอบหมาย
├─ types/profile.ts          # TypeScript type ของ Admin/User
├─ types/ticket.ts           # TypeScript types
├─ App.tsx                   # Session guard, dashboard และ state หลัก
├─ index.css                 # Login + Dashboard responsive styles
└─ main.tsx
supabase/
├─ functions/create-user/index.ts # สร้าง Auth User ฝั่ง Server
├─ functions/update-user/index.ts # แก้ Profile/Auth User ฝั่ง Server
├─ functions/manage-admin-access/index.ts # แต่งตั้ง Admin และบันทึก permissions
├─ functions/purge-backups/index.ts # Admin ลบถาวรและ Cron ลบ Backup ครบ 7 วัน
├─ promote_super_admin.sql   # ตั้งค่า Super Admin คนแรก
├─ setup_super_admin_permissions.sql # Migration role, permissions และ RLS
├─ setup_multi_department_requests.sql # Migration แผนกผู้ส่ง/ปลายทางและ RLS
├─ setup_request_assignment.sql # Migration มอบหมายงานให้สมาชิกแผนกเดียวกัน
├─ setup_backup_cleanup.sql  # Vault + Cron เรียกลบ Backup ทุกชั่วโมง
├─ setup_activity_logs.sql   # Audit Trail Trigger Realtime และ RLS
├─ setup_notifications.sql   # ตาราง Trigger Realtime และ RLS แจ้งเตือน
└─ schema.sql                # Profiles, ตาราง, role และ RLS
```

## หมายเหตุด้านสิทธิ์

| ความสามารถ | Super Admin | Admin | User ทั่วไป |
| --- | --- | --- | --- |
| ดูคำขอ | ได้ทั้งหมด | ตามสิทธิ์ เฉพาะที่ส่งมายังแผนกตนเอง | ของตัวเองและที่ได้รับมอบหมาย |
| ส่งคำขอ | — | — | ได้ |
| มอบหมายผู้รับผิดชอบ | ได้ | เมื่อมี `requests.update` และเลือกได้เฉพาะคนในแผนก | ไม่ได้ |
| แชต | ทุกคำขอ | เมื่อมีสิทธิ์และเป็นแผนกปลายทาง | ของตัวเองและที่ได้รับมอบหมาย |
| เปลี่ยนสถานะ | ได้ | ตามสิทธิ์ | เฉพาะที่ได้รับมอบหมาย |
| เก็บสำรอง/กู้คืน/ลบถาวร | ได้ | แยกตามสิทธิ์ | ไม่ได้ |
| ดูสถิติและ Export | ได้ | แยกตามสิทธิ์ | ไม่ได้ |
| ดู/Export ประวัติ | ได้ | แยกตามสิทธิ์ | ไม่ได้ |
| สร้าง/แก้บัญชี User | ได้ | แยกตามสิทธิ์ | ไม่ได้ |
| แต่งตั้ง Admin และกำหนดสิทธิ์ | ได้ | ไม่ได้ | ไม่ได้ |
| เพิ่มแผนก | ได้ | ตามสิทธิ์ | ไม่ได้ |

การซ่อนปุ่มใน React เป็นเพียง UI การบังคับสิทธิ์จริงอยู่ที่ Supabase RLS, Database Trigger และ Edge Functions โดย `manage-admin-access` ยอมรับเฉพาะ Super Admin, `create-user`/`update-user` ตรวจ permission ของผู้เรียก และ `purge-backups` ตรวจ `archive.delete` หรือ Cleanup Secret ทุกครั้ง

เมื่อคำขอถูกลบถาวรแล้ว ข้อมูลคำขอ แชต รูปภาพ และข้อมูลของรายการนั้นในหน้าสถิติจะไม่สามารถกู้คืนได้
