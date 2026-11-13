# 028 — Seven-day rest placeholders

Status: Implemented and independently reviewed; production rollout pending. David approved the [final HTML](design/final.html) on 2026-11-13 and authorized development through CN production release. This supersedes the first prototype based on an obsolete worktree. Base: plan-web 90678bd; backend 2ea533e. Backend contract: spec 066.

## Approved behavior

- Preserve current BlockGrid, sidebar, header, bricks, editing and by-week/by-day layouts. Show all seven calendar positions, in plan-start weekday order. Rest positions occupy normal cells; no automatic collapse to training-only columns.
- Right-click a day (keyboard/menu fallback) switches Training / Rest. This changes only that day. Rest retains all prescription data and calendar identity; switching back restores it. Students do not execute or receive rest prescriptions.
- Rest does not consume a D ordinal. Training numbering remains continuous within each week. Explicit empty training days do consume an ordinal, persist in drafts, and block publish/update until filled or explicitly changed to rest. Legacy unplanned slots remain unplanned; merely loading an existing plan must not create empty training days or mutate it.
- Rest cells display date, Rest and retained action count. Hide action bricks while resting. Preserve context actions, undo/redo, copy/paste, cross-week fill, and both layouts. Copying an entire day includes its day type. Row paste/add explicitly creates a training day, never silently overwrites retained rest prescriptions.
- Completed/logged days and read-only plans cannot switch type. Protect against concurrently arriving logs on the server. Preserve backend-authoritative day IDs, shifted dates, completion and opaque per-set fields.
- Autosave/pending-revision retains explicit type. Publish acknowledgement may clear the transient mirror only after durable plan data includes the type and prescription. Backend absence/disabled capability must prevent rest writes rather than silently discard them.
- No replacement of navigation, communication, history, locale support or unrelated current UI.

## Implementation and test seams

One frontend card A. Existing public seams: React PlanEditor/BlockGrid interactions at the HTTP boundary; mapPlanToWeeks, reconcilePlan and draft snapshot round-trip; public grid/date/copy functions. TDD one behavior at a time. Backend card A is independently owned by spec 066. No production credential in artifacts.

## Acceptance checklist (before implementation)

- [x] Existing four-training-day plan opens as seven aligned positions without a write; no day/row disappears, including shifted or coincident dates.
- [ ] W2 populated training -> rest -> save -> reload/new browser -> training restores all values, notes, order and dates.
- [x] Rest remains in position and consumes no D number in either layout.
- [x] Delete last row leaves explicit empty training; draft save/reload preserves it; published update/publish refuses with precise day context.
- [x] Rest copy/paste/fill and undo/redo preserve type/content; clearing a rest prescription is explicit, not an accidental side effect.
- [x] Logged/completed/read-only switch is disabled; concurrent logged-day mutation is rejected without partial writes.
- [x] Old snapshot versions and old clients remain compatible; hidden rest never appears in student plan/cursor/logging/scheduling paths.
- [x] Full tests, TypeScript, build, independent Standards and Spec reviews, real application browser evidence.
- [ ] Migration/deployment gates satisfied; exact served JS/CSS hashes, backend SHA and health verified; persistent authenticated smoke if authorized credential channel is available.

## Out of scope

Student UI/app release, mandatory rest by date, navigation redesign, new completion semantics, changing logged history, destructive migration, Global deployment catch-up, unrelated open PR #165. Global release requires its independent migration/deployment readiness.
