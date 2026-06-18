# KAOKAO — Product Specification

> **Version:** 1.0 · **Date:** 2026-06-18  
> **Stack:** Next.js 14 · Supabase (PostgreSQL + Auth + Storage) · Prisma · Tailwind/shadcn · Vercel

---

## 1. Overview

KAOKAO is a **Progressive Web App (PWA)** for **helping find lost pets** — accessible via any web browser and installable on mobile home screens (iOS/Android) without going through an App Store. It combines QR codes, geo-notifications, and AI dog face recognition so that owners and finders can coordinate quickly.

### Goals

- Let pet owners create profiles and QR codes for each pet
- Let anyone who finds a lost pet notify the owner immediately without logging in
- Notify helpers within a 5 km radius when a pet goes missing in their area
- Use AI to search for dogs from photos and return top-10 candidate pets for helpers to contact owners
- Track pet health (vaccinations, weight, vet visits)

### Out of Scope (v1)

- Native mobile app (iOS/Android) — PWA covers mobile use case for v1
- Payment / e-commerce
- Multi-language i18n
- Real-time chat (use notification + contact info instead)

---

## 2. Roles & Permissions

| Role | Capabilities |
|------|-------------|
| **Guest** | Scan QR, view basic pet info (public only), submit sighting + location without logging in |
| **Helper** | Everything Guest can do + register, view feed/map, receive push notifications within 5 km radius, report sightings, use AI scan |
| **Owner** | Everything Helper can do + create/edit pet profile, mark lost/found, view sightings, manage health records, confirm AI matches |
| **Admin** | Manage users/pets/cases, moderate content, view metrics, control AI monitoring |

Role is stored in `users.role` (enum: `helper` | `owner` | `admin`)

---

## 3. Functional Modules

---

### 3.1 User Management

#### Registration

| Field | Validation |
|-------|-----------|
| Email | valid format, unique |
| Password | min 8 chars |
| Phone | valid format, unique — verified by OTP at **contact-display time**, not at registration |

**Flow:**
1. Guest enters Email + Password
2. Supabase Auth sends verification email — user must click link before session is activated
3. System creates `users` record with `role = helper`
4. Redirect → Pet Profile creation (if user wants to become Owner)

> Phone OTP verification is deferred to the moment owner contact info is first displayed on the QR scan page. Requiring phone at registration adds unnecessary friction and requires a paid SMS provider.

**Error responses:** HTTP status + machine-readable error code (e.g., `EMAIL_TAKEN`, `OTP_EXPIRED`, `EMAIL_NOT_VERIFIED`)

#### Password Reset

**Flow:**
1. User clicks "Forgot password" on login page
2. `POST /api/auth/reset-password` → Supabase sends reset email (link expiry: 1 hour)
3. User clicks link → redirected to `/reset-password?token=...`
4. User enters new password (min 8 chars) → `POST /api/auth/update-password`
5. All existing sessions invalidated on success

**Error responses:** `RESET_TOKEN_EXPIRED`, `RESET_TOKEN_INVALID`

#### Session Management

- JWT access token lifetime: **1 hour** (Supabase default)
- Refresh token lifetime: **7 days**; rotated on every refresh
- Concurrent sessions: allowed (multiple devices)
- Force-logout on role change: after Helper → Owner promotion, server-side revalidation via `router.refresh()` ensures new JWT claims are fetched before any owner route is accessed
- Session invalidation on account deletion: all refresh tokens revoked immediately

#### Profile (Owner)

Fields: `name`, `nickname`, `phone` (verified), `address`, `social_links`, preferred contact method (`phone` | `email` | `social`)

> ⚠️ Phone OTP verification required before contact info is displayed on the QR scan page. Until verified, the "Contact Owner" button on the QR page shows the sighting form only — no direct contact details.

#### Role Promotion: Helper → Owner

Role is promoted **automatically** when a Helper successfully creates a pet profile for the first time:

