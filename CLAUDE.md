# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KAOKAO is a web platform for finding lost pets, combining QR codes, geo-notifications, and AI dog face recognition.

Full spec is in `spec.md` — read it before working on any feature.

## Stack

- **Framework:** Next.js 14 App Router (full-stack)
- **Database:** Supabase PostgreSQL + pgvector extension
- **Auth:** Supabase Auth — `users.id` always matches `auth.users.id`
- **ORM:** Prisma (schema at `schema.prisma`)
- **Styling:** Tailwind CSS + shadcn/ui
- **Storage:** Supabase Storage (pet photos, QR PNG/SVG)
- **PWA:** `next-pwa` + Web App Manifest + Service Worker
- **Deploy:** Vercel

## Commands

```bash
# Dev
npm run dev

# Build
npm run build

# Lint
npm run lint

# Prisma migrations
npx prisma migrate dev --name <migration_name>
npx prisma generate          # regenerate client after schema changes
npx prisma studio            # GUI for browsing data

# Tests (when test setup exists)
npm test
npm test -- --testPathPattern=<path>   # run specific file
```

## Architecture

### App Router Structure

```
app/
├── (public)/pet/[petId]/     # QR landing — no login required, mobile-first
├── (auth)/                   # register, login
├── (app)/                    # authed routes (Helper+)
│   ├── feed/                 # map + lost pets nearby
│   ├── pets/[petId]/         # owner dashboard per pet
│   ├── scan/                 # AI dog face scan
│   └── notifications/
├── admin/                    # role=admin only
└── api/                      # API routes
    ├── pets/
    ├── lost-cases/
    ├── sightings/            # public POST — no auth required
    ├── ai/scan/              # stub in v1, wired for real in v2
    └── admin/
```

### Auth & Roles

Role is stored in `users.role` (enum: `helper | owner | admin`), not directly in Supabase JWT.

- **Role promotion:** Helper → Owner happens **automatically** when a pet is created for the first time (single DB transaction: insert pet + update users.role)
- **Role does not downgrade** even if all pets are deleted
- **Admin routes** must verify `users.role = 'admin'` in middleware on every request

### Supabase RLS

RLS is always enabled on every table — do not bypass with service role key in client-side code, except:
- `pet_embeddings` — service role only (AI pipeline)
- `notifications` — insert by service role only

Helpers see lost case location rounded to ~1 km (`lastKnownLat/Lng` must be rounded before exposing in API)

### Key Data Flows

**QR Scan → Sighting (unauthenticated):**
`GET /pet/[petId]` → user fills sighting form → `POST /api/sightings` → Notification Service notifies Owner

Rate-limit: 5 sightings/IP/hr at Vercel Edge middleware

**Mark Lost → Nearby Notifications:**
`POST /api/lost-cases` → pet.status = `missing` → Geo Service finds Helpers within 5 km → push/email (max 3 notifications/user/case)

**AI Scan (v1 stub):**
`POST /api/ai/scan` → mock top-10 candidates → Owner confirm/reject via `PATCH /api/ai/matches/[matchId]`

Images uploaded for scanning are auto-deleted after 24 hrs (PDPA) — `ai_scans.imageUrl` is nullified after deletion

### Schema Notes

- `LostCase` has status `open | closed` in the schema, but the spec defines additional logic for `stale_closed` — may need to add the enum value before implementing auto-close
- `PetEmbedding.embedding` uses `Unsupported("vector(512)")` — must use raw SQL or `$queryRaw` for nearest-neighbor search (pgvector not yet supported in Prisma typed queries)
- `reward` in `LostCase` is `String?` — stored as plain text (no payment system in v1)

### Notifications

Web Push uses VAPID keys (not Firebase) via the `web-push` npm package.
Fallback: if push delivery fails → send email automatically.
Push subscriptions are stored in `push_subscriptions` table (not yet in schema.prisma — needs to be added)

### Out of Scope (v1)

Native mobile app (iOS/Android) — PWA covers mobile use case for v1; real-time chat, SMS, cat face recognition, payment, multi-language i18n
