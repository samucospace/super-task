# Super Task

Super Task is a task board that runs directly in the browser from static files, with optional Supabase-backed cloud sync. There is no build step and no package install; it runs standalone locally, or with cloud sync once Supabase is configured.

**Live deployment**: [https://super-task.samfraser-au.workers.dev](https://super-task.samfraser-au.workers.dev) (Cloudflare Workers static assets, auto-deploys from `main`; build command `npm run www:build`, assets directory `www` per `wrangler.jsonc`)

## Highlights

- Add, edit, complete, and delete tasks via a floating "+" button that opens a task editor popup (works the same on web and Android)
- Drag and drop rows to reorder tasks in manual mode (table view), or drag task cards to reorder within their group (card view)
- Sort by Group, Due date, or Priority in either view; card view has a dedicated sort menu (manual order keeps drag reordering enabled)
- Manage groups (add, rename, delete) from the Groups panel
- Auto-register groups when you type a new group while creating or editing a task
- Resize table columns, with widths remembered between sessions
- Card view groups cards scroll internally once a group has more tasks than fit, instead of clipping them
- Export and import backups as JSON
- Delete all completed tasks in one action
- Persist data with IndexedDB
- Automatic localStorage fallback when IndexedDB is unavailable
- Offline support with a service worker and installable PWA manifest
- Optional Supabase email magic-link sign-in (including deep-link sign-in on the Android app)
- Optional cloud sync of tasks/groups, scoped per signed-in user
- Offline-safe cloud sync: edits made offline or signed-out are queued locally and pushed automatically once signed in and online
- Realtime sync between open tabs/devices for the same account (no manual refresh needed)
- Timestamp-aware conflict handling so a stale cloud pull can't clobber a more recent local edit
- Compact header: secondary actions (Export/Import backup, Refresh from cloud, Sign out) live under a single "More ⋮" menu
- Card view is used automatically on narrow/mobile screens until you explicitly pick a view (your choice is then remembered)
- Live task/group counts and a group count badge on the Groups toggle for quick at-a-glance status
- Packaged as a native Android app via Capacitor, with magic-link sign-in working through a custom URL scheme deep link

## Open The App

Use either option:

1. Double-click `index.html`
2. Double-click `open-super-task.cmd`

The app works fully local-only with no Supabase configuration. Cloud sync is opt-in (see below).

## How To Use

1. Tap the floating "+" button (bottom-right) to open the task editor popup; fill out Task, Group, Due date, Priority, and Notes, then select Add task.
2. Click any row field to edit in place in table view, or click a task card in card view to reopen the same task editor popup pre-filled for editing.
3. Toggle completion with the checkbox.
4. Use the drag handle to reorder tasks in table view (only when sort is in manual mode), or drag a task within its card in card view.
5. Use column headers to sort and cycle back to manual ordering in table view, or the Sort tasks menu in card view.
6. Open Groups to manage saved groups (the button shows a live count of your groups).
7. Open the "More ⋮" menu for Export backup and Import backup.
8. If cloud sync is configured, sign in with a magic link to sync tasks/groups across devices; once signed in, "Refresh from cloud" and "Sign out" are also in the "More ⋮" menu.

## Cloud Sync (Optional)

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for full setup steps. In short:

- Copy `auth-config.example.js` to `auth-config.js` and add your Supabase project URL + anon key.
- Sign in with the magic-link form in the app header.
- While signed in, the cloud copy (Supabase `tasks`/`groups` tables) is treated as the source of truth: every app load / sign-in pulls the latest cloud data, and every local task/group edit is pushed to the cloud immediately.
- If offline or signed out, edits are saved locally and queued; a "N changes pending sync" indicator shows in the header, and affected rows get a small amber marker. Queued changes push automatically once you're back online and signed in (also retried on a timer and on browser reconnect), or you can use "Refresh from cloud" (in the "More ⋮" menu) / re-visit the app to trigger a push+pull.
- On Android cold app launches, initial cloud bootstrap now auto-retries briefly if the first request fails (a WebView startup timing edge case), so users usually do not need to close/reopen the app.
- Once signed in, the header shows a single combined "Logged in - your@email.com" pill; "Refresh from cloud" and "Sign out" live in the "More ⋮" menu.
- While signed in, other open tabs/devices on the same account are notified of changes via Supabase Realtime and refresh automatically (requires Realtime enabled on the `tasks`/`groups` tables; see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)).
- Each task/group tracks an `updatedAt` timestamp; cloud pulls merge per-record instead of blanket-overwriting, so a more recently edited local row survives a pull from slightly older cloud data.
- Import backup and Export backup remain available at all times (including signed out) for local testing and manual backups. Importing a backup while signed in also pushes the imported data to your cloud account, so it survives future syncs.

