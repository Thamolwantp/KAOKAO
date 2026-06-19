# Roadmap: KAOKAO

## Overview

KAOKAO is built in horizontal layers: the database foundation is laid first, then auth, then the core pet entity, then the lost-recovery workflow, then public-facing and notification UI, then the map feed and AI stub, then health tracking, and finally PWA installability. Each layer is independently verifiable before the next begins.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Next.js project, Supabase config, Prisma migration, CI/CD scaffold
- [ ] **Phase 2: Auth** - Supabase Auth registration, email verification, and password reset
- [ ] **Phase 3: Core Entities** - Pet profile CRUD, QR code generation, photo upload
- [ ] **Phase 4: Lost Pet Recovery** - LostCase CRUD, guard, manual close, auto-close cron, stale warning
- [ ] **Phase 5: QR Scan & Notifications** - Public QR landing page, sighting form, in-app notification inbox
- [ ] **Phase 6: Feed, Map & AI Stub** - Helper map feed with lost-case markers, AI dog face scan stub
- [ ] **Phase 7: Health & Wellness** - Weight logs, vet visit records, Recharts weight chart
- [ ] **Phase 8: PWA** - serwist service worker, Web App Manifest, home-screen installability

## Phase Details

### Phase 1: Foundation

**Goal**: A running Next.js 14 App Router project is connected to Supabase with all schema tables migrated, Tailwind + shadcn/ui wired, and the dev/build pipeline is green
**Depends on**: Nothing (first phase)
**Requirements**: (none — scaffolding phase)
**Success Criteria** (what must be TRUE):

  1. `npm run dev` boots without errors and the root page renders
  2. `npx prisma migrate dev` applies successfully; all tables (users, pets, lost_cases, notifications, push_subscriptions, etc.) exist in Supabase
  3. `npm run build` and `npm run lint` pass cleanly
  4. Supabase Storage buckets (pet-photos, qr-codes) are created; RLS policies are enabled on every table

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Next.js 14 scaffold, Tailwind design tokens, shadcn/ui init

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Supabase clients, env config, Prisma migration (all 13 tables)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Storage buckets, RLS on all tables, full pipeline verification

### Phase 2: Auth

**Goal**: Users can register, verify their email, log in, and reset their password; all authenticated routes are protected
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):

  1. User can register with email and password; a verification email is sent automatically
  2. User must click the verification link before their session is activated (unverified users are redirected to a "check your email" screen)
  3. User can log in and access protected routes under `(app)/`; unauthenticated requests are redirected to login
  4. User can request a password reset email and set a new password via the link; all sessions are invalidated on success

**Plans**: TBD
**UI hint**: yes

### Phase 3: Core Entities

**Goal**: An authenticated user can create a pet profile and immediately receive a QR code linking to the public pet page
**Depends on**: Phase 2
**Requirements**: PET-01, PET-02, PET-03
**Success Criteria** (what must be TRUE):

  1. User can create a pet profile (name, species, breed, gender, color, distinct features, birth date or approx age, photos) and the record is persisted
  2. A QR code (PNG and SVG) is auto-generated on pet creation and its URL is stored in `pets.qr_code_url`; the owner is redirected to `/pets/[petId]`
  3. Owner can download the PNG, download the SVG, and trigger the browser print dialog from the pet detail page
  4. Owner can edit pet profile fields and upload additional photos

**Plans**: TBD
**UI hint**: yes

### Phase 4: Lost Pet Recovery

**Goal**: An owner can mark a pet as lost, manage the case lifecycle, and the system automatically closes stale cases with a prior warning
**Depends on**: Phase 3
**Requirements**: LOST-01, LOST-02, LOST-03, LOST-04, LOST-05
**Success Criteria** (what must be TRUE):

  1. Owner can mark a pet as lost (POST /api/lost-cases creates a LostCase record with status `open` and sets pet.status to `missing`)
  2. Attempting to open a second case for the same pet returns `409 CASE_ALREADY_OPEN`
  3. Owner can close the case (PATCH /api/lost-cases/[id] with `{status: "closed"}`); pet.status reverts to `active`
  4. The `stale-case-check` cron sends a `case_stale_warning` notification and sets `staleWarningSentAt` for open cases inactive for 60 days; the `stale-case-close` cron auto-closes those cases as `stale_closed` 7 days after the warning with no new activity

