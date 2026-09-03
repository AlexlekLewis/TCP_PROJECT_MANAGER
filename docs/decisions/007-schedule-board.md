# ADR 007 — Schedule board: drag/resize jobs against a zoomable underlay

- **Status**: Accepted
- **Date**: 2026-09-03
- **Context for**: Alex's request — "a list of upcoming jobs, and a way to modulate and move around on the calendar and resize, and create an underlay of what my next 30 to 60 or 12 months looks like depending on what size of the work I want."

## Context

`/timeline` already plotted every dated project as a Gantt bar, but it was a **read-only picture of a decision made somewhere else**. The window was hard-coded to ten weeks, the only affordance was clicking through to the project, and the way to change a job's dates was to open the project form and type them. Nothing answered the two questions Alex actually asks the board:

- *What's coming up, and when does it land?*
- *If I slide this job a week, what does the rest of the year look like?*

The first is a list; the second is direct manipulation. Neither existed.

## Decision

1. **The board is the editing surface.** Dragging a bar moves the job (duration preserved); dragging either end moves that edge. Drop commits `start_date` + `end_date` and raises a toast with **Undo**. Rescheduling is a spatial judgement — "does this fit between those two jobs" — and a date field can't express it.

2. **Four zoom presets: 30 days · 60 days · 6 months · 12 months.** Each is a whole number of weeks (35 / 63 / 182 / 364) so the Monday gridlines stay true at every level; the app is Monday-start everywhere else and a board that drifted off that would misread at a glance. The underlay changes density with the zoom — day columns with weekend shading at 30d, week columns at 60d, alternating month bands at 6m/12m.

3. **Drags snap to whole weeks at 6m and 12m.** At those ranges a pixel is roughly two days, so day-accurate dragging would be a lie — the UI would imply a precision the input can't carry. The hint text says so when it applies. Day precision stays available by zooming in, or by arrow-keying a focused bar.

4. **"Jobs ahead" is a separate list, not a reading of the chart.** On site now (sorted by soonest finish, flagging jobs already past their end date), starting within the current horizon, further out, and **not on the calendar yet**. This is the panel that works on a phone — the board is a desk tool, and drag-scheduling on a 375px screen is not a flow worth designing for.

5. **Undated jobs get a one-click "Schedule"** that drops them on next Mon–Fri so they can be dragged into place. Deliberately a placeholder, not a guess: the point is to get the job onto the board where it can be reasoned about spatially, which is the whole argument for (1).

6. **The board is read-only for the manager.** `projects` is admin-write-only under RLS (`projects_admin_write`), so Gavin gets the same board and the same list without drag handles — a drag he could start would 403 on drop. Clicking a bar still opens the job for both roles.

## Consequences

- Project dates now have two edit paths (the board and the project form). Both write the same two columns through `useUpdateProject`, so there's no divergence — but a future field that constrains dates has to be honoured in both.
- Commits are optimistic: the dropped span is held in local state until the server echoes it back, otherwise the bar snaps to its old position for one refetch and reads as a failed drag.
- Scheduling remains a **plan**, entirely independent of logged time. A bar's fill shows hours burnt against quote, but moving a bar never touches a time entry, and no lock applies — week locks protect payroll, not intentions.

## Why not a calendar library

react-big-calendar / FullCalendar both do this, and both are month/week **event** grids — one row per day, jobs as blocks inside it. The question here is the opposite shape: one row per *job*, spanning months. Fitting that to an event calendar means fighting it, and the geometry that's actually needed (`barGeometry`, `daysFromPx`, `applyDrag` in [src/lib/schedule.ts](../../src/lib/schedule.ts)) is ~40 lines of arithmetic that is fully unit-tested and has no opinions about our data model. A dependency would have cost more than it saved.
