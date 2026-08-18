# Super Task Auth Implementation Plan

## Status (Current)

Auth shell, session bootstrap, and cloud read/write sync are implemented and tested. Completed:

- Supabase magic-link auth (`auth.js`, `auth-config.js`), including callback handling for `code`, `token_hash`, and hash-token flows, with URL cleanup.
- Session restore on load; signed-out users keep full local app functionality (local-testing mode).
- Cloud-as-source-of-truth read sync: sign-in / app load / manual "Refresh from cloud" button pulls tasks/groups for the signed-in user and hydrates local state.
- Cloud write sync: every task/group create/update/delete pushes to Supabase (`tasks`/`groups` tables), scoped by `user_id`, using soft deletes (`deleted_at`). Writes are awaited so a reload can't race ahead of an in-flight write.
- Offline/signed-out durability: a persistent local queue (`sync-queue.js`) captures edits made while offline or signed out, and flushes automatically on reconnect, on a timer, and before every cloud pull. Header pill + per-row markers show pending-sync state.
- Multi-device model: cloud is always pulled fresh on sign-in/reload (no "trust this device" shortcut), since laptop + phone concurrent use is the primary use case.
- Realtime sync: while signed in, the app subscribes to Supabase Realtime `postgres_changes` on `tasks`/`groups` (filtered by `user_id`) and pulls fresh data (debounced ~500ms) when another tab/device changes data, so open sessions stay in sync without a manual refresh. Requires Realtime enabled on both tables (see `SUPABASE_SETUP.md`).
- Timestamp-aware conflict handling: every task/group carries an `updatedAt` timestamp set on each local push. Cloud pulls merge per-record by comparing `updatedAt` instead of blindly overwriting local state; whichever side is newer wins, and any local row that beat the incoming cloud version is re-pushed to reconcile.
- Local-to-cloud migration: importing a JSON backup (existing Import Backup feature) now also pushes the imported tasks/groups to Supabase when signed in (or queues them via `sync-queue.js` if signed out/offline), so restoring a backup on a fresh sign-in actually migrates that data into the cloud account instead of being silently dropped or overwritten by the next pull.
- Hosted deployment: https://super-task.samfraser-au.workers.dev (Cloudflare Pages, deployed from `main`; no build step). Add this URL as a Supabase Auth Redirect URL (see `SUPABASE_SETUP.md`).
- Android/Capacitor scaffolding: `package.json`, `capacitor.config.json` (appId `com.neworchard.supertask`), `scripts/build-www.js`, and the generated `android/` native project are in place. A command-line debug build (`gradlew assembleDebug`) has been verified to succeed using Android Studio's SDK plus Microsoft Build of OpenJDK 21 as `JAVA_HOME` (the JDK 25 bundled with the Android Studio install is too new for this project's Gradle/AGP versions).
- The app has been opened in Android Studio (Gradle JDK set to 21) and launched successfully on a virtual device (emulator).

Not yet implemented (see `IMPLEMENTATION_ROADMAP.md` for sequencing):

- Full in-app testing pass on the emulator/device (sign-in, task/group CRUD, offline queue, sync, card/table modes, notes) — app launches but hasn't been exercised yet.
- Testing on a real physical device, icon/splash branding, and Play Store release prep.

## Goal

Add secure user authentication to Super Task as the first step toward a cloud-synced web and Android app.

This plan assumes:

- Supabase will be used for auth and the remote database
- the current modularized static app remains the frontend base
- auth should be introduced before full remote sync logic

## Recommended MVP Auth Choice

Use Supabase Auth with email magic links first.

Why:

1. Fastest implementation path
2. No password reset flow required for MVP
3. Good fit for a single-user or early-user app
4. Works on web and later inside Capacitor

Possible later expansion:

- email/password
- Google sign-in
- MFA

## Auth Scope For Phase 1

The first auth milestone should include:

1. Sign in screen
2. Session detection on app startup
3. Signed-in app state
4. Sign out flow
5. Route all future synced data behind authenticated user state
6. No multi-user sharing yet

It should not include yet:

- role-based access control beyond user-owned data
- team workspaces
- invitation flows
- MFA
- account profile editing

## Proposed User Experience

### Signed Out

Show a lightweight auth gate with:

- app name
- short value proposition
- email input
- "Send sign-in link" button
- optional note that the app syncs across devices after login

### Signed In

Show the current app UI plus:

- signed-in indicator
- user email in header or menu
- sign out action
- sync/auth status area later

### Session Restore

On reload:

1. check for existing Supabase session
2. if present, load authenticated app state
3. if absent, show signed-out gate

## Technical Decisions

### Client SDK

Use Supabase JavaScript client in the frontend.

