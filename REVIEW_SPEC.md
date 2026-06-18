# REVIEW_SPEC.md — KAOKAO Spec Review

> **Reviewer:** Senior PM / Solution Architect  
> **Date:** 2026-06-18  
> **Spec version:** 1.0  
> **Severity:** 🔴 Blocker · 🟠 High · 🟡 Medium · 🟢 Low

---

## 1. Missing Requirements

### 1.1 Auth & Account

| # | Severity | Finding |
|---|----------|---------|
| M-01 | 🔴 | **No password reset flow.** Spec defines registration but zero mention of forgot-password / reset link. Core auth requirement. |
| M-02 | 🟠 | **Email verification undefined.** Phone OTP is specified; email is not verified. Unverified emails expose notification delivery and account recovery. |
| M-03 | 🟠 | **No session management policy.** Token lifetime, concurrent session handling, and forced-logout on role change (beyond the promotion case) are absent. |
| M-04 | 🟠 | **Admin bootstrap undefined.** No mechanism to create the first admin. Seeding, invite-only, or superadmin CLI command must be defined before deploy. |
| M-05 | 🟡 | **Ban behavior not specified.** "Ban/Unban user" exists in admin panel but spec does not define: can banned users view public QR pages? Are their open cases auto-closed? Are their pets hidden? |

### 1.2 Core Flows

| # | Severity | Finding |
|---|----------|---------|
| M-06 | 🔴 | **Guest sighting `caseId` source unspecified.** API body requires `caseId`, but the QR landing page shows a sighting form for guests. How does the form know the caseId when the guest arrives via QR code (which encodes `petId`, not `caseId`)? Lookup logic not defined. |
| M-07 | 🔴 | **Sighting for active (non-missing) pet undefined.** The QR page shows different UI by status, but the spec only defines sighting submission in the context of a missing pet. If an active pet is scanned, can a sighting still be filed? No caseId exists then. |
| M-08 | 🟠 | **Privacy=private + status=missing conflict not handled.** An Owner can mark a private pet as lost, but private pets are excluded from the Helper feed and AI candidates. The lost-pet workflow becomes ineffective silently. Either warn the Owner or force-override privacy when marking lost. |
| M-09 | 🟠 | **Simultaneous lost cases not addressed.** Can a pet have two open lost cases? The API for marking lost does not reference an idempotency check. The schema note says `LostCase` — plural is implied but the guard condition is missing. |
| M-10 | 🟠 | **"Contact Owner" button behavior undefined.** The QR page shows a "Contact Owner" button for missing pets, separate from the sighting form. Does it reveal the owner's phone/email directly? Route through an in-app message? The distinction matters for privacy and the no-chat scope decision. |
| M-11 | 🟡 | **QR code delivery to owner not specified.** PNG + SVG are stored in Supabase Storage, but no screen or flow defined for the owner to download or view the generated QR code. This is a primary user action. |
| M-12 | 🟡 | **Reward field display unspecified.** `reward` is stored as `String?` in `LostCase`, but no spec for when/where it is displayed (QR page? Helper feed? Sighting confirmation?). |

### 1.3 Notifications & Scheduling

| # | Severity | Finding |
|---|----------|---------|
| M-13 | 🔴 | **No cron/scheduler mechanism defined.** Auto-close (60-day stale), stale-warning email (7-day), and vaccination reminders all require background jobs. Next.js serverless has no built-in cron. Vercel Cron (Hobby: 1 job/day) or Supabase `pg_cron` must be explicitly chosen. |
| M-14 | 🟠 | **Vaccination reminder timing ambiguous.** "1–3 days before nextDueDate" — is one notification sent (at what interval?), or up to three notifications on days −3, −2, −1? No overdue notification defined. |
| M-15 | 🟡 | **`push_subscriptions` table missing from schema.prisma.** CLAUDE.md flags this. Spec lists the table fields but it is absent from Prisma schema. Blocks implementation. |
| M-16 | 🟡 | **Push permission prompt strategy not defined.** No UX flow for when/how to ask for push notification permission. Premature prompts cause high denial rates on mobile. |

### 1.4 AI Module

| # | Severity | Finding |
|---|----------|---------|
| M-17 | 🟠 | **AI scan for non-dog input undefined.** Species enum includes `cat` and `other`. Spec does not define behavior when a cat photo (or non-pet photo) is uploaded to `/api/ai/scan`. No error state defined. |
| M-18 | 🟡 | **AI scan "no matches" state not defined.** What is returned when zero candidates meet the threshold? The spec implies top-10 always returned. Empty result UX is missing. |

