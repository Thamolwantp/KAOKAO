# KAOKAO

## What This Is

KAOKAO is a Progressive Web App (PWA) for helping find lost pets — accessible from any browser and installable on iOS/Android home screens without an App Store. Pet owners create profiles and QR codes for each pet; anyone who finds a lost pet can scan the QR and notify the owner instantly without logging in. The platform combines geo-notifications (5 km radius push alerts to nearby Helpers) and AI dog face recognition (v1: stub) so finders and owners coordinate quickly.

## Core Value

Anyone who finds a lost pet can notify the owner immediately by scanning a QR code — no account required.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Guest can scan QR code and submit a sighting with location (no login required)
- [ ] Owner can create pet profile with QR code auto-generated on creation
- [ ] Owner can mark pet as lost and trigger geo-notifications to Helpers within 5 km
- [ ] Helper can register, view lost-pet feed/map, and receive push notifications
- [ ] Helper can upload dog photo to AI scan and get top-10 candidate matches (v1 stub)
- [ ] Owner can track pet health: vaccinations, weight logs, vet visits
- [ ] Admin can manage users, pets, cases, and monitor AI scan activity
- [ ] PWA installable on iOS/Android home screen with offline graceful degradation

### Out of Scope

- Native mobile app (iOS/Android) — PWA covers mobile use case for v1
- Payment / e-commerce — no reward payment system in v1
- Multi-language i18n — Thai + English implicit, no i18n framework
- Real-time chat — notification + contact info is the communication channel
- SMS notifications — web push + email covers v1; SMS is v2+
- Cat/other species face recognition — dog only in v2; v1 is a stub anyway
- AI model retraining pipeline — manual export for v2; v1 mock data only

## Context

- Spec fully written at `spec.md` (v1.0, 2026-06-18) — authoritative reference for all flows
- Schema designed at `schema.prisma` — all tables defined including `push_subscriptions` and `stale_closed` enum
- Spec review completed at `REVIEW_SPEC.md` — 14 blockers identified and resolved in spec
- Design system defined in `DesignGuide.html` — warm beige (#E8DCCB) palette, Quicksand + Nunito fonts, shadcn/ui components
- Stack doc at `STACK.md` — Resend for email fallback, OpenStreetMap for maps (no API key)
- No application code written yet — project is pre-implementation

## Constraints

- **Tech Stack**: Next.js 14 App Router + Supabase (PostgreSQL + Auth + Storage + pgvector) + Prisma + Tailwind + shadcn/ui + Vercel — already decided
- **Budget**: Free tier (Vercel + Supabase) for v1; Vercel Pro required for >1 Cron job/day
- **Performance**: QR scan page load < 2s on mobile 3G
- **Privacy**: PDPA compliance — EXIF stripped before storage, AI scan images auto-deleted after 24h, phone verification before displaying owner contact info
- **Security**: RLS enabled on every table; service role key server-only; Admin requires TOTP MFA
- **Geo**: PostGIS GiST index on `users.home_location` (geography type) + pgvector HNSW index (m=16, ef_construction=64) on `pet_embeddings.embedding`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No login required to submit sighting | Core value: instant notification without friction | — Pending |
| Phone OTP verification deferred to contact-display time | Avoids paid SMS at registration; reduces friction | — Pending |
| Role promotion Helper → Owner automatic on first pet create | Single DB transaction; no separate upgrade flow | — Pending |
| Geo-notification via Supabase Edge Function (async) | Avoids Vercel 50s timeout on large fan-outs | — Pending |
| Web Push via VAPID (no Firebase) | Reduces vendor lock-in | — Pending |
| Map: react-leaflet + OpenStreetMap | No API key, no cost | — Pending |
| AI v1 is a stub (mock data) | Real model is v2; validates UX flow first | — Pending |
| Cron jobs via Vercel Cron (Pro tier) | 4 daily jobs needed; Hobby tier only supports 1 | — Pending |
| Location precision rounded to 2 decimal places (~1.1 km) for Helpers | Privacy — Helpers must not see precise lost location | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-19 after initialization from spec.md*
