# CLAUDE.md

## Purpose

This file provides persistent project context for AI-assisted chat sessions in this repository.

## Project Summary

Super Task is a local-first task board app built from static files only.

- No build step
- No package manager dependencies
- No backend server
- Runs by opening `index.html` directly (or `open-super-task.cmd`)

## Current Stack

- HTML: `index.html`
- CSS: `styles.css`
- JavaScript: `app.js`
- PWA assets: `manifest.json`, `service-worker.js`

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

## Storage Model

- IndexedDB database: `super-task-db`
- Object stores:
  - `tasks`
  - `groups`
- localStorage fallback key: `super-task-fallback`
- localStorage column widths key: `super-task-col-widths`

## Notes For Future Chat Edits

- Preserve local-first behavior (no server assumptions).
- Prefer minimal, targeted edits over broad refactors.
- Keep the task table compact; popovers should overlay, not stretch row height.
- Maintain keyboard accessibility for interactive elements.
- Keep notes capped at 1000 characters unless explicitly changed.
- Avoid introducing build tools or frameworks unless explicitly requested.

## Quick Validation Checklist

After UI or behavior changes:

1. Verify no syntax errors in `index.html`, `app.js`, and `styles.css`.
2. Confirm drag reorder still works in manual mode.
3. Confirm sort cycle still returns to manual order.
4. Confirm notes open/edit/close behavior works in both composer and task rows.
5. Confirm data persists after reload.

## Common User Intent In This Repo

When the user asks for app changes, they usually want direct implementation in files (not just a plan).
