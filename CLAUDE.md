# CLAUDE.md

## Purpose

This file provides persistent project context for AI-assisted chat sessions in this repository.

## Project Summary

Super Task is a task board app built from static files, local-first by default with optional Supabase-backed cloud sync.

- The web app itself has no build step and no package manager dependency
- No backend server required (Supabase is an optional managed backend for auth + sync)
- Runs by opening `index.html` directly (or `open-super-task.cmd`)
- `package.json`/`node_modules`/`android/` exist only to package the app for Android via Capacitor; they are unrelated to running/editing the web app itself (see Android section below)

## Current Stack

- HTML: `index.html`
- CSS: `styles.css`
- JS modules: `core.js`, `dom.js`, `bootstrap.js`, `storage.js`, `repositories.js`, `auth.js`, `sync-queue.js`, `app.js`
- Auth config: `auth-config.js` (real Supabase URL + publishable/anon key, intentionally committed — that key is public-safe and Cloudflare deploys `www/` straight from this repo via `npm run www:build`) / `auth-config.example.js` (template)
- PWA assets: `manifest.json`, `service-worker.js`

## Android (Capacitor)

- `capacitor.config.json`: appId `com.neworchard.supertask`, appName "Super Task", `webDir: "www"`.
- `scripts/build-www.js`: copies just the runtime web files into `www/` (gitignored, regenerated via `npm run www:build`).
- `android/`: generated native Android Studio project, tracked in git per Capacitor convention.
- `npm run cap:sync` rebuilds `www/` and syncs `android/`; `npm run android:open` also opens Android Studio.
- Confirmed working on a physical device (Pixel 10 Pro) and an emulator, including magic-link sign-in.
- Magic-link sign-in uses a custom URL scheme deep link (`supertask://auth-callback`, `@capacitor/app` plugin, intent-filter in `AndroidManifest.xml`) so tapping the email link opens the installed app instead of the phone's browser — see `auth.js`'s `isNativePlatform()`/`initNativeDeepLinking()`. Requires `supertask://auth-callback` to also be added as a Supabase Auth Redirect URL. Changes to `AndroidManifest.xml` or native plugins need a full Android rebuild, not just `npm run www:build`.
- Top-of-screen safe-area (status bar) handling uses a `position: fixed` spacer strip (`.safe-area-top-spacer`) sized via `env(safe-area-inset-top)`, not `body` padding — padding on a scrolling element scrolls away and re-exposes content under the status bar.

## Core Product Behaviors

- Spreadsheet-like task table with inline editing
- Task fields: title, group, due date, priority, completion, notes
- Notes support up to 1000 characters
- Notes editing uses compact preview + popup editor + Done/ESC/blur close
- Manual drag-and-drop ordering when sort mode is manual (table rows), or within a card in card view (same manual-order model, restricted to same-group drops)
- Sort cycle on sortable columns: asc -> desc -> manual order
- Group management panel (add/rename/delete); the Groups toggle button shows a live count badge
- Export/import backup as JSON, accessible from the "More ⋮" header menu (along with Refresh from cloud / Sign out once signed in)
- Delete completed tasks action
- Task creation/editing happens in a single popup modal (single-column form: Task, Group, Due date, Priority, Notes), opened via a floating "+" button fixed at the bottom-right (all devices) for adding, or by clicking a task card in card view for editing
- Card view groups scroll internally (max-height + `overflow-y: auto` on the task list) once a group has more tasks than fit, instead of clipping them
- Card view is used automatically on narrow/mobile screens until the user explicitly toggles the view once; their choice is then remembered
- Header keeps routine status pills hidden (e.g. storage-status only shows for an actual problem) and shows a single combined "Logged in - your@email.com" pill once signed in

## Auth And Cloud Sync (Current State)