Known limitation: conflict resolution is per-record (whole row wins by timestamp), not field-level merging.

## Data And Storage

- Primary storage: IndexedDB database `super-task-db`
- Stores:
	- `tasks`
	- `groups`
- Fallback storage key: `super-task-fallback` (localStorage)
- Column widths key: `super-task-col-widths` (localStorage)
- Offline/pending cloud sync queue key: `super-task-sync-queue` (localStorage)
- Cloud copy (when configured): Supabase Postgres `tasks`/`groups` tables, scoped by `user_id`, RLS-protected (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md))

## Offline And Install

- `service-worker.js` caches app shell assets for offline use
- `manifest.json` enables install-to-home-screen / standalone app behavior on supported browsers

## Project Files

- `index.html`: UI structure and service worker registration
- `styles.css`: visual styling and layout
- `core.js`: shared constants and initial state shape
- `dom.js`: centralized DOM element lookups
- `bootstrap.js`: preference restore and event listener wiring
- `auth-config.js` / `auth-config.example.js`: Supabase project URL + anon key (not committed with real secrets)
- `auth.js`: Supabase client init, magic-link sign-in, session/callback handling, sign-out
- `storage.js`: IndexedDB/localStorage persistence layer
- `repositories.js`: task/group mutation methods; calls local persistence + cloud sync
- `sync-queue.js`: persistent offline/pending cloud-sync queue with retry
- `app.js`: app state, rendering, interactions, cloud bootstrap/sync orchestration, backup/restore
- `manifest.json`: PWA metadata and icons
- `service-worker.js`: offline cache and fetch strategy
- `open-super-task.cmd`: quick launcher for Windows
- `SUPABASE_SETUP.md`: step-by-step Supabase project/schema setup
- `AUTH_IMPLEMENTATION_PLAN.md` / `IMPLEMENTATION_ROADMAP.md`: auth/sync design plan and status

## Android (Capacitor)

The web app is packaged for Android via [Capacitor](https://capacitorjs.com), with no changes to how the static app itself runs.

- `package.json` / `node_modules/`: Capacitor CLI + Android platform tooling (npm-only, no bundler/build step for the web code itself)
- `capacitor.config.json`: app id (`com.neworchard.supertask`), app name, and `webDir: "www"`
- `scripts/build-www.js`: copies just the runtime web files (no docs, no tooling) into `www/`, which is the folder Capacitor packages into the Android app
- `android/`: the generated native Android Studio project (tracked in git per Capacitor convention)

Prerequisites to build/run on Android (not needed for the web app itself):

- Node.js + npm (already used for the Capacitor CLI)
- A JDK (17 or 21; NOT the JDK 25 bundled with newer Android Studio installs — Gradle 8.11/AGP 8.7 here don't support it yet and fail with "Unsupported class file major version 69"). Microsoft Build of OpenJDK 21 (`winget install Microsoft.OpenJDK.21`) is known to work.
- Android Studio + Android SDK
- `JAVA_HOME` pointed at the JDK 17/21 install, and `ANDROID_HOME` pointed at the Android SDK (e.g. `%LOCALAPPDATA%\Android\Sdk`)

Workflow once those are installed:

```
npm install
npm run cap:sync      # rebuilds www/ from source files and syncs the android/ project
npm run android:open  # opens the project in Android Studio
```

Run `npm run cap:sync` again any time the web source files change, before opening/building in Android Studio. The app has been built and run successfully on both an emulator and a physical device (Pixel 10 Pro).

Note: browser deploys do not auto-update an installed Android build. After web code changes, run `npm run cap:sync`, rebuild in Android Studio, and reinstall/update the app.

### Magic-link sign-in on Android

Tapping a magic-link email on a phone normally opens the phone's browser, not the installed app (they have separate storage). To make sign-in work inside the native app:

- The app registers a custom URL scheme, `supertask://auth-callback`, as an Android intent-filter (`android/app/src/main/AndroidManifest.xml`).
- `auth.js` sends that URL as the magic-link redirect when running natively (detected via `window.Capacitor.isNativePlatform()`), and uses the `@capacitor/app` plugin's `appUrlOpen`/`getLaunchUrl` to catch the deep link and complete sign-in.
- You must add `supertask://auth-callback` as a Redirect URL in the Supabase dashboard (Authentication -> URL Configuration) for this to work — see [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- This requires a full Android rebuild (not just `npm run www:build`) since it touches `AndroidManifest.xml` and native plugins.