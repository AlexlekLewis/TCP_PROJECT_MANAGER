# Tricoat PM — wake-up brief

The single page to read when you wake up. Tells you what's live, what changed, what's blocked, and what you do next.

---

## What's live, right now

**Production URL**: https://tcpprojectmanagerbuild.vercel.app

Open it on your phone. The app is running in **demo mode** with seed data — 3 active projects (Northcote High, Preston High, Belmore School), 4 workers (Jerry, Pierce, Gavin, Alex), a week of time entries and materials. Toggle between **admin** and **manager** in the top-right pill to see Gavin's view (hours only, no $).

Send Gavin the URL. He can click through the whole thing right now and tell you if the daily flow makes sense.

---

## Quality bar I set tonight

- **66 Playwright specs across chromium + mobile-safari, all green.** Suite at [e2e/](../e2e/). Covers role gating (manager sees no $ on dashboard / project detail / projects list / reports / nav), timeline view, projects CRUD (create / archive-restore / delete-blocked-when-entries / delete-on-empty), day entry (add time + hours validation + materials), week lock (admin lock/unlock surfaces in Reports + Week views).
- **Two real bugs surfaced + fixed during the run**: demo role didn't persist across page reloads (now in localStorage); role pill was hidden on mobile (now visible everywhere).
- **Re-deployed to https://tcpprojectmanagerbuild.vercel.app** with all fixes baked in.

Run the suite yourself any time: `npx playwright test` (auto-starts dev server, ~25 s total).

## What changed overnight

- **AI / voice surfaces removed from the active UI** per your instruction. Files are still on disk — re-enabling later is a 5-line change to `App.tsx` + nav.
- **New "Timeline" view** (`/timeline`) — horizontal Gantt-style bars for every scheduled project, coloured by tag, fill = hours-used %, today line in red. Below it, a "Who's on what — this week" table — per-worker daily hours with project colour dots. This is the "visualise all my jobs" view you asked for.
- **Deployed live to Vercel** (project `tcp_project_manager_build`, alias `tcpprojectmanagerbuild.vercel.app`). Currently running in demo mode by default.
- **Convened a 3-lens board review** ([docs/board-review.md](board-review.md)) — PM expert + painter business owner + senior engineer. They converged on a small list of "fix this or you'll regret it" items. Worth a read — under 600 words.
- **Acted on the engineer's findings**:
  - Voice flow rewritten to use the atomic `save_voice_log_entries` RPC instead of looping per-row inserts (closes a half-save bug)
  - New hardening migration `20260422000001_hardening.sql` — pins `search_path` on every `SECURITY DEFINER` function, requires a `reason` for admin edits to locked weeks, audits week-lock changes
  - Edge Function `parse-voice-log` hardened — CORS allowlist by origin (not `*`), errors redacted to opaque codes (no leaking DB/driver strings)

---

## Blockers I hit (need you)

### 1. Supabase project `tricoat-pm` is paused (free-tier auto-pause)
When I tried to push the hardening migration, the DB hostname stopped resolving. The dashboard told me **the project is paused** — free-tier projects auto-pause after 7 days of inactivity.

When I clicked **Resume project**, Supabase blocked it: *"AlexlekLewis has reached the limit of 2 active free-plan projects."* You're at the free-org limit somewhere else in your account.

**To unblock:** open https://supabase.com/dashboard → find the other org's projects → pause or delete one you don't need → come back to `tricoat-pm` and click Resume. Or upgrade `Alex Lewis' projects` org to Pro ($25/mo — also gets rid of the auto-pause for good).

### 2. Anthropic API key (set aside per your earlier call)
Voice is unwired in the UI so this doesn't block the app. If/when you re-enable voice, finish the Anthropic onboarding and `supabase secrets set ANTHROPIC_API_KEY=...`.

---

## What you do on wake (in order)

```bash
# 0. Open the live URL on your phone, send to Gavin
#    https://tcpprojectmanagerbuild.vercel.app

# 1. Unpause the Supabase project (see Blocker #1 above)
#    — dashboard click, no CLI needed

# 2. Push the overnight hardening migration to live
#    Token + DB password live in docs/secrets-note.md (gitignored).
cd "/Users/alexlewis/Documents/Claude/Projects/TCP PROJECT MANAGER"
export SUPABASE_ACCESS_TOKEN=<from docs/secrets-note.md>
npx supabase db push --linked --password "<from docs/secrets-note.md>"

# 3. Create the two auth users in the dashboard:
#    https://supabase.com/dashboard/project/yvopfgylhqbkiqfvuqwu/auth/users
#    — Add user → Alex@tricoatpainting.com.au + password you pick
#    — Add user → Gavin's email + password you pick
#    Copy each user's UUID.
#
#    Then in the SQL editor at
#    https://supabase.com/dashboard/project/yvopfgylhqbkiqfvuqwu/sql/new
#    run (paste the UUIDs in):
#      insert into profiles (id, role, display_name) values
#        ('<alex-uuid>',  'admin',   'Alex Lewis'),
#        ('<gavin-uuid>', 'manager', 'Gavin');

# 4. Set real worker hourly rates via the live app
#    https://tcpprojectmanagerbuild.vercel.app/workers
#    (after step 5, log in as Alex)

# 5. Flip the live URL from demo mode to real backend
#    Add these env vars in Vercel (one CLI command each, or via dashboard):
vercel env add VITE_SUPABASE_URL production
#    paste: https://yvopfgylhqbkiqfvuqwu.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY production
#    paste: sb_publishable_DudPjwPWy2h4_5h0gepUSg_O2s1X1fw
vercel env add VITE_DEMO_MODE production
#    paste: false

# 6. Redeploy to pick up the env change
vercel deploy --prod --yes
```

Total time on wake: **5–10 minutes**.

---

## Decisions parked for you

From the board review — none of these are urgent, but the PM director was emphatic about them:

1. **Run a 2-week parallel pilot** — Gavin logs into the app AND keeps the spreadsheet. Don't retire the spreadsheet until 3 consecutive weeks reconcile. (Margaret Voss, PM lens)
2. **Define a kill criterion now** — if voice adoption is <40% by week 4, revert to manual-only. Decide it cold, before sunk cost takes over. (Margaret)
3. **Offline + photos are v1.5 must-haves** — the painter on the board (Dave Mannix) said the voice button + clean UI is the right bet, but without offline queueing and one-tap photos the tool dies on day 9 when Gavin's in a Belmore basement with no signal.

---

## Where everything lives

| Thing | Path |
|---|---|
| Live URL | https://tcpprojectmanagerbuild.vercel.app |
| Supabase project | https://supabase.com/dashboard/project/yvopfgylhqbkiqfvuqwu |
| GitHub repo | https://github.com/AlexlekLewis/TCP_PROJECT_MANAGER |
| Vercel project | https://vercel.com/alex-lewis-projects-6e9bb13b/tcp_project_manager_build |
| Board review | [docs/board-review.md](board-review.md) |
| Full architecture | [CLAUDE.md](../CLAUDE.md) |
| Every secret + go-live path | [docs/secrets-note.md](secrets-note.md) (gitignored) |
| Full session log | [CHANGELOG.md](../CHANGELOG.md) |
