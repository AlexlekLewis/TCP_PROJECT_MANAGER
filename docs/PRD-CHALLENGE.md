# PRD Challenge — Self-Review and Enhancements

*Companion to `PRD.md`. Alex asked me to challenge the PRD and propose features he hasn't thought of. This doc is the counter-argument and the wish-list.*

---

## Part 1 — Challenges to the PRD as written

### C1. "Voice log is the primary path" may be wrong for power users
The PRD positions voice as THE primary logging path. For a bulk Monday-morning recap ("here's the whole week"), voice wins. For a single quick entry ("Jerry did 8 at Northcote today"), tapping 4 dropdowns + a number is probably faster than speaking, waiting for Claude, and reviewing.

**Recommendation**: measure. Don't assume voice adoption. Build the manual entry with equal love — quick-add chips for common worker+project combos, "same as yesterday" one-tap repeat, keyboard-numeric-first flow. If voice ends up second-class, the manual path has to carry the day.

### C2. Confidence badges may be insufficient trust signal
Showing a 0.82 confidence score assumes Gavin interprets it. He won't. He'll click Confirm on whatever the AI returns.

**Recommendation**: for any entry with <0.9 match confidence, force an explicit dropdown re-selection (not just "click to edit"). Friction where accuracy matters.

### C3. 16 h daily cap is too permissive
A human can't paint 16 hours in a day. 16 h is clearly a voice-to-text error ("sixty" → "sixteen" type). Cap should be 14 h hard, 10 h warn.

**Recommendation**: Change `hours <= 16` to `hours <= 14` at the database level. Warning threshold 10 h stays.

### C4. "Two users forever" is optimistic
Business grows. Casual workers get hired. Second supervisor. The architecture treats users and workers as separate entities (good), but the auth allowlist is hardcoded to 2.

**Recommendation**: Allowlist as a database table, not a constant. Admin can add invitees. Still gated by admin action — no open signup.

### C5. Week lock via RLS is the right shape but has a sharp edge
If the clock advances to Monday and Gavin's Sunday entries haven't been made, a week lock applied on Friday would block those remaining Sunday writes. Real-world: Gavin sometimes logs over the weekend.

**Recommendation**: Default week lock window is "any week whose Sunday is > 3 days ago" rather than "any week ending". Or: explicit lock action only (already in PRD), but make clear the manager needs to submit before the deadline. Combine with a Friday-8pm auto-nudge: "Lock this week? Anything outstanding?"

### C6. No way to log *intent* vs *actual*
Gavin's voice log happens at end of day. There's no record of what was *planned* vs what *happened*. For understanding estimation accuracy (a real business question), we need both.

**Recommendation**: see Enhancement E8 below.

### C7. "Profit = quoted - labour - materials" ignores overhead
Real profit deducts vehicle costs, insurance, admin time, paint-brush replacement, etc. The PRD's "profit" is actually "gross margin before overhead".

**Recommendation**: rename to "Gross margin" in the UI. Optionally: a simple org-level "overhead %" setting that Alex can tune; Financials shows both gross and estimated net.

### C8. No backup of the raw voice transcript in a form Alex can read
`voice_logs.transcript` is in the DB. If Alex ever disputes a payroll entry, he needs to find that transcript via an admin screen. Right now there isn't one.

**Recommendation**: Admin view of all voice logs with filters by date and user. Cheap to add.

### C9. CSV export is a leaky abstraction
Payroll software formats vary. "Export CSV" without a format spec means Alex will likely reformat in Excel every time.

**Recommendation**: Phase 8 acceptance criterion should include "CSV opens directly in [Alex's payroll software] with no manual fixing." Alex must name the tool.

### C10. No smoke-test of AI quality over time
AI parsing quality can drift (model updates, edge cases accumulate). The PRD doesn't describe how we'd detect a regression.

**Recommendation**: maintain a fixture set of 20 real Gavin-style transcripts with expected parsed output. Run as an integration test against the live Claude API (gated by `ANTHROPIC_API_KEY` in CI). If >1 fixture regresses, fail CI. Budget: ~$0.05 per CI run.

---

## Part 2 — Enhancements you haven't mentioned (ranked by value/effort)

### Strong adds to v1 (small effort, big value)

**E1 — Live labour $ cost display on every screen that shows hours**
Hours × rate = $. The moment you've typed a worker + hours, the $ is derived. Show it next to the hours everywhere. This is the *business* number, not the hours. Trivial to build, highest value-per-byte in the whole app.

**E2 — Budget burn alert**
When a project hits 80% of quoted hours OR 80% of materials budget, surface a banner on the dashboard. Don't wait for Alex to notice at month-end. Build: one query + one UI element.

**E3 — Fair-hours validation on voice entries**
If Jerry appears to log >12 h in a single voice log, force Gavin to confirm the specific entry. Catches voice-to-text errors at the most dangerous point.

**E4 — Photo-per-day per project**
1 tap. End of day. Before locking, Gavin snaps one photo at each site. Stored in Supabase Storage, linked to the day. Used for:
- Dispute resolution ("you said you painted that")
- Morale (progress over time)
- Admin review (Alex can scroll through the week visually)
Low effort (Supabase Storage is one line). Huge qualitative value.

