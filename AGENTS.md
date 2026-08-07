# AGENTS.md

## Purpose

This guide helps coding agents work quickly and safely in Super Task.

## Project Snapshot

- Local-first static web app.
- No build step, no package manager, no backend.
- Run by opening `index.html` directly (or `open-super-task.cmd`).
- Core files:
  - `index.html` for structure
  - `styles.css` for styling/layout
  - `app.js` for state, interactions, and persistence
  - `manifest.json` and `service-worker.js` for PWA/offline

## Agent Priorities

1. Keep edits minimal and targeted.
2. Preserve existing behaviors unless explicitly asked to change them.
3. Maintain keyboard accessibility for interactive controls.
4. Keep the app local-first (no server assumptions).
5. Avoid introducing frameworks/build tooling unless requested.

## Data Model And Persistence

- IndexedDB database: `super-task-db`
- Stores: `tasks`, `groups`
- localStorage fallback key: `super-task-fallback`
- localStorage column widths key: `super-task-col-widths`
- localStorage view mode key: `super-task-view-mode`

Task shape (logical):
- `id`, `title`, `group`, `dueDate`, `priority`, `notes`, `completed`, `order`

## Current UI Modes

- List/table mode:
  - Inline editing in table rows.
  - Manual drag reorder when sort is manual (`order`).
  - Sort cycle on sortable columns: asc -> desc -> manual order.
- Card mode:
  - One card per group.
  - Cards size dynamically by open-task count.
  - Completed tasks are not shown in card mode.
  - Clicking a card opens a modal with that group task list.
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

## Validation Checklist (After Changes)

1. Syntax/diagnostics are clean in `index.html`, `app.js`, and `styles.css`.
2. Add/edit/delete tasks still works in main table.
3. Drag reorder still works in manual sort mode.
4. Sort cycle still returns to manual order.
5. Group add/rename/delete and auto-register still work.
6. Notes open/edit/close still work in composer and task rows.
7. Card mode toggle works and hides completed tasks.
8. Card click opens group modal; modal editing and add-task work.
9. Delete completed action still works correctly.
10. Data persists after reload (IndexedDB, with localStorage fallback behavior intact).

## Safe Scope Defaults

- If request is ambiguous, prefer smallest UX-consistent implementation.
- Do not perform broad refactors while implementing feature tweaks.
- Do not remove existing user data keys or migration behavior without explicit request.
