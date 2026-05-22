# Tricoat Painting & Decorating — Project Manager

Mobile-first internal tool for a 4-person painting crew. Voice-assisted daily time + materials logging, per-project budgets, profit tracking, payroll CSV, role-gated week locks.

- **Users**: admin (Alex) + manager (Gavin). 2 accounts total.
- **Workers** (labour entities): Jerry, Pierce, Gavin, Alex.
- **Stack**: React 19 + Vite + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Auth + RLS + Edge Functions) · Claude Haiku 4.5 for voice parsing · Vercel hosting · Playwright E2E.
- **Brand ref**: https://www.tricoatpainting.com.au/

For the full spec see [`docs/PRD.md`](docs/PRD.md). For design decisions, [`docs/decisions/`](docs/decisions/). For what was deliberately deferred, [`docs/PRD-CHALLENGE.md`](docs/PRD-CHALLENGE.md).

---

## Quick start (local demo, no backend)

```bash
npm install
echo 'VITE_DEMO_MODE=true' > .env.local
npm run dev
```

Opens http://localhost:5173 with in-memory demo data. Tap **Sign in** (credentials are ignored in demo mode) to explore Dashboard, Week calendar, Projects, Voice log, Reports, Workers, Admin.

Toggle between admin and manager via the pill in the top bar to see role-gated UX.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run test` | Vitest (unit + integration) |
| `npm run test:watch` | Vitest watch mode |
| `npm run e2e` | Playwright against `npm run dev` |
| `npm run preview` | Serve the production build locally |

## Going live (5 commands)

The app ships in demo mode. To point it at real Supabase + Claude + Vercel:

```bash
# 1. Create Supabase project at https://supabase.com (free tier fine)
supabase login
supabase link --project-ref <your-ref>

# 2. Push schema + RLS + seed
supabase db push

# 3. Set server-side secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 4. Deploy the voice-parse Edge Function
supabase functions deploy parse-voice-log

# 5. Set env vars locally + on Vercel, then deploy
#    .env.local:
#      VITE_SUPABASE_URL=https://<ref>.supabase.co
#      VITE_SUPABASE_ANON_KEY=<anon>
#      VITE_DEMO_MODE=false
vercel login
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_DEMO_MODE production   # set to "false"
vercel --prod
```

## One-time Supabase admin steps

1. **Create the two auth users** in the Supabase dashboard → Authentication → Users → Add user (email + password). Note each user's UUID.
2. **Assign roles** in the SQL editor:
   ```sql
   insert into profiles (id, role, display_name) values
     ('<alex-uuid>',  'admin',   'Alex Lewis'),
     ('<gavin-uuid>', 'manager', 'Gavin');
   ```
3. **Verify workers seed** — the migration inserts Jerry/Pierce/Gavin/Alex at $0/hr. Update rates via the **Workers** admin page in-app.
4. **(Optional) Weekly backup**: set `RESEND_API_KEY` and `BACKUP_RECIPIENT` in Supabase secrets and deploy the `weekly-backup` function, then schedule Sundays 23:00 local via `supabase functions schedule`.

## Project layout

```
src/
  App.tsx                 Router
  main.tsx                Providers (Query, Router, Auth, Toaster, ErrorBoundary)
  components/
    ui/                   shadcn-style primitives (button, dialog, tabs, ...)
    layout/AppLayout.tsx  Top bar + mobile bottom nav + floating mic
    features/             DayEntryDialog, ProjectForm, VoiceReview
  context/AuthContext.tsx
  hooks/                  TanStack Query hooks per entity + useVoiceLog
  lib/
    supabase.ts           Client (lazy)
    env.ts                Env read + demoMode flag
    dates.ts              ISO-week math (Mon start)
    currency.ts           AUD formatting
    hours.ts              14h hard cap, 10h warn
    fuzzyMatch.ts         Worker/project name matching
    aggregations.ts       Per-project & per-worker-week math
    claudePrompt.ts       Shared with Edge Function
    voiceParser.ts        Resolve parsed output to DB IDs
    demo.ts / demoStore.ts  In-memory fixtures for demo mode
    csv.ts                Export + download
    queryKeys.ts
  pages/                  Dashboard, WeekCalendar, Projects, ProjectDetail,
                          Workers, VoiceLog, Reports, Admin, Login
  routes/guards.tsx       RequireAuth, RequireRole
  types/db.ts             Domain types (kept in sync with migrations)

supabase/
  config.toml
  migrations/             schema · functions · rls · seed
  functions/
    parse-voice-log/      Deno Edge Function calling Claude Haiku
    weekly-backup/        Sunday CSV backup email

e2e/                      Playwright specs
tests/integration/        Vitest integration (add as Supabase local comes online)

docs/
  PRD.md                  Full spec
  PRD-CHALLENGE.md        Self-review + proposed enhancements
  decisions/              ADRs
  testing/STRATEGY.md
```

## Security model (short version)

- **Anthropic key** lives only in Supabase Edge Function secrets. Never in the frontend, never in the repo.
- **RLS enforces the week lock**: managers cannot INSERT/UPDATE/DELETE entries inside a locked week — database rejects the write, UI only re-renders the ban. Admin writes inside locked weeks are allowed and logged to `audit_log` via trigger.
- **Supabase anon key** is public by design; RLS is the real gate.
- **CI secret scan** (`.github/workflows/ci.yml`) fails the build if it greps common key patterns in source.

## Open items

- **Hourly rates**: seeded at $0 — update via Workers page.
- **Payroll CSV format**: generic (`date,worker,project,hours,rate,amount,notes`). If your payroll software needs a specific shape, let me know and I'll tailor.
- **E4 photo-per-day per project**: deferred to v1.5 (mobile camera permission flow adds scope).
- **Offline PWA**: app shell caches, but the IndexedDB write queue for time entries is v1.5.
- **Week lock automation**: admin-manual for v1 (safer); auto-lock Fri 5pm is an opt-in toggle we can add.