### 1.5 User Location for Geo Notifications

| # | Severity | Finding |
|---|----------|---------|
| M-19 | 🔴 | **Helper location storage not defined.** Geo Service must find "Helpers within 5 km" but the spec never defines how or when a Helper's location is stored. No `location` field in users schema, no location-capture flow at registration or login. This is required for the core geo-notification feature. |

---

## 2. Ambiguous Requirements

| # | Severity | Ambiguity |
|---|----------|-----------|
| A-01 | 🔴 | **AI scan API accepts `image: File` (singular) but the pipeline section says "1 or more images (multiple angles)."** Contradictory. Pick one and update the other. |
| A-02 | 🟠 | **"3 notifications per user per case" — per channel or total?** A user could receive 1 push + 1 email = 2 notifications from a single case event. Does that count as 2 of the 3? Define the unit. |
| A-03 | 🟠 | **"Owner activity" for stale-case detection is undefined.** The auto-close policy triggers on "no new sightings or owner activity." What counts as owner activity? Viewing the case? Adding a note? Only explicit actions? |
| A-04 | 🟠 | **"Lower rank" after multiple owner rejections in AI matching** — session-scoped or permanent? If permanent, it is a model update, which contradicts v1 being a stub. Clarify scope. |
| A-05 | 🟠 | **Geo-notification center point undefined.** "Helpers within 5 km" of what? `lastKnownLat/Lng` (optional in the API)? If coordinates not provided by owner, does the system fall back to owner's registered address? Or no notifications sent? |
| A-06 | 🟡 | **Rounding precision for helper-visible location** — "rounded to ~1 km" appears only in CLAUDE.md, not in spec. Must be formally specified (e.g., round to 2 decimal places ≈ 1.1 km, or snap to H3 resolution-8 hexagon). |
| A-07 | 🟡 | **Weight chart library undecided.** Spec says "Recharts or Chart.js." Pick one — this affects bundle size and maintenance. |
| A-08 | 🟡 | **Session token refresh mechanism for role promotion unspecified.** "Session token refresh → UI immediately shows owner features" — re-issue JWT? Client-side `router.refresh()`? Must be defined to prevent a stale-session bug where the UI still shows Helper state. |
| A-09 | 🟡 | **"Stale closed" vs email-only warning inconsistency.** Auto-close policy says "system sends email warning." The `notifications` type enum includes `case_stale_warning`. Is this also an in-app notification, or email only? Both places say different things. |

---

## 3. Technical Risks

| # | Severity | Risk |
|---|----------|------|
| T-01 | 🔴 | **pgvector + Prisma type gap.** `Unsupported("vector(512)")` means all embedding queries must use `$queryRaw`. No type safety, no ORM query builder, harder refactoring. Plan for a thin raw-SQL abstraction layer early. |
| T-02 | 🔴 | **Geo query without spatial index.** "Helpers within 5 km" on a plain `users` table requires either PostGIS (`ST_DWithin`) or a manual bounding-box pre-filter + Haversine. Neither is mentioned. Full table scan at scale is a production incident. |
| T-03 | 🔴 | **`next-pwa` compatibility with Next.js 14 App Router.** `next-pwa` (gilbarbara fork or the original) has known breakage with the App Router's `app/` directory and RSC. Confirm compatibility or switch to `serwist` (the maintained fork) before building. |
| T-04 | 🟠 | **Supabase Phone Auth cost.** Phone OTP via Supabase requires a connected Twilio (or similar) SMS provider. Supabase free tier does not include SMS sending. This is a paid line item not modeled in the free-tier architecture. |
| T-05 | 🟠 | **24-hour scan image deletion requires a cron job.** There is no serverless trigger that fires 24 hours after an upload without a scheduler. Same root issue as M-13. Supabase Storage lifecycle policies do not exist (as of 2026); must be implemented manually. |
| T-06 | 🟠 | **Web Push on iOS requires PWA installed to home screen.** iOS 16.4+ supports Web Push only for installed PWAs, not in-browser Safari. Users who don't install the PWA will silently not receive push notifications. The email fallback covers this, but it is a significant UX gap that should be documented and communicated. |
| T-07 | 🟠 | **QR code generation library not in stack.** PNG + SVG generation at pet-creation time requires a library (e.g., `qrcode`, `qr-code-styling`). Not listed in the tech stack. Must be chosen before the feature is built. |
| T-08 | 🟡 | **`sharp` for sighting photos is misframed.** Spec says photos are "scanned with sharp before storing." `sharp` is an image processing library, not a security scanner. It validates/converts format and resizes — it does not detect malware or CSAM. Clarify intent: format validation only, or is a separate scanning service (e.g., Google Vision SafeSearch) expected? |
| T-09 | 🟡 | **Supabase free tier auto-pause.** Free tier projects pause after 1 week of inactivity. For a product in active development, a staging or production database could pause unexpectedly. Plan for paid tier before any public testing. |
| T-10 | 🟡 | **AI external service dependency undefined for v2.** The stub is fine for v1, but the v2 transition requires an embedding service (e.g., a self-hosted model, AWS Rekognition, or a custom API). Latency, cost, and fallback strategy should be outlined now so v2 architecture is not designed into a corner. |

