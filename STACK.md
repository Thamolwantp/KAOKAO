# KAOKAO — Project Stack Summary

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Full-stack, deploy on Vercel |
| Database | Supabase (PostgreSQL) | Free tier, dashboard friendly |
| Auth | Supabase Auth | Email+Password + Phone+OTP; role เก็บใน `users.role` ใน DB |
| ORM | Prisma | Type-safe, migration easy |
| Styling | Tailwind CSS + shadcn/ui | Component library พร้อมใช้ |
| File Storage | Supabase Storage | รูปภาพ pet + QR code |
| Map / Geo | Leaflet + OpenStreetMap | ฟรีสมบูรณ์, ไม่มีขีดจำกัด |
| QR Code | `qrcode` npm | Generate PNG + SVG, ฟรี |
| Image Processing | `sharp` npm | Validate/resize รูปก่อน store, ฟรี |
| Push Notifications | Web Push API + `web-push` npm (VAPID) | ไม่พึ่ง Firebase, ฟรี |
| Email | Resend | Free tier 3,000 emails/เดือน; fallback เมื่อ push ล้มเหลว |
| AI Scan | Stub API Route (v1) | Mock data; v2 provider TBD |
| Deploy | Vercel + Supabase free tier | ทั้งคู่ฟรี |
