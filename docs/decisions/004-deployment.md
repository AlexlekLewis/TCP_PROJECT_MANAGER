# ADR 004 — Deployment topology

**Date**: 2026-04-21
**Status**: Accepted

## Decision

- **Frontend**: Vercel (SPA, `vercel.json` rewrites for React Router)
- **Backend**: Supabase (Postgres + Auth + Edge Functions in same project)
- **Monitoring**: Sentry (free tier) for frontend + Edge Function errors
- **Email**: Resend (free tier) for weekly CSV backup
- **CI/CD**: GitHub Actions runs lint + test + build + Playwright on every PR; merging to `main` triggers Vercel production deploy

## Environments

| Env | URL | Supabase | Claude |
|---|---|---|---|
| local | http://localhost:5173 | Supabase local (Docker) or demo mode | fixture responses |
| preview | Vercel preview (per PR) | Preview Supabase project (optional) or shared dev | shared dev key |
| production | Vercel main | Production Supabase project | production key |

For v1 we run **one Supabase project** for production and use **demo mode** locally. A separate preview-env Supabase comes in v1.5 if we hit write conflicts.

## Secrets matrix

| Secret | Vercel | Supabase secrets | Repo |
|---|:-:|:-:|:-:|
| VITE_SUPABASE_URL | ✓ | — | — |
| VITE_SUPABASE_ANON_KEY | ✓ | — | — |
| ANTHROPIC_API_KEY | — | ✓ | ✗ |
| SUPABASE_SERVICE_ROLE_KEY | — | ✓ (implicit) | ✗ |
| RESEND_API_KEY | — | ✓ | ✗ |
| VITE_SENTRY_DSN | ✓ | — | — |

Any key starting with `sk-`, `eyJ`, or containing `SERVICE_ROLE` must never land in the repo. CI has a grep gate.

## Rollback

- **Frontend**: Vercel keeps every deploy; promote the previous one via the dashboard
- **Database**: `supabase db reset` locally; on prod, restore via Supabase dashboard point-in-time recovery (Pro) or re-apply prior migration + restore from weekly backup CSV

## Consequences

### Easier
- Previews per PR enable Playwright to run against a deployed build
- Edge Functions co-located with DB = zero-config RLS-aware calls
- Free-tier comfort: this scale stays inside Supabase free (500MB DB, 50k monthly active users) and Vercel free indefinitely

### Harder
- Supabase free tier pauses after 7 days of inactivity — ops note: check at least once a week, or move to Pro when Alex is ready
- Two sources of truth for env vars (Vercel dashboard + Supabase secrets) — requires a README checklist

## Follow-ups

- Set up Sentry in Phase 9
- Verify weekly backup email is actually arriving
- Consider Supabase Pro once the business has been using it for a month