---

## 4. UX Risks

| # | Severity | Risk |
|---|----------|------|
| U-01 | 🔴 | **Phone OTP at registration is high friction.** Requiring phone verification to become a Helper (the entry role) adds significant friction before a user can help find a lost pet. Consider deferring phone verification to only when contact info is displayed, not at registration. |
| U-02 | 🟠 | **No "download your QR code" screen defined.** The primary Owner action after creating a pet is printing the QR tag. If this screen is missing at launch, the core value proposition is broken for new owners. |
| U-03 | 🟠 | **No chat = contact info deadend.** If a finder submits a sighting with no `reporterContact`, there is no way for the owner to follow up. The form should more strongly encourage contact info or warn the owner that no follow-up is possible. |
| U-04 | 🟠 | **Silent role promotion.** When a Helper submits their first pet, they become an Owner with no explicit confirmation screen. This could confuse users who see new UI features appear unexpectedly. Add a transition acknowledgment. |
| U-05 | 🟠 | **Feed/map UX completely unspecified.** The `/feed` screen is the main Helper experience but has no defined map library, zoom behavior, marker design, clustering strategy, or list/map toggle. This is a significant design gap. |
| U-06 | 🟡 | **AI scan "top-10" list UX not defined.** No pagination, no "match score" threshold display, no guidance on what score means "likely match." Users may act on low-confidence results. |
| U-07 | 🟡 | **Offline/PWA experience undefined.** "PWA" is listed in the stack but no service worker caching strategy is defined. What works offline? What shows a meaningful error? Without this, users in poor connectivity get broken pages with no guidance. |
| U-08 | 🟡 | **Account deletion data implications not communicated to user.** The spec defines anonymization logic, but there is no UX flow for communicating to the user what will happen (soft-delete, 30-day restore window, sighting audit trail retention). PDPA requires informed consent. |

---

## 5. Security Concerns

| # | Severity | Concern |
|---|----------|---------|
| S-01 | 🔴 | **EXIF/GPS data in uploaded photos.** Pet photos, sighting photos, and AI scan photos may contain embedded GPS coordinates in EXIF metadata. Storing and serving these files without EXIF stripping exposes precise owner and reporter locations. Strip EXIF server-side before storage (sharp can do this). |
| S-02 | 🔴 | **Owner contact info exposed directly on QR page.** After phone verification, owner's phone number is visible to anyone who scans the QR. For a public pet profile (QR tags are physical objects in the world), this is a privacy and safety risk. Consider a masked contact relay or in-app sighting form as the only contact path. |
| S-03 | 🟠 | **No 2FA for admin accounts.** Admin accounts control user bans, data export, and AI training data. Standard email+password is insufficient for this privilege level. Require TOTP or hardware key for admin login. |
| S-04 | 🟠 | **`reporterContact` in sightings exposed to Admin.** Anonymous reporters submit phone/email as `reporterContact`. Admins can read this. This personal data of non-registered users requires an explicit lawful basis under PDPA. Define access controls and retention separately from sighting data. |
| S-05 | 🟠 | **IP-only rate limiting is bypassable.** The 5 sightings/IP/hour rate limit at Vercel Edge is trivially bypassed via VPN or distributed proxies. For high-profile lost cases, a coordinated attack could flood sightings. Add device fingerprinting or CAPTCHA as a secondary layer for abuse pattern detection. |
| S-06 | 🟠 | **Service role key usage scope undefined.** Service role bypasses RLS. CLAUDE.md notes it's used for `pet_embeddings` and `notifications`. If the key is ever exposed in client-side code (accidental commit, environment variable leak), all RLS protections are nullified. Restrict to server-only API routes and add explicit documentation of where it may be used. |
| S-07 | 🟡 | **Sighting abuse for active pets with no case.** If sightings can be submitted without a caseId (see M-06/M-07), the endpoint must validate petId exists and is public. Without this, the endpoint could be abused to test for valid petIds. |
| S-08 | 🟡 | **AI scan image deletion: URL validity after nullification.** After 24 hours, `ai_scans.imageUrl` is nullified but the Storage URL was previously accessible. If Storage URLs are public/signed with long expiry, the image may still be reachable after "deletion." Confirm Storage bucket policy and use short-lived signed URLs. |
| S-09 | 🟡 | **Account deletion anonymization scope incomplete.** Spec anonymizes `users` record fields. But `sightings.reporterContact` may contain the deleted user's phone/email (if they submitted sightings before registering). Post-deletion sweep of linked personal data is not specified. |

