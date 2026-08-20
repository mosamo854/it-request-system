# IT Request Center — React + Supabase

ระบบรับแจ้งปัญหา IT สำหรับหลายแผนก พัฒนาด้วย React, TypeScript, Vite และ Supabase

## ฟีเจอร์

- Login ด้วย Supabase Auth (Email/Password)
- แยกสิทธิ์ `admin` (ฝ่าย IT) และ `user` (พนักงานแต่ละแผนก)
- Admin สร้างบัญชี User จากหน้าเว็บผ่าน Supabase Edge Function
- User ไม่มีหน้า Register และสมัครบัญชีเองไม่ได้
- Admin เห็นทุกคำขอ เปลี่ยนสถานะ ตอบแชต เก็บสำรอง และดูสถิติได้
- User เห็นเฉพาะคำขอของตัวเอง ส่งคำขอ แชต และดูสถานะได้ แต่เปลี่ยนสถานะไม่ได้
- ห้องแชตแยกตามคำขอ พร้อมรับข้อความใหม่แบบ Realtime
- แนบรูปภาพได้ทั้งตอนส่งคำขอและในห้องแชต (สูงสุด 5 MB ต่อรูป)
- ลบได้เฉพาะคำขอที่เสร็จสิ้น โดยใช้ Soft Delete และเก็บไว้ในคลังสำรอง
- เปิดดูแชตและกู้คืนคำขอจากคลังสำรองได้
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

ไฟล์ SQL จะสร้างตาราง `profiles`, ตาราง `it_requests`, ตารางแชต `it_request_messages`, role, requester ownership, คลังสำรอง, Storage bucket ส่วนตัว, trigger, Realtime และ RLS policies ที่แยกสิทธิ์ Admin/User

หากเคย Run `schema.sql` รุ่นก่อนแล้ว ให้ Run รุ่นล่าสุดทั้งไฟล์อีกครั้ง สคริปต์จะสร้าง Profile ให้บัญชี Auth เดิมเป็น role `user` และเชื่อมคำขอเดิมกับบัญชีที่อีเมลตรงกัน โดยไม่ลบคำขอ ข้อความ หรือรูปภาพเดิม

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

## 3. Deploy Edge Function สำหรับสร้าง User

การสร้างบัญชี Auth ต้องใช้ `service_role` จึงทำผ่าน Edge Function ฝั่ง Server เท่านั้น ห้ามใส่ `service_role` ใน React หรือ Vercel

เปิด Terminal ที่โฟลเดอร์โปรเจกต์แล้วรัน:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-user
```

หา `YOUR_PROJECT_REF` ได้จาก URL ของ Supabase Project หรือ Project Settings

Supabase จะมี `SUPABASE_URL`, `SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY` ให้ Edge Function โดยอัตโนมัติ เมื่อ Deploy สำเร็จ Admin จะใช้หน้า **จัดการผู้ใช้** เพื่อสร้างบัญชี User ได้

## 4. ตั้งค่า Environment Variables

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

## 5. ติดตั้งและรัน

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
├─ components/UserManagementPage.tsx # Admin สร้างและดูรายชื่อ User
├─ lib/supabase.ts           # Supabase client และ Auth client
├─ services/imageService.ts  # ตรวจสอบ/อัปโหลด/เปิดรูปจาก Storage
├─ services/messageService.ts # โหลด/ส่ง/subscribe ข้อความ
├─ services/profileService.ts # Profile, role และเรียก Edge Function
├─ services/ticketService.ts # คำสั่ง select/insert/update
├─ types/message.ts          # TypeScript type ของข้อความ
├─ types/profile.ts          # TypeScript type ของ Admin/User
├─ types/ticket.ts           # TypeScript types
├─ App.tsx                   # Session guard, dashboard และ state หลัก
├─ index.css                 # Login + Dashboard responsive styles
└─ main.tsx
supabase/
├─ functions/create-user/index.ts # สร้าง Auth User ฝั่ง Server
├─ promote_admin.sql         # ตั้งค่า Admin ฝ่าย IT คนแรก
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
| ดูสถิติ | ได้ | ไม่ได้ |
| สร้างบัญชี User | ได้ | ไม่ได้ |

การซ่อนปุ่มใน React เป็นเพียงส่วนของ UI ส่วนการบังคับสิทธิ์จริงอยู่ที่ Supabase RLS และ Edge Function การสร้าง User ใช้ `auth.admin.createUser()` เฉพาะฝั่ง Server และตรวจ role ของผู้เรียกก่อนทุกครั้ง
