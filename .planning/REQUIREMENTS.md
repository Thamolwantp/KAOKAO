# Requirements: KAOKAO

**Defined:** 2026-06-19
**Core Value:** Anyone who finds a lost pet can notify the owner immediately by scanning a QR code — no account required.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can register with email and password
- [ ] **AUTH-02**: User receives email verification link after signup; must click link before session activates
- [ ] **AUTH-03**: User can reset password via email link (expiry: 1 hour); all sessions invalidated on success

### Pet Profile

- [ ] **PET-01**: Owner can create pet profile (name, species, breed, gender, color, distinct_features, birth_date/approx_age, status, privacy, photos)
- [ ] **PET-02**: QR code (PNG + SVG) auto-generated when pet is created and stored in Supabase Storage; URL saved to pets.qr_code_url
- [ ] **PET-03**: Owner can download PNG/SVG and open print dialog for QR code from /pets/[petId] page

### Health & Wellness

- [ ] **HEALTH-01**: Owner can log weight entries (weightKg, recordedAt); entries displayed as Recharts line chart on pet profile
- [ ] **HEALTH-02**: Owner can log vet visit records (visitDate, clinicInfo?, note?)

### QR Scan Landing Page

- [ ] **SCAN-01**: GET /pet/[petId] (public, no auth) shows basic pet info (name, photo, species, breed) and "I found this pet" button for active pets
- [ ] **SCAN-02**: GET /pet/[petId] shows prominent alert banner, Contact Owner button, and Send Location button for missing pets
- [ ] **SCAN-03**: Contact Owner button reveals owner's preferred contact info only if owner's phone is verified; hidden otherwise

### Lost Pet Recovery

- [ ] **LOST-01**: Owner can mark pet as lost (POST /api/lost-cases creates LostCase, sets pet.status = missing)
- [ ] **LOST-02**: POST /api/lost-cases returns 409 CASE_ALREADY_OPEN if an open LostCase already exists for that pet
- [ ] **LOST-03**: Owner can close case (PATCH /api/lost-cases/[id] {status: "closed"}); pet.status reverts to active
- [ ] **LOST-04**: System auto-closes LostCase after 60 days of owner inactivity (status: stale_closed); pet.status reverts to active
- [ ] **LOST-05**: System sends case_stale_warning in-app notification 7 days before auto-close; sets LostCase.staleWarningSentAt

### Notifications (In-App)

- [ ] **NOTIF-01**: Authenticated users have an in-app notification inbox; notifications can be marked as read

### Feed / Map

- [ ] **FEED-01**: Authenticated Helpers can view a map (react-leaflet + OpenStreetMap tiles) centered on homeLat/homeLng at zoom 13
- [ ] **FEED-02**: Map shows one marker per open lost case; red if lost < 24h ago, orange if < 7 days, grey otherwise

### AI Dog Face Scan

- [ ] **AI-01**: Authenticated Helper can upload a single dog photo to POST /api/ai/scan
- [ ] **AI-02**: If no dog face detected, API returns error code NO_DOG_DETECTED and does not produce candidates
- [ ] **AI-03**: API returns { scanId, candidates: [{ petId, petName, photoUrl, city, score }] } with up to 10 matches (v1: mock data)
- [ ] **AI-04**: If zero candidates meet score threshold (0.5), API returns candidates: [] with message: "NO_MATCH_FOUND"

### PWA

- [ ] **PWA-01**: App is installable on iOS/Android via PWA (serwist service worker + Web App Manifest)

---

## v2 Requirements (Deferred)

### Authentication & Accounts
- **AUTH-V2-01**: Helper→Owner role promotion on first pet creation (single DB transaction)
- **AUTH-V2-02**: Account deletion: pets soft-deleted, open cases auto-closed, user data anonymized; id retained for audit trail
- **AUTH-V2-03**: Session management policy (JWT 1hr, refresh 7d rotated, concurrent sessions, force-logout on role change)

### QR Scan & Sightings
- **SCAN-V2-01**: Guest sighting submission (POST /api/sightings with petId, lat, lng, note, photo, reporterContact); server resolves caseId from petId
- **SCAN-V2-02**: EXIF metadata stripped from all uploaded photos before storage (sharp)
- **SCAN-V2-03**: Rate-limit: max 5 sightings per IP per hour at Vercel Edge middleware