1. Helper clicks "Add Pet" → fills pet form → submits
2. System creates `pets` record
3. System updates `users.role = 'owner'` (single DB transaction)
4. Session token refresh → UI immediately shows owner features

> Role does not downgrade back to `helper` even if all pets are deleted (to preserve audit trail)

#### Account Deletion

When an Owner deletes their account:

1. All of the owner's pets are **soft-deleted** (`pets.deletedAt = now()`) — not immediately removed from DB
2. `/pet/[petId]` page shows "This QR code is no longer active" instead of pet info
3. Any `open` lost cases are auto-closed as `stale_closed` simultaneously
4. User data is anonymized (name, phone, email removed) but `id` is retained for sighting audit trail

> Admin can still see soft-deleted pets and restore them within 30 days; after that they are permanently deleted

#### Location (Helper/Owner)

Users store a home location (`homeLat`, `homeLng`) used for geo-notification radius matching. Captured:
- Optional at registration (skip allowed)
- Prompted again on first visit to `/feed`
- Editable at any time in `/settings/location`

> Location is never displayed publicly. Used only for server-side radius queries.

#### Multi-pet

Owners can add unlimited pets, but the Lost Pet workflow won't function until at least 1 pet exists

---

### 3.2 Pet Profile

#### Create / Update

| Field | Type | Required |
|-------|------|----------|
| name | String | ✅ |
| species | `dog` \| `cat` \| `other` | ✅ |
| breed | String | ❌ |
| gender | `male` \| `female` \| `unknown` | ✅ |
| color | String | ❌ |
| distinct_features | String | ❌ |
| birth_date / approx_age | Date / Int | ❌ (either one) |
| status | `active` \| `missing` | ✅ (default: active) |
| privacy | `public` \| `private` | ✅ (default: public) |
| photos | File[] (Supabase Storage) | ❌ (recommended) |

#### QR Code Generation

- Auto-generated when a pet is successfully created (using `qrcode` npm package)
- PNG + SVG stored in Supabase Storage
- URL stored in `pets.qr_code_url`
- QR links to `/pet/[petId]` (public, no auth required)

#### QR Code Delivery

After pet creation, Owner is redirected to `/pets/[petId]` which shows:
- Inline QR code preview (PNG)
- **Download PNG** button → triggers browser download of QR image from Storage
- **Download SVG** button → triggers browser download of SVG (for print shops)
- **Print** button → opens browser print dialog with QR centered on page

> This screen is also reachable at any time from the pet detail page under "QR Code" tab.

---

### 3.3 QR Scan Flow

**Endpoint:** `GET /pet/[petId]` (public page, mobile-responsive)

| Pet Status | UI |
|-----------|-----|
| active | Show basic info (name, photo, species, breed) + "I found this pet" button (opens sighting form — no caseId required) |
| missing | Show prominent **alert banner** + "Contact Owner" button + "Send Location" button |

**"Contact Owner" button behavior:**
- If owner's phone is **verified**: reveals owner's preferred contact info (phone or email per their preference)
- If owner's phone is **not verified**: button is hidden; only the sighting form is shown

**Submit Sighting — caseId resolution:**

```
POST /api/sightings
Body: { petId, lat, lng, note, photo?, reporterContact? }
```

The server resolves `caseId` from `petId`:
- Pet is `missing` → looks up the single `open` `LostCase` for that pet; links sighting to it
- Pet is `active` → creates a free-form sighting (no caseId) as a general finder report; Owner is still notified

- `reporterContact` (phone/email) is optional — allows owner to reply
- On successful submit → Notification Service immediately notifies Owner

**Anti-abuse (unauthenticated endpoint):**
- Rate-limit: max **5 sightings per IP per hour** (enforced at Vercel Edge middleware)
- Honeypot field in form to filter simple bots
- Photo upload limit: max 5 MB, JPEG/PNG/WEBP only; scanned with sharp before storing

---

### 3.4 Lost Pet Recovery

#### Mark as Lost

Owner clicks Mark as Lost on pet profile and fills in:

