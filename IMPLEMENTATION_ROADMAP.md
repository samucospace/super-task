# Super Task Implementation Roadmap

## Goal

Evolve Super Task from a static local-first browser app into a secure cross-platform product that works on:

- Web
- Android
- Shared cloud-backed sync for the same user

The recommended architecture for the MVP is:

- Frontend: existing HTML/CSS/JS app, refactored incrementally
- Auth: Supabase Auth
- Remote database: Supabase Postgres
- Security model: Row Level Security (RLS)
- Local/offline cache: IndexedDB on web
- Android packaging: Capacitor
- Hosting: Vercel, Netlify, or Cloudflare Pages

## Principles

1. Preserve the current app as the UX foundation.
2. Keep the app usable offline during the migration.
3. Avoid a full rewrite before the sync and auth model is proven.
4. Add backend complexity only when it unlocks a real milestone.
5. Keep security decisions explicit from the start.

## Current Starting Point

The app already has:

- Local-first task and group management
- IndexedDB storage with localStorage fallback
- PWA assets and service worker
- List/table mode and card mode
- Group modal editing workflow
- Export/import backup flow
- Supabase email magic-link auth with session bootstrap and sign-out (`auth.js`)
- Cloud-as-source-of-truth read sync (pull on sign-in/reload/manual refresh) and cloud write sync (push on every task/group mutation), scoped by `user_id` with RLS (see `AUTH_IMPLEMENTATION_PLAN.md` Status section)
- A persistent offline/pending-sync queue (`sync-queue.js`) with automatic retry, so edits made offline or signed-out are not lost
- Realtime sync between open tabs/devices via Supabase Realtime `postgres_changes`, and timestamp-aware per-record conflict merging on every cloud pull
- Local-to-cloud migration via the existing Import Backup flow, which now also pushes imported data to Supabase when signed in
- Hosted production deployment: https://super-task.samfraser-au.workers.dev (Cloudflare Pages, deployed from `main`)

The app does not yet have:

- Android packaging
- Full production security hardening pass (Phase 9)

## MVP Definition

The first real MVP should support:

1. Sign in as one user
2. Access the same tasks on web and Android
3. Edit tasks offline and sync later
4. Keep current task/group UX mostly intact
5. Secure remote storage with per-user data isolation
6. Basic production hosting and recovery path

The MVP should not include yet:

- Team collaboration
- Shared workspaces across multiple users
- Attachments/files
- Complex role models
- Native Android rewrite
- Custom backend service layer
- Advanced conflict resolution beyond a simple deterministic policy

## Phase 1: Refactor The Current App For Extensibility

### Objective

Decouple rendering and app behavior from storage and persistence.

### Why This Comes First

Right now the app is a single static-file implementation. Before adding auth or sync, the app needs a storage abstraction so the UI can work against either:

- local-only persistence
- synced cloud persistence
- hybrid local cache plus remote sync

### Tasks

1. Split `app.js` responsibilities into logical modules or sections:
   - UI rendering
   - event handling
   - local persistence
   - sync/session state
2. Create a task repository layer with a consistent interface:
   - `listTasks()`
   - `createTask(task)`
   - `updateTask(task)`
   - `deleteTask(id)`
3. Create the same abstraction for groups.
4. Centralize persistence-related constants and storage keys.
5. Keep the current IndexedDB/localStorage behavior working while behind the new interface.

### Deliverable

The app still runs locally exactly as it does now, but storage access is no longer hardwired throughout the UI.

## Phase 2: Introduce A Minimal App Shell

### Objective

Prepare the static app to run as a real hosted web app and later inside Capacitor.

### Tasks

1. Add a lightweight app structure for environment-aware configuration.
2. Introduce a configuration file or module for:
   - environment values
   - Supabase project URL
   - Supabase anon key
3. Keep the app simple; avoid introducing a frontend framework unless it becomes necessary.
4. Revisit the service worker to ensure it will not conflict with sync behavior later.