- Supabase Auth via email magic link, implemented in `auth.js`.
- Handles magic-link callback (`code`, `token_hash`, and hash-based tokens) and cleans the URL after.
- Signed-out users still get full local app functionality (local-testing mode); only the auth panel plus signed-in-only controls change visibility.
- Import/Export backup are always visible (in the "More ⋮" menu), even signed out.
- Cloud is treated as the source of truth once signed in: every sign-in / app load / manual "Refresh from cloud" pulls tasks/groups for that `user_id` and overwrites local state.
- Every task/group create/update/delete is pushed to Supabase (`tasks`/`groups` tables) immediately after the local write, scoped by `user_id`, using soft deletes (`deleted_at`).
- Offline/signed-out edits are captured by a persistent local queue (`sync-queue.js`, localStorage key `super-task-sync-queue`) and flushed automatically: on reconnect (`online` event), on a 30s timer, and before every cloud pull (so local edits push before being possibly overwritten).
- Pending-sync UI: header pill ("N changes pending sync") plus a small amber marker on affected task rows.
- Realtime sync: while signed in, the app subscribes to Supabase Realtime `postgres_changes` on `tasks`/`groups` (filtered by `user_id`) and does a debounced (~500ms) silent re-pull when another tab/device changes data. Requires Realtime enabled on both tables (see `SUPABASE_SETUP.md`).
- Conflict handling: each task/group carries an `updatedAt` set on every push. Cloud pulls merge per-record by comparing `updatedAt` (newer side wins) instead of blanket-overwriting local state; any local row that wins gets re-pushed to reconcile. Still whole-row, not field-level.
- Local-to-cloud migration: Import Backup (`handleImportFile` in `app.js`) also pushes imported tasks/groups to Supabase when signed in (or queues them if offline/signed out), so restoring a backup after sign-in migrates that data into the cloud account.
- Known limitation: no field-level conflict merging (still whole-row last-write-wins by timestamp).

## Storage Model

- IndexedDB database: `super-task-db`
- Object stores:
  - `tasks`
  - `groups`
- localStorage fallback key: `super-task-fallback`
- localStorage column widths key: `super-task-col-widths`
- localStorage view mode key: `super-task-view-mode`
- localStorage offline sync queue key: `super-task-sync-queue`
- Cloud (optional): Supabase Postgres `tasks`/`groups` tables with RLS scoped to `user_id` (see `SUPABASE_SETUP.md`)

## Notes For Future Chat Edits

- Preserve local-first behavior: the app must remain fully usable with no Supabase config at all.
- Prefer minimal, targeted edits over broad refactors.
- Keep the task table compact; popovers should overlay, not stretch row height.
- Maintain keyboard accessibility for interactive elements.
- Keep notes capped at 1000 characters unless explicitly changed.
- Avoid introducing build tools or frameworks unless explicitly requested.
- When touching cloud sync code, keep writes awaited (not fire-and-forget) so reload-triggered cloud pulls can't race ahead of an in-flight write.
- Any new task/group mutation path must also queue for offline sync when not signed in or when the cloud write fails (see `cloudUpsertTasks`/`cloudDeleteTasks`/`cloudUpsertGroup`/`cloudDeleteGroup` in `app.js`).
- When any code reindexes/renumbers multiple tasks locally (e.g. inserting above completed tasks, deleting and shifting survivors), push the full updated task list to cloud, not just the single changed task, or other rows' `sort_order` goes stale (see `addTask`/`deleteTask`/`deleteCompletedTasks` in `repositories.js`).
- CSS gotcha: an element toggled via the `hidden` DOM property in JS won't actually hide if its CSS rule also sets an explicit `display` (e.g. `display: grid/flex`) without a matching `.your-class[hidden] { display: none; }` override - the explicit `display` wins over the browser's default `[hidden]` rule.
- CSS gotcha: don't use scrolling-element padding (e.g. `body { padding-top: env(safe-area-inset-top) }`) to avoid drawing under the Android status bar - it scrolls away with the content. Use a `position: fixed` spacer element instead (see `.safe-area-top-spacer`).

## Quick Validation Checklist

After UI or behavior changes:

1. Verify no syntax errors in `index.html`, `app.js`, `auth.js`, `sync-queue.js`, and `styles.css`.
2. Confirm drag reorder still works in manual mode.
3. Confirm sort cycle still returns to manual order.
4. Confirm notes open/edit/close behavior works in both composer and task rows.
5. Confirm data persists after reload.
6. If Supabase is configured: confirm sign-in via magic link, sign-out, and reload all behave correctly.
7. Confirm an edit made while signed out or offline shows the pending-sync indicator and syncs after signing in / reconnecting.

## Common User Intent In This Repo

When the user asks for app changes, they usually want direct implementation in files (not just a plan).
