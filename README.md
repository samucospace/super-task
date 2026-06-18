# Super Task

This app is a static browser-based task board inspired by the attached screenshot. It runs directly from files, so there is no dev server, no build step, and no localhost setup.

## Open the app

Use one of these options:

1. Double-click `index.html`.
2. Double-click `open-super-task.cmd`.

## What it does

- Starts with an empty task list
- Adds new tasks
- Edits task title, group, due date, priority, and completion directly in the table
- Deletes tasks
- Moves tasks up and down
- Sorts by group, due date, and priority from the table headers
- Returns to manual ordering after cycling an active sort header
- Persists tasks between sessions with IndexedDB
- Falls back to localStorage if IndexedDB is unavailable on the local file origin

## Files

- `index.html`: app structure
- `styles.css`: screenshot-style dark UI
- `app.js`: task logic and persistence