```
POST /api/lost-cases
Body: { petId, dateLost, lastKnownAddress, lastKnownLat?, lastKnownLng?, reward?, notes?, photo? }
```

- Creates `LostCase` record (status: `open`)
- Pet status changes to `missing`
- Triggers nearby notification
- **Guard:** If the pet already has an `open` `LostCase`, the API returns `409 CASE_ALREADY_OPEN` — no duplicate cases allowed. Owner must close the existing case first.
- **Privacy conflict:** If pet `privacy = private`, the system warns the Owner before creating the case: "This pet is set to private and will not appear in the Helper feed or AI search. Switch to public to maximize visibility?" Owner must confirm to proceed (privacy can be changed inline).

**Reward display:** If `reward` is set, it is shown:
- On the QR scan page alert banner
- On the Helper feed lost-case card
- In sighting notification emails to the Owner (for context)

**Geo-notification center:** Uses `lastKnownLat/Lng` if provided. Falls back to Owner's `homeLat/homeLng` if coordinates are omitted.

#### Nearby Notifications

- Geo Service queries `users` where `role IN ('helper','owner')` and `ST_DWithin(home_location, case_point, 5000)` (PostGIS, meters)
- Helpers with no stored home location are excluded from radius queries
- Notification Queue sends push/email **asynchronously** (Supabase Edge Function enqueues jobs — avoids Vercel 50s timeout on large fan-outs)
- Rate-limit: max **3 total notifications** (across all channels) per user per case; resets if case is reopened after being closed

#### Sighting Handling

- Every sighting is logged in `sightings` table
- Owner can view and mark each sighting: `helpful` | `false_report`
- Owner can add notes to sightings

#### Close Case

`LostCase` status enum: `open` | `closed` | `stale_closed`

```
PATCH /api/lost-cases/[id]
Body: { status: "closed" | "open" }
```

| Status | Set by | Meaning |
|--------|--------|---------|
| `open` | Owner, Admin | Open case / reopen |
| `closed` | Owner, Admin | Owner confirms pet has been found |
| `stale_closed` | System only | Auto-closed due to inactivity (see Auto-close Policy) |

- When status changes from `open` → `closed` or `stale_closed`: pet status reverts to `active`
- Admin can reopen any status via `PATCH /admin/lost-cases/[id]`

#### Auto-close Policy (Stale Cases)

**"Owner activity"** resets the 60-day clock — any of:
- New sighting is submitted on the case (even by a guest)
- Owner marks a sighting as `helpful` or `false_report`
- Owner adds a note to any sighting
- Owner calls `PATCH /api/lost-cases/[id]` to update any field (notes, reward, photo)

Actions that do **not** reset the clock:
- Owner simply views the case page
- Owner views notifications

**Flow:**
1. Cron `stale-case-check` (daily): find all `open` cases where `lastActivityAt < now() - 60 days`
2. Send `case_stale_warning` in-app notification + email to Owner; set `LostCase.staleWarningSentAt = now()`
3. Cron `stale-case-close` (daily): find cases where `staleWarningSentAt IS NOT NULL` and `lastActivityAt < staleWarningSentAt - 7 days` with no new activity after warning
4. Auto-close → `status = stale_closed`, `pets.status = active`

`lastActivityAt` field must be added to `LostCase` schema, updated on every activity listed above.

- Admin can reopen or close cases at any time via admin panel
- `stale_closed` ≠ `closed` — separate states so admin knows the case closed itself rather than being owner-confirmed

---

### 3.5 Health & Wellness

#### Vaccination

```
POST /api/pets/[id]/vaccinations
Body: { vaccineName, givenDate, nextDueDate }
```

- System sends **one** reminder notification **3 days before** `nextDueDate`
- If no action taken, sends a **second** reminder **on the due date**
- No further notifications after due date passes (no overdue escalation in v1)
- Vaccination list displayed on pet profile

#### Weight Tracking

```
POST /api/pets/[id]/weight-logs
Body: { weightKg, recordedAt }
```

