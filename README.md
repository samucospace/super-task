# Super Task

Super Task is a local-first task board that runs directly in the browser from static files. There is no build step, no package install, and no local server required.

## Highlights

- Add, edit, complete, and delete tasks in a spreadsheet-like table
- Drag and drop rows to reorder tasks in manual mode
- Sort by Group, Due date, or Priority (asc -> desc -> back to manual order)
- Manage groups (add, rename, delete) from the Groups panel
- Auto-register groups when you type a new group while creating or editing a task
- Resize table columns, with widths remembered between sessions
- Export and import backups as JSON
- Delete all completed tasks in one action
- Persist data with IndexedDB
- Automatic localStorage fallback when IndexedDB is unavailable
- Offline support with a service worker and installable PWA manifest

## Open The App

Use either option:

1. Double-click `index.html`
2. Double-click `open-super-task.cmd`

## How To Use

1. Fill out Task, Group, Due date, and Priority, then select Add task.
2. Click any row field to edit in place.
3. Toggle completion with the checkbox.
4. Use the drag handle to reorder tasks (only when sort is in manual mode).
5. Use column headers to sort and cycle back to manual ordering.
6. Open Groups to manage saved groups.
7. Use Export backup and Import backup to move data between devices.

## Data And Storage

- Primary storage: IndexedDB database `super-task-db`
- Stores:
	- `tasks`
	- `groups`
- Fallback storage key: `super-task-fallback` (localStorage)
- Column widths key: `super-task-col-widths` (localStorage)

## Offline And Install

- `service-worker.js` caches app shell assets for offline use
- `manifest.json` enables install-to-home-screen / standalone app behavior on supported browsers

## Project Files

- `index.html`: UI structure and service worker registration
- `styles.css`: visual styling and layout
- `app.js`: app state, interactions, sorting, persistence, backup/restore
- `manifest.json`: PWA metadata and icons
- `service-worker.js`: offline cache and fetch strategy
- `open-super-task.cmd`: quick launcher for Windows