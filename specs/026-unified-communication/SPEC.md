# 026 — Coach editor communication

Status: Released (CN web, 2026-11-12). Owner: Codex, directly authorized by David on 2026-11-12 to implement and release the approved HTML. David explicitly waived the Opus handoff for this task. Reference: [approved HTML](design/final.html).

## Scope and acceptance

- Default right rail is Communication, with History tab retaining contextual training history/profile and a collapse/reopen control. No separate floating chat window. Switching/collapsing preserves reply context and drafts.
- Chat, video feedback and legacy day feedback appear in chronological order. Remove new whole-day feedback entry/composer; retain existing feedback data.
- Videos grouped by actual training date; previous/next day controls. At most two compact 40px rows by default. Hover lower edge expands all, leaving queue collapses with brief grace; keyboard/click fallback. No redundant day count or include-viewed filter.
- Viewed clips stay in their original order, with checkmark and viewed label; pending badge counts unwatched only. Preserve production playback-over-half viewed service semantics; this change concerns retention/presentation, not backend status rules.
- Existing portrait player stays left of rail. Transparent large arrows on video sides select previous/next within same date, including viewed clips, disabled at boundaries. Keyboard arrows must yield to text entry, IME, modifiers, date controls, annotation and existing playback controls. Switching keeps playback intent and per-target drafts.
- Selected video becomes reply reference; cancel reference returns to ordinary chat. Drafts isolated by student and reply target, including staged images. Image annotation enters preview before explicit send.
- Video text uses coach-feedback API; images use existing chat-image API. Ordinary text uses existing reliable chat outbox. On partial success clear only delivered portions and preserve retry sessions; no re-send of confirmed content. Retain RPE calibration, markers, annotation capture/security handling.
- Enter sends; Shift+Enter newline; IME composition/confirmation (including keyCode 229) never sends. Blank/disabled/busy composers cannot send.
- Left student rail initially collapsed; pointer hover expands and leaving collapses. Search/current student retained, keyboard/click alternative.
- Preserve ended-binding/read-only safety, exercise-note cards, chat pagination/read receipts/outbox, all plan editing and publishing behavior, and supported locales.

## Test seams

Rendered React user interaction with mocked HTTP/API boundary (existing repo test conventions), plus built application browser routing fixtures. Cover queue/date/viewed retention, student hover, composer routing/drafts/partial failure/IME, mixed timeline and player navigation. Existing full Vitest, TypeScript and build gates; independent Standards and Spec review. Deployment verification: exact backend merge image SHA, successful workflow, health/login and served artifact byte hashes.

## Out of scope

Student UI, API/schema/migrations, global deployment catch-up, plan editor data/publishing semantics, replacing production video playback or image upload services. Release uses established CN SAE route; global is not currently deployment-ready and is not bundled into this web change.