- Stored as time series
- Displayed as line chart on pet profile (**Recharts** — chosen for smaller bundle size and React-native composability)

#### Vet Visits

```
POST /api/pets/[id]/vet-visits
Body: { visitDate, clinicInfo?, note? }
```

---

### 3.6 Dog Face Recognition (AI Module)

#### 3.6.1 Pipeline

```
Upload → Preprocess → Feature Extraction → Matching → Post-filter → Return Top-10
```

| Step | Detail |
|------|--------|
| **Upload** | Accept **1 image per scan** (single file); UI guides user to upload best angle |
| **Preprocess** | Check format/size, resize, normalize, crop dog face region; EXIF stripped via `sharp` before storage |
| **Species guard** | If pet species in upload context ≠ `dog`, or if preprocessing detects no dog face, return `NO_DOG_DETECTED` error — do not proceed to embedding |
| **Feature Extraction** | Send image to AI service → receive embedding vector (512-dim) |
| **Matching** | Search nearest neighbors in `pet_embeddings` using pgvector HNSW index |
| **Post-filter** | Filter by species/breed/approx_age/region (optional) |
| **Return** | Up to 10 candidates (thumbnail, name, city, match score, Contact button) |

**API:**

```
POST /api/ai/scan
Body: { image: File }
Response: { scanId, candidates: [{ petId, petName, photoUrl, city, score }] }
```

**No-match state:** If zero candidates meet the minimum score threshold (0.5), return `candidates: []` with `message: "NO_MATCH_FOUND"`. UI shows: "No matching dogs found. Try a clearer photo facing the camera."

Rate-limit: 10 scans per user per day

#### 3.6.2 Human-in-the-loop

1. Helper clicks **Contact** on a candidate → sends contact info to Owner
2. Owner receives notification with the submitted photo
3. Owner responds:
   - **Yes** → confirms → Owner contacts Helper to retrieve pet
   - **No** → rejects → recorded as negative example; rank adjustment deferred to v2 model retraining (v1 stub returns static mock scores)

```
PATCH /api/ai/matches/[matchId]
Body: { ownerConfirmed: true | false }
```

#### 3.6.3 Privacy & Safety

- Only pets with `privacy = public` appear as candidates
- Every scan is logged (who, when, image reference) in `ai_scans`
- Rate-limit: 10 scans/user/day

**Image Retention Policy (PDPA):**
- Images uploaded for scanning are stored temporarily in Supabase Storage — **auto-deleted after 24 hours**
- `ai_scans` record is retained (stores metadata: userId, timestamp, scanId) but `imageUrl` is nullified after deletion
- Users can request immediate deletion of their own scan record via `DELETE /api/ai/scans/[scanId]`
- Privacy Policy states images are used for matching only and will not be used to train models without explicit consent (v1)

#### 3.6.4 Admin Monitoring

- Dashboard: scan count, top false positives, per-owner false positive rate
- Export labeled pairs (positive/negative) for model retraining
- v1 AI is a **Stub** (mock data) — real model wired in v2

---

### 3.7 Admin Panel

**Auth:** Admin login via Supabase Auth (`role = admin`) + TOTP MFA (required — enforced at middleware) + audit log for every action

#### Admin Bootstrap

First admin account is created via a one-time CLI seed script (`scripts/seed-admin.ts`):
```
npx ts-node scripts/seed-admin.ts --email admin@example.com --password <strong-password>
```
Script sets `users.role = 'admin'` directly via service role. Must be run once before production deploy. Subsequent admins can only be promoted by an existing admin via `PATCH /admin/users/[id]` (`{ role: 'admin' }`).

#### Ban Behavior

When an admin bans a user (`PATCH /admin/users/[id]` `{ banned: true }`):
- All active sessions revoked immediately (Supabase `admin.auth.signOut`)
- User cannot log in; `401 USER_BANNED` returned on auth attempt
- User's **public** pet QR pages remain accessible (guests can still submit sightings)
- User's **open** lost cases remain visible to Helpers (case is not auto-closed)
- Admin can unban at any time; user must log in again to get a new session