### Deliverable

The app can be hosted securely over HTTPS and configured per environment.

## Phase 3: Create The Supabase Backend

### Objective

Stand up the secure hosted backend that will become the system of record.

### Recommended Supabase Features

- Supabase Auth
- Postgres database
- Row Level Security
- Optional Realtime for future sync enhancements

### Core Tables

#### `profiles`

User profile metadata tied to Supabase auth users.

Suggested fields:

- `id`
- `email`
- `display_name`
- `created_at`
- `updated_at`

#### `groups`

Suggested fields:

- `id`
- `user_id`
- `name`
- `created_at`
- `updated_at`
- `deleted_at`

#### `tasks`

Suggested fields:

- `id`
- `user_id`
- `group_id` or `group_name`
- `title`
- `due_date`
- `priority`
- `notes`
- `completed`
- `sort_order`
- `created_at`
- `updated_at`
- `deleted_at`
- `version`

### Security Rules

1. Enable RLS on every user-owned table.
2. Only allow a user to read/write rows where `user_id = auth.uid()`.
3. Prevent the client from writing rows for other users.
4. Add server-enforced defaults for timestamps where possible.

### Deliverable

A secure remote schema exists and is ready for app integration.

## Phase 4: Add Authentication

### Objective

Require users to authenticate before loading synced data.

### Recommendation

Use Supabase Auth with one of:

1. Email magic links for fastest MVP
2. Email/password if you want more familiar account behavior

### Tasks

1. Add sign-in UI.
2. Add session bootstrap logic on app load.
3. Add sign-out flow.
4. Show clear app state for:
   - signed out
   - loading session
   - signed in
5. Ensure no synced data loads before auth is established.

### Deliverable

The app has real user identity and can securely separate data by account.

## Phase 5: Implement Hybrid Local + Remote Sync

### Objective

Preserve fast offline UX while syncing to the remote database.

### Sync Model

The recommended MVP model is:

- local IndexedDB remains the immediate working store on web
- remote Postgres becomes the durable shared source of truth
- sync runs on app load, on reconnect, and after local mutations

### Suggested Behavior

1. Read from local cache immediately on startup.
2. Fetch remote changes once authenticated.
3. Merge remote state into local state.
4. Push local pending changes to remote.
5. Show a visible sync status indicator.

### MVP Conflict Policy

Start simple:

- use `updated_at` plus deterministic last-write-wins
- use soft deletes via `deleted_at`
- keep stable UUIDs across platforms

Later, if needed, upgrade to a richer operation-log model.

### Deliverable

The same account can use the app across devices with offline support and eventual sync.

## Phase 6: Migrate Existing Local Data — Done

### Objective

Protect the current local-only user data during the transition.

### Implemented Approach

Instead of a separate automatic detect-and-prompt flow, this was implemented via
the existing Import Backup feature: importing a JSON backup now also pushes
the imported tasks/groups to Supabase when signed in (or queues them via
`sync-queue.js` if offline/signed out). Anyone with local-only data can export
a backup, sign in, and re-import it to migrate into the cloud account.

### Deliverable

Current users do not lose their existing local data.

## Phase 7: Host The Web App

### Objective

Make the app securely accessible from anywhere on the web.

### Tasks

1. Choose a static hosting platform:
   - Vercel
   - Netlify
   - Cloudflare Pages
2. Host over HTTPS.
3. Configure environment variables for Supabase.
4. Verify service worker, caching, and auth flows behave correctly in production.

### Deliverable

A production web deployment is available and secure.

## Phase 8: Package The Android App With Capacitor

### Objective

Reuse the web app as a branded Android app with minimal duplication.

### Tasks

1. Add Capacitor to the project.
2. Configure:
   - app name
   - package ID
   - icons
   - splash screen
