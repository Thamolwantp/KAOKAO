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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**KAOKAO**

KAOKAO is a Progressive Web App (PWA) for helping find lost pets — accessible from any browser and installable on iOS/Android home screens without an App Store. Pet owners create profiles and QR codes for each pet; anyone who finds a lost pet can scan the QR and notify the owner instantly without logging in. The platform combines geo-notifications (5 km radius push alerts to nearby Helpers) and AI dog face recognition (v1: stub) so finders and owners coordinate quickly.

**Core Value:** Anyone who finds a lost pet can notify the owner immediately by scanning a QR code — no account required.

### Constraints

- **Tech Stack**: Next.js 14 App Router + Supabase (PostgreSQL + Auth + Storage + pgvector) + Prisma + Tailwind + shadcn/ui + Vercel — already decided
- **Budget**: Free tier (Vercel + Supabase) for v1; Vercel Pro required for >1 Cron job/day
- **Performance**: QR scan page load < 2s on mobile 3G
- **Privacy**: PDPA compliance — EXIF stripped before storage, AI scan images auto-deleted after 24h, phone verification before displaying owner contact info
- **Security**: RLS enabled on every table; service role key server-only; Admin requires TOTP MFA
- **Geo**: PostGIS GiST index on `users.home_location` (geography type) + pgvector HNSW index (m=16, ef_construction=64) on `pet_embeddings.embedding`
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| find-skills | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill. | `.agents/skills/find-skills/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