**E5 — Automatic weekly backup to email**
Every Sunday midnight, an Edge cron job exports all tables as CSVs, zips them, emails to Alex's inbox. Payroll data must survive Supabase-side failure. Non-negotiable for a business tool.

**E6 — Audit log viewer in admin**
Already in data model. Surface it. Admin screen with filter by user + date range + table. This is the "who edited Jerry's hours" answer.

**E7 — Smart project fuzzy-match with creation fallback**
If Gavin says "Preston High" and it doesn't exist, don't error. Prompt: "Create 'Preston High' as a new project?" One-tap create with defaults (no budget), enter properly later. Captures ad-hoc work Gavin would otherwise skip.

### Medium additions (v1.5 — first 3 months post-launch)

**E8 — Start-of-day plan voice entry**
Morning: Gavin voices the plan ("Jerry's at Northcote all day, Pierce with me at Preston morning and Belmore afternoon"). Creates *provisional* entries for today. End of day: real entries are reconciled against plan. Over weeks, this gives you estimation accuracy (planned vs actual hours per project).

**E9 — Weekly summary email to Alex**
Every Sunday night, an auto-generated email: "This week — 152 hours across 4 projects. Northcote 3h over budget, Belmore on track. Pierce worked 38h, Jerry 42h. Top spend: $420 at Haymes Beechworth for Westfield job." Claude-written from structured data; sends via Resend.

**E10 — Offline-first PWA**
Service worker + IndexedDB queue. Gavin logs while driving between sites with no signal. Syncs when back on wifi. Target v1 if time permits; v1.5 otherwise. Tradie-specific lifesaver.

**E11 — Daily brief for Gavin at 7am**
Auto push notification / SMS: "Today's team: Jerry → Northcote, Pierce → Preston AM + Belmore PM. Budget for today: 30.5h. Reply with voice to log yesterday if not done." Combines planning + nudge.

**E12 — Gross margin + net profit toggle**
As per C7. Let Alex set an org-level overhead % (default 25%); Financials shows both gross and net.

### Long-term (v2+, substantial effort)

**E13 — Quote PDF import**
Drop a quote PDF into a project form. Claude Vision extracts scope, budget, hours allowance, creates the project. Power multiplier for Alex's quoting → execution handoff.

**E14 — Client-facing read-only share link**
Optional per-project. Alex generates a tokenised URL. Client sees: progress bars (hours only, no $), recent photos, status. No financials. Premium brand touch — fits Tricoat's heritage/luxury positioning.

**E15 — Invoice draft export**
Project complete → generate PDF invoice from recorded time + materials + quoted price. Hand to Xero or email client.

**E16 — Xero integration**
Two-way: projects ↔ Xero tracking categories; materials ↔ purchase orders; hours ↔ payroll. Big scope but closes the business loop.

**E17 — Profitability trends**
Over time, which project *types* (heritage vs new-build, interior vs exterior) are most profitable? Which workers are fastest on what? Drives quoting.

**E18 — Weather awareness**
For exterior work: pull BOM weather data for project postcode. Mark days as weather-affected. Explains timeline slippage.

**E19 — Supplier-level materials tracking**
Once material entries have supplier field, group by supplier. See top suppliers, price trends, consolidate purchasing.

### Anti-features (tempting but DON'T build)

**A1 — Kanban board for projects**
Seductive UI pattern, wrong mental model. Alex isn't moving cards between columns; he's tracking hours against a budget. Dashboard with progress bars wins.

**A2 — Slack/email notifications for every voice log**
Notification fatigue. The weekly summary (E9) is the signal; everything else is noise.

**A3 — AI-suggested project quotes**
"Based on similar jobs, quote this one at X." Sounds good, terrible idea. Quoting is judgment, not pattern matching. Don't automate it.

**A4 — Complex permissions / ACLs**
Two users. Two roles. Don't build an RBAC system.

**A5 — In-app chat between users**
Alex and Gavin communicate by phone / WhatsApp. App doesn't need to compete.

---

## Part 3 — Recommended deltas to PRD v1

Based on this review, I recommend folding these into the v1 scope:

1. **E1** — Live labour $ display (trivial, essential)
2. **E2** — Budget burn alert (small addition to Dashboard)
3. **E3** — Fair-hours validation (safety net)
4. **E5** — Weekly backup email (reliability non-negotiable)
5. **E6** — Audit log viewer (already in data model, just needs UI)
6. **E7** — Project fuzzy-match with create fallback (improves voice flow)
7. **C3** — Cap hours at 14, warn at 10
8. **C8** — Admin voice-log viewer

Defer to v1.5:
- E4 (photos) — valuable but adds mobile camera permission flow, keep lean
- E10 (offline) — target if time, accept v1.5

Reject:
- Any A1–A5 item

---

## Part 4 — Questions for Alex

Before locking PRD v1:

1. Do you agree with adding E1, E2, E3, E5, E6, E7 to v1 scope? (adds ~5 h of work, enormous value)
2. Do you want photos (E4) in v1 or v1.5?
3. Overhead % for net profit calc — ballpark figure? (can default to 25%)
4. Payroll software name (for CSV format compliance)
5. OK to cap hours at 14 (not 16)?
6. Is week lock "Friday 5pm auto" acceptable or prefer manual-only?
