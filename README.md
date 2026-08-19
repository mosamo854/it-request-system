# IT Request Center — React + Supabase

ระบบรับแจ้งปัญหา IT สำหรับหลายแผนก พัฒนาด้วย React, TypeScript, Vite และ Supabase

## ฟีเจอร์

- Login ด้วย Supabase Auth (Email/Password)
- ไม่มีหน้า Register — ผู้ดูแลสร้างบัญชีจากหลังบ้านเท่านั้น
- ห้องแชตแยกตามคำขอ พร้อมรับข้อความใหม่แบบ Realtime
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

ไฟล์ SQL จะสร้างตาราง `it_requests`, ตารางแชต `it_request_messages`, indexes, trigger, Realtime, RLS policies และข้อมูลตัวอย่าง โดยอนุญาตให้เฉพาะผู้ที่ Login แล้วเข้าถึงข้อมูล

หากเคย Run `schema.sql` รุ่นก่อนแล้ว ให้ Run รุ่นล่าสุดทั้งไฟล์อีกครั้งเพื่อเพิ่มตารางแชตและเปิด Realtime สคริปต์ออกแบบให้ Run ซ้ำได้

### ถ้าเคยพบ error `it_requests_requester_email_check`

สคริปต์รุ่นก่อนมีปัญหาการ escape Regular Expression ของอีเมล หากตารางถูกสร้างไปแล้ว ให้เลือกวิธีใดวิธีหนึ่ง:

1. Run `supabase/fix_email_constraint.sql` แล้ว Run `supabase/schema.sql` อีกครั้ง หรือ
2. Run `supabase/schema.sql` รุ่นล่าสุดทั้งไฟล์ เพราะสคริปต์สามารถซ่อม constraint เดิมให้อัตโนมัติ

## 2. เปิดระบบ Login และสร้างผู้ใช้จากหลังบ้าน

1. เปิด Supabase Dashboard > **Authentication > Providers** และตรวจสอบว่า Email/Password เปิดใช้งานอยู่
2. หากต้องการป้องกันการสมัครผ่าน API ด้วย ให้ปิดตัวเลือก **Allow new users to sign up** ของ Email provider
3. ไปที่ **Authentication > Users**
4. กด **Add user / Create new user**
5. กรอกอีเมลและรหัสผ่าน แล้วเลือกสร้างผู้ใช้โดยยืนยันอีเมลให้เรียบร้อย
6. ส่งอีเมลและรหัสผ่านให้ผู้ใช้ผ่านช่องทางภายในที่ปลอดภัย

เว็บไซต์ไม่มีปุ่มหรือหน้า Register ผู้ใช้ใหม่จึงต้องถูกสร้างโดยผู้ดูแลจาก Supabase Dashboard เท่านั้น

## 3. ตั้งค่า Environment Variables

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

## 4. ติดตั้งและรัน

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
├─ components/ChatDrawer.tsx # ห้องแชตของแต่ละคำขอ
├─ components/LoginPage.tsx  # หน้า Login ไม่มี Register
├─ lib/supabase.ts           # Supabase client และ Auth client
├─ services/messageService.ts # โหลด/ส่ง/subscribe ข้อความ
├─ services/ticketService.ts # คำสั่ง select/insert/update
├─ types/message.ts          # TypeScript type ของข้อความ
├─ types/ticket.ts           # TypeScript types
├─ App.tsx                   # Session guard, dashboard และ state หลัก
├─ index.css                 # Login + Dashboard responsive styles
└─ main.tsx
supabase/
└─ schema.sql                # ตาราง, RLS และข้อมูลตัวอย่าง
```

## หมายเหตุด้านสิทธิ์

RLS อนุญาตเฉพาะบัญชีที่ Login แล้วให้อ่าน/สร้างคำขอ แก้เฉพาะคอลัมน์ `status` และส่งข้อความโดยใช้ตัวตนของบัญชีที่ Login หากต้องการแยกสิทธิ์พนักงานทั่วไปกับฝ่าย IT ขั้นถัดไปควรเพิ่มตาราง `profiles` และ role เช่น `employee`, `it_staff`, `admin`