**Plans**: TBD
**UI hint**: yes

### Phase 5: QR Scan & Notifications

**Goal**: Anyone can scan a QR code and see pet info or a missing-pet alert without logging in; authenticated users have a notification inbox
**Depends on**: Phase 4
**Requirements**: SCAN-01, SCAN-02, SCAN-03, NOTIF-01
**Success Criteria** (what must be TRUE):

  1. GET /pet/[petId] (no auth) shows pet name, photo, species, and breed with an "I found this pet" button for active pets
  2. For missing pets, the page shows a prominent alert banner, a "Contact Owner" button, and a "Send Location" button
  3. The Contact Owner button reveals the owner's preferred contact info only when the owner's phone is verified; it remains hidden otherwise
  4. Authenticated users can view their notification inbox at /notifications and mark individual notifications as read

**Plans**: TBD
**UI hint**: yes

### Phase 6: Feed, Map & AI Stub

**Goal**: Helpers can view a live map of nearby open lost cases, and any authenticated user can upload a dog photo to get AI-matched candidates
**Depends on**: Phase 4
**Requirements**: FEED-01, FEED-02, AI-01, AI-02, AI-03, AI-04
**Success Criteria** (what must be TRUE):

  1. Authenticated Helper can view a react-leaflet + OpenStreetMap map at /feed centered on their home location (zoom 13); if no location is set, a prompt banner appears
  2. Map shows one marker per open lost case; red for cases < 24 h, orange for < 7 days, grey for older
  3. Helper can upload a single dog photo to POST /api/ai/scan and receive up to 10 candidate matches with petId, petName, photoUrl, city, and score (v1: mock data)
  4. If no dog face is detected the API returns `NO_DOG_DETECTED` without producing candidates; if no candidates meet the 0.5 score threshold the API returns `candidates: []` with `message: "NO_MATCH_FOUND"`

**Plans**: TBD
**UI hint**: yes

### Phase 7: Health & Wellness

**Goal**: An owner can log their pet's weight history and vet visits, with weight displayed as a line chart
**Depends on**: Phase 3
**Requirements**: HEALTH-01, HEALTH-02
**Success Criteria** (what must be TRUE):

  1. Owner can log weight entries (weightKg, recordedAt) for a pet; entries appear on the pet profile as a Recharts line chart ordered by date
  2. Owner can log vet visit records (visitDate, clinicInfo, note) for a pet; records are listed chronologically on the pet profile

**Plans**: TBD
**UI hint**: yes

### Phase 8: PWA

**Goal**: The app is installable on iOS and Android home screens via PWA and provides graceful offline degradation
**Depends on**: Phase 2
**Requirements**: PWA-01
**Success Criteria** (what must be TRUE):

  1. A Web App Manifest is served with name, icons, theme color, and display mode; Chrome on Android shows the "Add to Home Screen" install prompt
  2. serwist service worker is registered; the app shell loads from cache when offline and shows a user-facing offline notice for pages that require network

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Note Phase 7 and Phase 6 both depend on earlier layers and can be planned in parallel once their dependencies are met.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/3 | In Progress|  |
| 2. Auth | 0/TBD | Not started | - |
| 3. Core Entities | 0/TBD | Not started | - |
| 4. Lost Pet Recovery | 0/TBD | Not started | - |
| 5. QR Scan & Notifications | 0/TBD | Not started | - |
| 6. Feed, Map & AI Stub | 0/TBD | Not started | - |
| 7. Health & Wellness | 0/TBD | Not started | - |
| 8. PWA | 0/TBD | Not started | - |