### Lost Pet — Extended
- **LOST-V2-01**: Privacy warning when marking a private pet as lost (prompt to switch to public)
- **LOST-V2-02**: Geo-notifications: async push/email to Helpers within 5km on mark-lost (Supabase Edge Function)
- **LOST-V2-03**: Sighting management: owner can view sightings and mark each as helpful | false_report

### Notifications — Push & Email
- **NOTIF-V2-01**: Web Push via VAPID (no Firebase); subscription stored per browser/device in push_subscriptions table
- **NOTIF-V2-02**: Email fallback via Resend when push delivery fails or returns 410 Gone
- **NOTIF-V2-03**: Push permission prompt on first visit to /feed (not at registration)
- **NOTIF-V2-04**: Rate-limit: max 3 notifications per user per case (reset on reopen)

### Feed / Map — Extended
- **FEED-V2-01**: Marker clustering via react-leaflet-cluster (≥3 overlap); toggle map/list views
- **FEED-V2-02**: Lost case card list (bottom sheet): pet photo, name, area, dateLost, reward badge, "Send Sighting" button
- **FEED-V2-03**: Coordinates in API responses rounded to 2 decimal places for non-owners
- **FEED-V2-04**: Auto-refresh every 5 minutes; pull-to-refresh on mobile

### AI Scan — Extended
- **AI-V2-01**: Owner can confirm or reject AI match (PATCH /api/ai/matches/[matchId] {ownerConfirmed: true|false})
- **AI-V2-02**: Rate-limit: 10 AI scans per user per day
- **AI-V2-03**: AI scan images auto-deleted after 24h (PDPA); ai_scans.imageUrl nullified by cron job
- **AI-V2-04**: Only pets with privacy=public appear as AI candidates

### Admin Panel
- **ADMIN-V2-01**: Admin login requires Supabase Auth + TOTP MFA; first admin bootstrapped via seed script
- **ADMIN-V2-02**: Admin can view, ban, and unban users; sessions revoked on ban
- **ADMIN-V2-03**: Admin can manage pets, cases, photos; view metrics dashboard and AI stats; export AI training data

### Health — Vaccination
- **HEALTH-V2-01**: Owner can log vaccinations (vaccineName, givenDate, nextDueDate)
- **HEALTH-V2-02**: Reminder notifications: 3 days before nextDueDate + on the due date

### Infrastructure
- **INFRA-V2-01**: Vercel Cron jobs: stale-case-check (08:00 UTC), stale-case-close (08:05 UTC), vaccine-reminders (07:00 UTC), scan-image-purge (02:00 UTC)
- **INFRA-V2-02**: QR scan page performance target < 2s on mobile 3G

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app (iOS/Android) | PWA covers mobile use case for v1 |
| Payment / e-commerce | No reward payment system planned |
| Multi-language i18n | Thai + English implicit; no i18n framework |
| Real-time chat | Notification + contact info is the communication channel |
| SMS notifications | Web push + email covers v1 |
| Cat/other species face recognition | Dog only; v1 is already a stub |
| AI model retraining pipeline | Manual export for v2; v1 mock data |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| PET-01 | Phase 3 | Pending |
| PET-02 | Phase 3 | Pending |
| PET-03 | Phase 3 | Pending |
| HEALTH-01 | Phase 7 | Pending |
| HEALTH-02 | Phase 7 | Pending |
| SCAN-01 | Phase 5 | Pending |
| SCAN-02 | Phase 5 | Pending |
| SCAN-03 | Phase 5 | Pending |
| LOST-01 | Phase 4 | Pending |
| LOST-02 | Phase 4 | Pending |
| LOST-03 | Phase 4 | Pending |
| LOST-04 | Phase 4 | Pending |
| LOST-05 | Phase 4 | Pending |
| NOTIF-01 | Phase 5 | Pending |
| FEED-01 | Phase 6 | Pending |
| FEED-02 | Phase 6 | Pending |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |
| PWA-01 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-06-19*
*Last updated: 2026-06-19 — traceability populated after roadmap creation*