### Session Storage

Use Supabase-managed session persistence initially.

### Data Ownership Model

For the first authenticated model, all tasks and groups belong to exactly one user.

Recommended ownership fields:

- `user_id` on `tasks`
- `user_id` on `groups`

This is simpler than introducing workspaces immediately.

### Migration Strategy

Keep current local IndexedDB/localStorage behavior until cloud sync is added.

Auth should arrive before full sync, but the app can still:

- sign users in
- preserve local-only data temporarily
- later offer one-time migration/import into the cloud account

## Schema Planning

### Supabase Auth

Supabase manages the base auth user table.

### `profiles` table

Suggested fields:

- `id` UUID primary key references auth user id
- `email` text
- `display_name` text nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### `groups` table

Suggested fields:

- `id` UUID primary key
- `user_id` UUID not null
- `name` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz nullable

### `tasks` table

Suggested fields:

- `id` UUID primary key
- `user_id` UUID not null
- `group_id` UUID nullable or use `group_name` initially
- `title` text not null
- `due_date` date nullable
- `priority` text not null
- `notes` text not null default ''
- `completed` boolean not null default false
- `sort_order` integer not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz nullable
- `version` integer not null default 1

## Row Level Security Plan

Enable RLS on every user-owned table.

Initial policies should be:

### `profiles`

- user can select own profile
- user can insert own profile
- user can update own profile

### `groups`

- user can select rows where `user_id = auth.uid()`
- user can insert rows where `user_id = auth.uid()`
- user can update rows where `user_id = auth.uid()`
- user can delete rows where `user_id = auth.uid()`

### `tasks`

- user can select rows where `user_id = auth.uid()`
- user can insert rows where `user_id = auth.uid()`
- user can update rows where `user_id = auth.uid()`
- user can delete rows where `user_id = auth.uid()`

## Frontend Module Plan

The current repo now has:

- `core.js`
- `dom.js`
- `bootstrap.js`
- `storage.js`
- `repositories.js`
- `app.js`

Recommended auth additions:

- `auth.js`
- optional later: `supabase-client.js`

### `auth.js` responsibilities

1. initialize Supabase client
2. send magic link email
3. get current session
4. listen for auth state changes
5. sign out
6. expose auth state helpers to the app

## Required UI Changes

### `index.html`

Add:

1. signed-out auth panel
2. signed-in user actions area
3. sign out button
4. auth status message area

### `styles.css`

Add styles for:

- auth gate layout
- auth form
- signed-in identity badge or menu
- auth loading state
- auth error state

### `app.js`

Update to:

1. wait for auth bootstrap before loading synced state later
2. show or hide main app shell based on auth state
3. separate app-init path from auth-init path

## Incremental Implementation Steps

### Step 1: Add Supabase client wiring

Deliverables:

- add Supabase client script or module
- add environment/config placeholders
- add `auth.js`

### Step 2: Add signed-out UI

Deliverables:

- email form in `index.html`
- form handling in `auth.js`
- success/error messaging

### Step 3: Add session bootstrap

Deliverables:

- detect current session on load
- render signed-in or signed-out state
- handle magic-link return flow

### Step 4: Add sign-out and identity display

Deliverables:

- sign out button
- signed-in email display
- auth state change handling

### Step 5: Gate future sync work behind auth

Deliverables:

- app has explicit `signedOut`, `authLoading`, `signedIn` modes
- later sync code uses authenticated user context

## First Code Slice Recommendation

The first auth code change should not try to do database sync yet.

Instead, start with this smallest viable slice:

1. add auth UI shell
2. initialize Supabase client
3. send magic link
4. restore session on load
5. sign out

That gives you a real authenticated application shell before touching remote tasks/groups.

## Risks To Avoid

1. Mixing auth bootstrap directly into storage logic too early
2. Adding sync and auth in the same first implementation
3. Hiding all existing local functionality behind half-finished auth wiring
4. Skipping RLS setup and relying only on client-side checks
5. Introducing user/workspace complexity before single-user ownership is stable

## Definition Of Done For Auth Phase

Auth planning becomes auth implementation complete when:

1. User can request a magic link — done
2. User can open the link and get signed in — done
3. Session restores on refresh — done
4. User can sign out cleanly — done
5. UI clearly reflects signed-in vs signed-out state — done
6. No remote data is exposed without auth — done (RLS scoped by `user_id`)

## Suggested Next Build Task

Auth + read/write cloud sync + offline queue + realtime sync + timestamp-aware conflict handling + backup-import cloud migration are implemented (see Status section above). Recommended next slice:

1. Hosted deployment + Android/Capacitor packaging per `IMPLEMENTATION_ROADMAP.md`.