---

## 6. Scalability Concerns

| # | Severity | Concern |
|---|----------|---------|
| SC-01 | 🔴 | **pgvector index configuration unspecified.** Without an explicit `IVFFLAT` or `HNSW` index on `pet_embeddings.embedding`, nearest-neighbor search is a sequential scan. At 10k+ pets this is unacceptably slow. Index type, `lists` (IVFFLAT), or `m`/`ef_construction` (HNSW) parameters must be defined before the AI feature goes live. |
| SC-02 | 🟠 | **Notification fan-out at peak load.** "All Helpers within 5 km" in a dense city could be thousands of users. Sending push + email to each synchronously in a single API request will time out on Vercel (50s limit). Requires an async queue (e.g., Supabase Edge Function + queue, or an external job queue). |
| SC-03 | 🟠 | **`notifications` table grows unbounded.** "Never deleted — kept as inbox history." At 10 notifications/day/user × 10,000 users = 36M rows/year with no archival. Define a TTL policy (e.g., soft-archive after 90 days, hard-delete after 1 year). |
| SC-04 | 🟠 | **Supabase free tier hard limits.** 500 MB DB, 1 GB Storage, 50K MAU. Pet photos + sighting photos + AI scan images will exceed 1 GB Storage quickly. Spec acknowledges no SLA but does not specify the upgrade trigger criteria or cost model. |
| SC-05 | 🟡 | **`push_subscriptions` unbounded per user.** A user can have subscriptions from multiple browsers/devices with no defined limit or cleanup for stale/expired endpoints. Push delivery to expired endpoints silently fails; the table should be pruned on delivery failure (410 response from push service). |
| SC-06 | 🟡 | **QR page < 2s on 3G with no CDN strategy.** Pet photos are served from Supabase Storage. Without a CDN edge cache or Next.js `<Image>` optimization, photo load on mobile 3G will dominate the 2s budget. Explicitly define image optimization strategy (Supabase CDN or Vercel Image Optimization). |
| SC-07 | 🟡 | **Geo query fan-out requires PostGIS or pre-computed buckets.** If the users table has 100K+ Helpers with registered locations, a radius query at mark-lost time without a spatial index (GiST on point column) will be slow. Either add PostGIS with GiST index or use H3/geohash bucketing for coarse pre-filter. |

---

## Summary

| Category | Blockers 🔴 | High 🟠 | Medium 🟡 |
|----------|------------|--------|---------|
| Missing Requirements | 5 | 7 | 7 |
| Ambiguous Requirements | 2 | 3 | 4 |
| Technical Risks | 3 | 4 | 3 |
| UX Risks | 1 | 4 | 3 |
| Security Concerns | 2 | 4 | 3 |
| Scalability Concerns | 1 | 3 | 3 |
| **Total** | **14** | **25** | **23** |

### Top 5 items to resolve before implementation begins

1. **M-19 + T-02** — Helper location storage and geo query strategy. Without this, the core geo-notification feature has no implementation path.
2. **M-06 + M-07** — Guest sighting caseId lookup and active-pet sighting flow. Blocks the primary QR scan flow.
3. **M-13** — Choose and document the cron/scheduler mechanism. Blocks auto-close, stale warnings, and vaccination reminders.
4. **S-01** — EXIF stripping before storage. Easy to implement with sharp; very hard to remediate after data is already stored.
5. **T-01 + SC-01** — pgvector/Prisma gap and index strategy. Must be decided before the schema is finalized to avoid a painful migration later.
