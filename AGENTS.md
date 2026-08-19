# AGENTS.md

## Purpose

This guide helps coding agents work quickly and safely in Super Task.

## Project Snapshot

- Local-first static web app with optional Supabase-backed cloud sync.
- The web app itself has no build step and no package manager dependency; open `index.html` directly (or `open-super-task.cmd`) and it just works.
- `package.json`/`node_modules`/`android/` exist only for optional Android packaging via Capacitor (see "Android (Capacitor)" below) — they are not required to run or edit the web app.
- Core files:
  - `index.html` for structure
  - `styles.css` for styling/layout
  - `core.js`, `dom.js`, `bootstrap.js` for shared state/DOM refs/event wiring
  - `storage.js`, `repositories.js` for local persistence and mutation methods
  - `auth.js`, `auth-config.js` for Supabase magic-link auth
  - `sync-queue.js` for the offline/pending cloud-sync queue
  - `app.js` for rendering, interactions, and cloud sync orchestration
  - `manifest.json` and `service-worker.js` for PWA/offline

## Android (Capacitor)

- `capacitor.config.json`: appId `com.neworchard.supertask`, `webDir: "www"`.
- `scripts/build-www.js`: copies just the runtime web files (not docs/tooling) into `www/` (gitignored, regenerated on demand).
- `android/`: generated native project, tracked in git.
- If you edit any runtime web file, remember `www/` and `android/app/src/main/assets/public` are stale copies — run `npm run cap:sync` before building/opening Android Studio. This has no effect on the browser app.

## Agent Priorities

1. Keep edits minimal and targeted.
2. Preserve existing behaviors unless explicitly asked to change them.
3. Maintain keyboard accessibility for interactive controls.
4. Keep the app fully usable with no Supabase config at all (local-first stays the default).
5. Avoid introducing frameworks/build tooling unless requested.
6. Cloud writes must stay awaited (not fire-and-forget) and must queue via `sync-queue.js` on failure or while signed out.

## Data Model And Persistence

- IndexedDB database: `super-task-db`
- Stores: `tasks`, `groups`
- localStorage fallback key: `super-task-fallback`
- localStorage column widths key: `super-task-col-widths`
- localStorage view mode key: `super-task-view-mode`
- localStorage offline sync queue key: `super-task-sync-queue`
- Cloud (optional): Supabase Postgres `tasks`/`groups` tables scoped by `user_id`, RLS-protected (see `SUPABASE_SETUP.md`)

Task shape (logical):
- `id`, `title`, `group`, `dueDate`, `priority`, `notes`, `completed`, `order`

## Auth And Cloud Sync (Current State)

- Supabase email magic-link auth in `auth.js`; signed-out users keep full local app functionality.
- Signed-in: cloud is treated as source of truth. Every sign-in / app load / manual "Refresh from cloud" pulls tasks/groups for that user and overwrites local state.
- Every task/group mutation pushes to Supabase immediately (soft delete via `deleted_at`), scoped by `user_id`.
- Offline or signed-out edits are queued locally (`sync-queue.js`) and auto-flushed on reconnect, on a timer, and before any cloud pull.
- Header shows a "N changes pending sync" pill and rows get an amber marker when unsynced.
- Realtime cross-tab/device push via Supabase Realtime `postgres_changes` subscriptions (requires Realtime enabled on `tasks`/`groups` tables).
- Timestamp-aware per-record conflict merging on every cloud pull (an `updatedAt`-newer local row survives a pull instead of being blanket-overwritten); conflicts are still whole-row (not field-level).
- Import Backup pushes imported data to cloud too when signed in, so it serves as the local-to-cloud migration path.

## Current UI Modes

- Header layout:
  - "Card view"/"Table view" toggle, "Groups" toggle (with a live group-count badge), and a "More \u22ee" dropdown menu (Export backup, Import backup, and, once signed in, a divider then Refresh from cloud + Sign out). The More menu closes on outside click or Escape.
  - The storage-status pill (e.g. "Using local fallback") is hidden unless there's an actual problem; a healthy IndexedDB/cloud state shows no pill.
  - Once signed in, a single combined pill reads "Logged in - your@email.com" instead of separate cloud-status/email indicators.
- List/table mode:
  - Inline editing in table rows.
  - Manual drag reorder when sort is manual (`order`).
  - Sort cycle on sortable columns: asc -> desc -> manual order.
  - Table columns are user-resizable (persisted); defaults are intentionally compact so the table fits typical laptop widths without horizontal scrolling.
- Card mode:
  - One card per group.
  - Cards size dynamically by open-task count.
  - Completed tasks are not shown in card mode.
  - Clicking a card opens a modal with that group task list.
  - Used automatically on narrow/mobile screens (\u2264700px) until the user explicitly toggles the view once; after that their choice is remembered in `localStorage`.
- Group modal:
  - Table-style editing for only that group.
  - Add task to group action in modal header.
  - Close with close button, backdrop click, or Escape.

## Notes Behavior

- Notes are capped at 1000 characters.
- Notes use preview + popup editor pattern.
- Close/save paths include Done button, Escape, and focus out.
- Preserve overlay behavior (do not stretch row height).

## Editing Guidance

- Prefer reusing existing helper functions and event patterns.
- Keep state transitions explicit and render after sync as already patterned.
- When adding controls, wire both click and keyboard behavior where relevant.
- Keep CSS aligned with existing tokenized style in `:root`.
- Gotcha: if an element is shown/hidden via the `hidden` DOM property/attribute in JS, and its CSS rule sets an explicit `display` (e.g. `display: grid/flex`), that overrides the browser's default `[hidden] { display: none }` and the element never actually hides. Add a matching `.your-class[hidden] { display: none; }` rule (see `.table-frame[hidden]`, `.group-modal[hidden]`, `.auth-gate[hidden]`, `.more-menu-list[hidden]` for the existing pattern).

## Validation Checklist (After Changes)

1. Syntax/diagnostics are clean in `index.html`, `app.js`, `auth.js`, `sync-queue.js`, and `styles.css`.
2. Add/edit/delete tasks still works in main table.
3. Drag reorder still works in manual sort mode.
4. Sort cycle still returns to manual order.
5. Group add/rename/delete and auto-register still work.
6. Notes open/edit/close still work in composer and task rows.
7. Card mode toggle works and hides completed tasks.
8. Card click opens group modal; modal editing and add-task work.
9. Delete completed action still works correctly.
10. Data persists after reload (IndexedDB, with localStorage fallback behavior intact).
11. If Supabase is configured: sign-in/sign-out/reload behave correctly, and offline/signed-out edits show pending-sync indicators and sync after reconnecting.

## Safe Scope Defaults

- If request is ambiguous, prefer smallest UX-consistent implementation.
- Do not perform broad refactors while implementing feature tweaks.
- Do not remove existing user data keys or migration behavior without explicit request.
