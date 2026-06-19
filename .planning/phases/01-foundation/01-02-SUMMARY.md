---
phase: 01-foundation
plan: "02"
subsystem: database
tags: [supabase, prisma, postgresql, pgvector, server-only, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: Next.js 14 app scaffold, TypeScript, Tailwind CSS, shadcn/ui baseline
provides:
  - Supabase server client (lib/supabase/server.ts) for Server Components and Route Handlers
  - Supabase browser client (lib/supabase/browser.ts) for Client Components
  - Supabase service-role client (lib/supabase/service.ts) — server-only guarded
  - Prisma singleton (lib/prisma.ts) for server-side database access
  - schema.prisma with directUrl configured for Prisma migrations
  - .env.example template for all five required environment variables
  - All 13 application tables in Supabase (pending: requires user to complete credentials checkpoint)
  - prisma/migrations/ with versioned init migration (pending: requires credentials checkpoint)
affects: [all phases — database schema and Supabase clients are required by every subsequent phase]

# Tech tracking
tech-stack:
  added:
    - "@supabase/supabase-js@2.108.2"
    - "@supabase/ssr@0.12.0"
    - "prisma@6.19.2"
    - "@prisma/client@6.19.2"
    - "server-only@0.0.1"
  patterns:
    - "Supabase client split: server.ts / browser.ts / service.ts by execution context"
    - "server-only import guard on service-role client to prevent client bundle leakage"
    - "Prisma singleton via globalThis.__prisma to prevent hot-reload connection multiplying"
    - "Prisma v6 with schema.prisma datasource URL syntax (NOT Prisma v7 which broke this)"

key-files:
  created:
    - lib/supabase/server.ts
    - lib/supabase/browser.ts
    - lib/supabase/service.ts
    - lib/prisma.ts
    - .env.example
  modified:
    - schema.prisma
    - package.json
    - package-lock.json

key-decisions:
  - "Downgraded prisma from v7.8.0 to v6.19.2 — Prisma v7 removed schema.prisma datasource URL support (breaking change); v6 is the latest stable that works with the existing schema syntax"
  - "lib/supabase/service.ts uses import 'server-only' as first line — build-time protection against accidental client bundle import of SUPABASE_SERVICE_ROLE_KEY"
  - "Prisma singleton pattern via globalThis.__prisma prevents connection pool exhaustion during Next.js hot-reload in development"
  - "directUrl = env('DIRECT_URL') added to schema.prisma — Prisma migration engine requires direct PostgreSQL connection (port 5432), not PgBouncer pooler (port 6543)"

patterns-established:
  - "Server-side data access: import { prisma } from '@/lib/prisma' in Server Components and Route Handlers"
  - "Auth-aware server requests: import { createClient } from '@/lib/supabase/server' — RLS enforced via anon key"
  - "Client component auth: import { createClient } from '@/lib/supabase/browser'"
  - "AI pipeline / notification inserts: import { createServiceClient } from '@/lib/supabase/service' — bypasses RLS"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-06-19
---

# Phase 01 Plan 02: Supabase + Prisma Client Setup Summary

**Three Supabase client utilities and Prisma singleton created with server-only guards; schema.prisma updated with directUrl; all packages installed at Prisma v6 (v7 downgrade required); database migration pending user credential setup**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-19T00:00:00Z
- **Completed:** 2026-06-19
- **Tasks:** 1 of 2 complete (Task 2 blocked on credentials checkpoint)
- **Files modified:** 8

## Accomplishments
- Created lib/supabase/server.ts with `createClient()` using `@supabase/ssr createServerClient` — aliased import to avoid naming collision
- Created lib/supabase/browser.ts with `createClient()` using `@supabase/ssr createBrowserClient` — aliased import
- Created lib/supabase/service.ts with `createServiceClient()` and `import "server-only"` as first line — prevents service role key from reaching client bundles
- Created lib/prisma.ts with singleton PrismaClient (dev: query/error/warn logging; prod: error only)
- Added `directUrl = env("DIRECT_URL")` to schema.prisma datasource block
- Created .env.example with placeholder values for all five required env vars
- Installed @supabase/supabase-js, @supabase/ssr, prisma@6.19.2, @prisma/client@6.19.2, server-only
- Generated Prisma client types (`npx prisma generate` exited 0)
- TypeScript check passes (`npx tsc --noEmit` exited 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Supabase clients, Prisma singleton, schema.prisma update, .env.example** - `af17a7c` (feat)
2. **Task 1 (supplemental): package.json + package-lock.json** - `02dc461` (chore)

**Task 2 (pending):** prisma migrate dev — blocked on credentials checkpoint

## Files Created/Modified
- `lib/supabase/server.ts` — createClient() for Server Components and Route Handlers; uses NEXT_PUBLIC_* env vars; sets/gets cookies via next/headers
- `lib/supabase/browser.ts` — createClient() for Client Components; uses NEXT_PUBLIC_* env vars
- `lib/supabase/service.ts` — createServiceClient() with `import "server-only"` guard; uses SUPABASE_SERVICE_ROLE_KEY (non-public)
- `lib/prisma.ts` — singleton PrismaClient via globalThis.__prisma; dev logging enabled
- `.env.example` — placeholder template for all five required env vars (committed to git)
- `schema.prisma` — added `directUrl = env("DIRECT_URL")` to datasource block
- `package.json` — added 5 new dependencies
- `package-lock.json` — updated with resolved dependency tree

## Decisions Made
- **Prisma v6 not v7:** Prisma v7.8.0 (latest at time of install) removed datasource URL syntax from schema.prisma. This is a breaking change that breaks the existing schema. Downgraded to v6.19.2 (the `prev` dist-tag), which is the most recent Prisma version that supports `url = env("DATABASE_URL")` in schema.prisma datasource blocks.
- **server-only as first import on service.ts:** Hard build-time guard; any component importing service.ts will fail the build if it is a client component. This enforces the security requirement that SUPABASE_SERVICE_ROLE_KEY never reaches client bundles.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma v7 breaks schema.prisma datasource URL syntax**
- **Found during:** Task 1 (after installing `prisma@latest`)
- **Issue:** Prisma v7.8.0 removed `url = env("DATABASE_URL")` from schema.prisma datasource. Running `npx prisma generate` failed with: "The datasource property `url` is no longer supported in schema files."
- **Fix:** Downgraded to `prisma@6.19.2` and `@prisma/client@6.19.2` (the `prev` dist-tag — last stable v6 release). `npx prisma generate` succeeded after downgrade.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx prisma generate` exited 0; `npx tsc --noEmit` exited 0
- **Committed in:** 02dc461

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** Downgrade was necessary for the existing schema.prisma to work. No schema changes required. Plan intent fully preserved at Prisma v6.

## Issues Encountered
- Prisma v7 removed datasource URL syntax from schema.prisma — required downgrade to v6.19.2. See deviation above.

## User Setup Required

**Task 2 (prisma migrate dev) is blocked pending user credential setup.**

Before resuming, the user must complete these steps:

1. Log in to supabase.com and create/access a project
2. Enable the pgvector extension: Database → Extensions → search "vector" → Enable → wait for green badge
3. Retrieve from Supabase Dashboard → Project Settings → API:
   - NEXT_PUBLIC_SUPABASE_URL (Project URL)
   - NEXT_PUBLIC_SUPABASE_ANON_KEY (anon public key)
   - SUPABASE_SERVICE_ROLE_KEY (service_role key — treat as secret)
4. Retrieve from Project Settings → Database → Connection string:
   - DATABASE_URL: Transaction pooler URI (port 6543) → append `?pgbouncer=true&connection_limit=1`
   - DIRECT_URL: Direct connection URI (port 5432) — no pgbouncer params
5. Create `.env.local` in the project root with all five values
6. Run: `cd /mnt/c/KaoProJ/kaokao && npx prisma migrate dev --name init`
7. Verify 13 tables were created: `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\\\$queryRaw\\\`SELECT COUNT(*)::int as cnt FROM information_schema.tables WHERE table_schema='public' AND table_name NOT LIKE '_prisma_%'\\\`.then(r=>{console.log('Table count:',r[0].cnt);p.\\\$disconnect();}).catch(e=>{console.error(e);process.exit(1);})"` — should output `Table count: 13`

## Next Phase Readiness
- Task 1 artifacts are ready: Supabase client utilities and Prisma singleton are created and committed
- TypeScript compiles without errors
- Task 2 (database migration) requires user to create `.env.local` with Supabase credentials and run `prisma migrate dev --name init`
- Once migration is complete, all 13 schema tables will be live in Supabase and Phase 02 work can begin

## Known Stubs

None — no UI or data rendering stubs were created in this plan. This plan creates infrastructure utilities and database schema only.

## Threat Flags

None — all files created are server-side utilities. No new network endpoints or auth paths introduced beyond what was already defined in the threat model.

---
*Phase: 01-foundation*
*Completed: 2026-06-19 (partial — Task 1 done, Task 2 pending credentials)*

## Self-Check: PARTIAL

**Created files verified:**
- lib/supabase/server.ts: EXISTS
- lib/supabase/browser.ts: EXISTS  
- lib/supabase/service.ts: EXISTS
- lib/prisma.ts: EXISTS
- .env.example: EXISTS
- schema.prisma (modified): EXISTS

**Commits verified:**
- af17a7c: feat(01-02) — Task 1 files
- 02dc461: chore(01-02) — package updates

**Task 2 status:** PENDING — blocked on Supabase credentials and prisma migrate dev