| Capability | Endpoint |
|-----------|---------|
| View/search users | `GET /admin/users` |
| Ban/Unban user | `PATCH /admin/users/[id]` |
| View/manage pets | `GET /admin/pets` |
| View lost cases | `GET /admin/lost-cases` |
| Resolve/close case | `PATCH /admin/lost-cases/[id]` |
| Moderate photos | `DELETE /admin/photos/[id]` |
| Metrics dashboard | `GET /admin/metrics` |
| AI monitoring | `GET /admin/ai/stats` |
| Export training data | `GET /admin/ai/export` |

---

### 3.8 Notifications

#### Events that trigger notifications

| Event | Recipients | Channel |
|-------|-----------|---------|
| QR scan + sighting submitted | Owner | In-app + Email |
| Pet lost nearby (5 km) | Helpers in radius | In-app + Push |
| AI match result | Finder + Owners (opt-in) | In-app + Email |
| Owner confirms yes/no | Finder | In-app |
| Vaccine due (1–3 days ahead) | Owner | In-app + Email |

**Channels:** In-app · Email · Web Push · SMS (optional, v2)

**Push Notification Delivery (Web Push / VAPID):**
- Uses **Web Push API + VAPID keys** — no Firebase dependency (reduces vendor lock-in)
- Browser subscription stored in `push_subscriptions` table (`userId`, `endpoint`, `keys`, `createdAt`)
- Notification service (Next.js API route + `web-push` npm package) sends push from server
- Fallback: if push delivery fails (including `410 Gone` for expired subscriptions) → automatically send email instead; `410` responses also trigger deletion of the stale subscription record
- Users can cancel push subscription in `/notifications/settings`
- **One subscription per browser/device** allowed; no hard limit per user, but stale endpoints pruned on delivery failure

**Push permission prompt timing:**
- Permission is requested on first visit to `/feed` (not on registration — reduces denial rate)
- If denied, user sees a non-intrusive banner on `/notifications` explaining how to re-enable in browser settings
- No repeated prompts if previously denied

> **iOS note:** Web Push only works for PWA installed to home screen (iOS 16.4+). In-browser Safari visitors fall back to email only. No action required — email fallback handles this automatically.

**Sighting notification includes:** map link + photo + time + reporter contact (if provided)

#### Background Jobs (Scheduler)

All time-based operations use **Vercel Cron Jobs** (defined in `vercel.json`):

| Job | Schedule | Action |
|-----|----------|--------|
| `stale-case-check` | Daily 08:00 UTC | Find `open` cases with no activity for 60 days → send `case_stale_warning` notification + email |
| `stale-case-close` | Daily 08:05 UTC | Find cases where warning was sent 7+ days ago with no response → auto-close as `stale_closed` |
| `vaccine-reminders` | Daily 07:00 UTC | Find vaccinations due in 3 days or today → send reminder notification + email |
| `scan-image-purge` | Daily 02:00 UTC | Find `ai_scans` where `createdAt < now() - 24h` and `imageUrl IS NOT NULL` → delete from Storage → nullify `imageUrl` |

> Vercel Hobby tier: max 1 cron/day. Pro tier required for multiple daily jobs. Alternatively, use Supabase `pg_cron` extension for all four jobs on the database side.

---

### 3.10 Feed / Map

**Map library:** `react-leaflet` + OpenStreetMap tiles (no API key, no cost)

**Layout:** Full-screen map with a slide-up bottom sheet listing cards. Toggle between map-dominant and list-dominant views via a tab control.

**Initial state:**
- Map centers on user's `homeLat/homeLng` at zoom 13 (≈ 5 km visible radius)
- If no home location set → prompt banner: "Set your location to see pets near you" → links to `/settings/location`

**Markers:**
- One marker per `open` lost case
- Marker color: red for cases posted < 24 hrs ago; orange for < 7 days; grey for older
- Clicking marker opens a popup with: pet photo thumbnail, pet name, species, `dateLost`, "View" button