3. Build Android project files.
4. Test:
   - login/session persistence
   - offline behavior
   - sync after reconnect
   - modal/table/card interactions
5. Generate APK/AAB for testing and release.

### Deliverable

A Super Task branded Android app using the same app logic and UI foundation.

## Phase 9: Security Hardening

### Objective

Make the MVP production-safe rather than just functional.

### Tasks

1. Review all RLS policies.
2. Verify the client never has elevated privileges.
3. Ensure secrets are never embedded in client code except public anon keys where appropriate.
4. Add rate-limiting or server-side validation if custom functions are introduced.
5. Add backups and document recovery steps.
6. Review session expiration and token refresh behavior.
7. Audit any service worker caching of authenticated content.

### Deliverable

The product has a defensible security posture for real-world use.

## Phase 10: Release Readiness

### Objective

Verify the full product path before calling the MVP complete.

### Test Checklist

1. Sign in and sign out works cleanly.
2. New user starts with empty remote data.
3. Existing local user can import/migrate old tasks.
4. Task CRUD works on web and Android.
5. Group CRUD works on web and Android.
6. Sort, card view, and group modal still work.
7. Offline edits sync correctly later.
8. Completed tasks behave correctly in all views.
9. Data isolation works across accounts.
10. Failed sync states are visible and recoverable.

### Deliverable

The app is ready for actual usage beyond local-only personal testing.

## Recommended Milestone Order

### Milestone 1 — Done

Refactor the current app into a storage-aware structure without changing behavior. (`core.js`, `dom.js`, `bootstrap.js`, `storage.js`, `repositories.js` now exist as separate modules.)

### Milestone 2 — Done

Create the Supabase schema and wire up authentication. (`auth.js`, `auth-config.js`, `SUPABASE_SETUP.md` schema/RLS.)

### Milestone 3 — Done

Add local-plus-remote sync for tasks and groups, including an offline/pending-sync queue with retry (`sync-queue.js`), realtime cross-tab/device sync, and timestamp-aware per-record conflict merging (see `AUTH_IMPLEMENTATION_PLAN.md` Status section).

### Milestone 4 — Done

Local-data migration into the authenticated account, via the existing Import Backup flow (now also pushes to cloud when signed in).

### Milestone 5 — Done

Deploy the hosted web version: https://super-task.samfraser-au.workers.dev (Cloudflare Pages, auto-deploys from `main`). Requires this URL to also be added as a Supabase Auth Redirect URL (see `SUPABASE_SETUP.md`).

### Milestone 6 — Not started

Add Capacitor and build the Android MVP.

### Milestone 7 — Not started

Harden security, test thoroughly, and prepare release.

## Recommended First Coding Step

Milestones 1-5 (storage abstraction, auth, hybrid sync with realtime + conflict handling, local-to-cloud migration via backup import, and hosted deployment) are complete — see `AUTH_IMPLEMENTATION_PLAN.md` for the detailed status.

The next highest-leverage step is Milestone 6: Capacitor/Android packaging.

## Suggested Repo Evolution

A lightweight future structure could look like:

```text
/index.html
/styles.css
/app/
  config.js
  state.js
  ui.js
  auth.js
  sync.js
  storage/
    local-db.js
    repositories.js
    supabase-store.js
/app.js
/manifest.json
/service-worker.js
```

This does not need to happen all at once. The intent is to move in this direction incrementally.

## Risks To Avoid

1. Rewriting the whole UI before auth and sync are proven.
2. Mixing remote sync logic directly into rendering code.
3. Adding collaboration before single-user sync is stable.
4. Treating offline and sync as an afterthought.
5. Shipping without RLS and session review.

## Final Recommendation

For this project, the best path is:

1. Keep the current app as the base
2. Refactor storage boundaries first
3. Use Supabase for auth + Postgres + security
4. Add sync before Android packaging
5. Use Capacitor for the Android MVP
6. Delay native rewrite unless real product requirements justify it
