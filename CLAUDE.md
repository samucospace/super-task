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
- Auth config: `auth-config.js` (real Supabase URL + publishable/anon key, intentionally committed — that key is public-safe and Cloudflare Pages deploys straight from this repo with no build step) / `auth-config.example.js` (template)
- PWA assets: `manifest.json`, `service-worker.js`

## Android (Capacitor)

- `capacitor.config.json`: appId `com.neworchard.supertask`, appName "Super Task", `webDir: "www"`.
- `scripts/build-www.js`: copies just the runtime web files into `www/` (gitignored, regenerated via `npm run www:build`).
- `android/`: generated native Android Studio project, tracked in git per Capacitor convention.
- `npm run cap:sync` rebuilds `www/` and syncs `android/`; `npm run android:open` also opens Android Studio.
- Building/running on Android requires Android Studio + a JDK installed locally (not yet done as of this scaffolding).

## Core Product Behaviors

- Spreadsheet-like task table with inline editing
- Task fields: title, group, due date, priority, completion, notes
- Notes support up to 1000 characters
- Notes editing uses compact preview + popup editor + Done/ESC/blur close
- Manual drag-and-drop ordering when sort mode is manual
- Sort cycle on sortable columns: asc -> desc -> manual order
- Group management panel (add/rename/delete)
- Export/import backup as JSON
- Delete completed tasks action

## Auth And Cloud Sync (Current State)

- Supabase Auth via email magic link, implemented in `auth.js`.
- Handles magic-link callback (`code`, `token_hash`, and hash-based tokens) and cleans the URL after.
- Signed-out users still get full local app functionality (local-testing mode); only the auth panel plus signed-in-only controls change visibility.
- Import/Export backup are always visible, even signed out.
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