**Clustering:**
- Use `react-leaflet-cluster` — clusters markers when ≥ 3 overlap at current zoom
- Cluster badge shows count

**Lost case card (bottom sheet / list view):**

| Field | Source |
|-------|--------|
| Pet photo thumbnail | `pet_photos` (first photo) |
| Pet name + species + breed | `pets` |
| Area | `lastKnownArea` (text, not coordinates) |
| Date lost | `LostCase.dateLost` |
| Reward badge | shown if `reward` is set |
| "Send Sighting" button | opens sighting form pre-filled with `caseId` |

**Data source:**
```
GET /api/lost-cases?lat={homeLat}&lng={homeLng}&radius=5000
Response: { cases: [{ caseId, petId, petName, species, breed, photoUrl, lastKnownArea, dateLost, reward?, lat_rounded, lng_rounded }] }
```
Returns only `open` cases within 5 km of supplied coordinates. Coordinates in response rounded to 2 decimal places.

**Refresh:** Pull-to-refresh on mobile; auto-refresh every 5 minutes while page is active.

---

### 3.9 Row-Level Security (RLS) Policies

Supabase RLS is always enabled — every table must have explicit policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `users` | Record owner only; Admin sees all | Supabase Auth (trigger) | Record owner | Admin only |
| `pets` | `privacy=public` → everyone; `privacy=private` → Owner + Admin | Owner (auth) | Owner | Owner |
| `lost_cases` | Case owner + Admin; Helpers see `open` cases (id, location, pet summary only) | Owner | Owner + Admin | Admin only |
| `sightings` | Case owner + Admin + reporter (if session exists) | Everyone (including Guest) | Case owner (mark helpful/false_report) | Admin only |
| `pet_embeddings` | System only (service role) | System | System | System |
| `ai_scans` | Scan owner + Admin | Helper+ (auth required) | — | Admin only |
| `notifications` | Notification owner | System (service role) | Owner (mark read) | — |

> **Note:** Helpers only see public fields of lost cases (`petName`, `lastKnownArea`, `dateLost`) — not the precise `lastKnownLat/Lng`. Coordinates are rounded to **2 decimal places** (≈ 1.1 km precision) before being returned in any API response accessible to non-owners. Example: `13.756331` → `13.76`. Owner always receives full precision.

---

## 4. Data Model (Prisma)

See `schema.prisma` for the full schema — main tables summary:

| Table | Purpose |
|-------|---------|
| `users` | User profiles, roles, `homeLat`/`homeLng` for geo queries |
| `pets` | Pet profiles, status, QR |
| `pet_photos` | Pet images (Supabase Storage URL) |
| `weight_logs` | Weight time series |
| `vaccinations` | Vaccines + due dates |
| `vet_visits` | Vet visit records |
| `lost_cases` | Lost cases + location + `lastActivityAt` + `staleWarningSentAt` |
| `sightings` | Sighting reports |
| `ai_scans` | AI scan logs |
| `ai_matches` | Match results + owner confirmation |
| `pet_embeddings` | pgvector embedding (512-dim) |
| `notifications` | Notification inbox |
| `push_subscriptions` | Web Push VAPID endpoint + keys per browser/device |

#### push_subscriptions Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `userId` | UUID | FK → users |
| `endpoint` | Text | Push service URL |
| `p256dh` | Text | Public key |
| `auth` | Text | Auth secret |
| `createdAt` | Timestamp | |

> Must be added to `schema.prisma` before implementing push notifications.

#### notifications Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `userId` | UUID | FK → users (recipient) |
| `type` | enum | `sighting` \| `pet_lost_nearby` \| `ai_match` \| `owner_reply` \| `vaccine_due` \| `case_stale_warning` |
| `payload` | JSONB | Additional data e.g. `{ caseId, petName, mapUrl }` |
| `read` | Boolean | default `false` |
| `createdAt` | Timestamp | |

> Notifications are never deleted — kept as inbox history; owners can only mark them as read

---

## 5. API Routes (Next.js App Router)

