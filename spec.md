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
| Phone | valid format, unique, OTP verify (expiry 5 min) |

**Flow:**
1. Guest enters Email+Password or Phone+OTP
2. Supabase Auth creates session
3. System creates `users` record with `role = helper`
4. Redirect → Pet Profile creation (if user wants to become Owner)

**Error responses:** HTTP status + machine-readable error code (e.g., `EMAIL_TAKEN`, `OTP_EXPIRED`)

#### Profile (Owner)

Fields: `name`, `nickname`, `phone` (verified), `address`, `social_links`, preferred contact method

> ⚠️ Phone verification required before contact info is displayed on the QR scan page

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

- Auto-generated when a pet is successfully created
- PNG + SVG stored in Supabase Storage
- URL stored in `pets.qr_code_url`
- QR links to `/pet/[petId]` (public, no auth required)

---

### 3.3 QR Scan Flow

**Endpoint:** `GET /pet/[petId]` (public page, mobile-responsive)

| Pet Status | UI |
|-----------|-----|
| active | Show basic info (name, photo, species, breed) |
| missing | Show prominent **alert banner** + "Contact Owner" button + "Send Location" button |

**Submit Sighting (no login required):**

```
POST /api/sightings
Body: { caseId, lat, lng, note, photo?, reporterContact? }
```

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

#### Nearby Notifications

- Geo Service finds Helpers within radius (default 5 km, configurable)
- Notification Queue sends push/email
- Rate-limit: max 3 notifications per user per case

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

- If a case remains `open` for **60 days** with no new sightings or owner activity → system sends email warning to Owner
- If no response within **7 days** after warning → system auto-closes case (status: `stale_closed`) and pet status reverts to `active`
- Admin can reopen or close cases at any time via admin panel
- `stale_closed` ≠ `closed` — separate states so admin knows the case closed itself rather than being owner-confirmed

---

### 3.5 Health & Wellness

#### Vaccination

```
POST /api/pets/[id]/vaccinations
Body: { vaccineName, givenDate, nextDueDate }
```

- System schedules notification 1–3 days before `nextDueDate`
- Vaccination list displayed on pet profile

#### Weight Tracking

```
POST /api/pets/[id]/weight-logs
Body: { weightKg, recordedAt }
```

- Stored as time series
- Displayed as line chart on pet profile (Recharts or Chart.js)

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
| **Upload** | Accept 1 or more images (multiple angles) |
| **Preprocess** | Check format/size, resize, normalize, crop dog face region |
| **Feature Extraction** | Send image to AI service → receive embedding vector (512-dim) |
| **Matching** | Search nearest neighbors in `pet_embeddings` using pgvector |
| **Post-filter** | Filter by species/breed/approx_age/region (optional) |
| **Return** | Top-10 candidates (thumbnail, name, city, match score, Contact button) |

**API:**

```
POST /api/ai/scan
Body: { image: File }
Response: { scanId, candidates: [{ petId, petName, photoUrl, city, score }] }
```

Rate-limit: 10 scans per user per day

#### 3.6.2 Human-in-the-loop

1. Helper clicks **Contact** on a candidate → sends contact info to Owner
2. Owner receives notification with the submitted photo
3. Owner responds:
   - **Yes** → confirms → Owner contacts Helper to retrieve pet
   - **No** → rejects → if multiple owners reject the same candidate, system lowers rank + records as negative example

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

**Auth:** Admin login via Supabase Auth (`role = admin`) + audit log for every action

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
- Browser subscription stored in `push_subscriptions` table (`userId`, `endpoint`, `keys`)
- Notification service (Next.js API route + `web-push` npm package) sends push from server
- Fallback: if push delivery fails → automatically send email instead
- Users can cancel push subscription in `/notifications/settings`

**Sighting notification includes:** map link + photo + time + reporter contact (if provided)

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

> **Note:** Helpers only see public fields of lost cases (`petName`, `lastKnownArea`, `dateLost`) — not the precise `lastKnownLat/Lng` (rounded to ~1 km grid before exposing)

---

## 4. Data Model (Prisma)

See `schema.prisma` for the full schema — main tables summary:

| Table | Purpose |
|-------|---------|
| `users` | User profiles, roles |
| `pets` | Pet profiles, status, QR |
| `pet_photos` | Pet images (Supabase Storage URL) |
| `weight_logs` | Weight time series |
| `vaccinations` | Vaccines + due dates |
| `vet_visits` | Vet visit records |
| `lost_cases` | Lost cases + location |
| `sightings` | Sighting reports |
| `ai_scans` | AI scan logs |
| `ai_matches` | Match results + owner confirmation |
| `pet_embeddings` | pgvector embedding (512-dim) |
| `notifications` | Notification inbox |

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
| **Scalability** | pgvector index for embedding search |

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
| PWA | `next-pwa` + Web App Manifest + Service Worker |
| Deploy | Vercel + Supabase free tier |

---

## 8. Screens / Pages (High-level)

| Screen | Role | Description |
|--------|------|-------------|
| `/pet/[petId]` | Guest | QR landing — pet summary, missing alert, sighting form |
| `/register` | Guest | Email/Phone registration |
| `/feed` | Helper+ | Map view + lost pets nearby |
| `/pets/new` | Helper+ | Create pet profile + upload photos (auto-promotes to Owner after submit) |
| `/pets/[id]` | Owner | Pet detail — health, QR, lost history |
| `/pets/[id]/lost` | Owner | Mark as lost form |
| `/scan` | Helper+ | Upload dog photo → AI match results |
| `/notifications` | All | Notification inbox |
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