```
app/
├── (public)/
│   └── pet/[petId]/              # QR scan landing page
├── (auth)/
│   ├── register/
│   └── login/
├── (app)/
│   ├── feed/                     # Map + lost pets feed
│   ├── pets/
│   │   ├── new/
│   │   └── [petId]/
│   │       ├── edit/
│   │       ├── health/
│   │       └── lost/
│   ├── scan/                     # AI scan upload page
│   └── notifications/
├── admin/
│   ├── users/
│   ├── pets/
│   ├── cases/
│   └── ai/
└── api/
    ├── auth/
    ├── pets/
    ├── lost-cases/
    ├── sightings/
    ├── ai/
    │   ├── scan/
    │   └── matches/[matchId]/
    ├── notifications/
    └── admin/
```

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---------|------------|
| **Performance** | QR scan page load < 2s (mobile 3G) |
| **Availability** | Vercel + Supabase free tier (no SLA — known limitation for v1; upgrade before production launch) |
| **Security** | HTTPS only, Supabase RLS, phone verification before displaying contact info |
| **Rate Limiting** | AI scan 10/user/day · Nearby notification max 3/user/case |
| **Privacy** | Pets with `privacy=private` do not appear in AI candidates |
| **Accessibility** | Responsive mobile-first (375px breakpoint) |
| **Scalability** | pgvector **HNSW** index (`m=16, ef_construction=64`) on `pet_embeddings.embedding`; PostGIS **GiST** index on `users.home_location` (`geography` type) for radius queries |

---

## 7. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase PostgreSQL + pgvector extension |
| Auth | Supabase Auth (Email+Password, Phone+OTP) |
| ORM | Prisma |
| File Storage | Supabase Storage (pet photos, QR PNG/SVG) |
| Styling | Tailwind CSS + shadcn/ui |
| AI (v1) | Stub API Route (mock) — real model wired in v2 |
| PWA | `serwist` (maintained next-pwa fork) + Web App Manifest + Service Worker |
| QR Generation | `qrcode` npm package (PNG + SVG output) |
| Charts | `recharts` |
| Image processing | `sharp` (resize, format convert, EXIF strip) |
| Map | `react-leaflet` + `react-leaflet-cluster` + OpenStreetMap tiles |
| Deploy | Vercel + Supabase free tier |

---

## 8. Screens / Pages (High-level)

| Screen | Role | Description |
|--------|------|-------------|
| `/pet/[petId]` | Guest | QR landing — pet summary, missing alert, sighting form |
| `/register` | Guest | Email/Phone registration |
| `/feed` | Helper+ | Map view + lost pets nearby (see §3.10) |
| `/pets/new` | Helper+ | Create pet profile + upload photos (auto-promotes to Owner after submit) |
| `/pets/[id]` | Owner | Pet detail — health, QR, lost history |
| `/pets/[id]/lost` | Owner | Mark as lost form |
| `/scan` | Helper+ | Upload dog photo → AI match results |
| `/notifications` | All | Notification inbox |
| `/notifications/settings` | All | Push notification preferences + cancel subscription |
| `/settings/location` | Helper+ | Set/update home location for geo-notifications |
| `/reset-password` | Guest | Password reset (via email link) |
| `/admin/*` | Admin | Management dashboard |

---

## 9. MVP Scope vs. Future

| Feature | MVP (v1) | Future (v2+) |
|---------|---------|-------------|
| QR scan + sighting | ✅ | — |
| Lost pet + nearby notification | ✅ | — |
| AI dog face recognition (stub) | ✅ stub | ✅ real model |
| Health & wellness tracking | ✅ | — |
| Admin panel | ✅ | — |
| PWA (installable, mobile-ready) | ✅ | — |
| SMS notifications | ❌ | ✅ |
| Real-time chat | ❌ | ✅ |
| Native mobile app (iOS/Android) | ❌ | ✅ |
| AI retraining pipeline | ❌ | ✅ |
| Cat face recognition | ❌ | ✅ |

---

