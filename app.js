const DB_NAME = "super-task-db";
const DB_VERSION = 2;
const STORE_TASKS = "tasks";
const STORE_GROUPS = "groups";

const GROUP_COLORS = ["#b0dd48","#8e59e8","#ea408d","#6f9cff","#79c58c","#f2b35a","#5fd3d4"];
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, None: 3 };
const DEFAULT_COL_WIDTHS = { "col-item": 360, "col-group": 200, "col-due": 160, "col-priority": 140, "col-notes": 220 };

const state = {
  db: null,
  tasks: [],
  groups: [],
  storageMode: "indexeddb",
  sort: { key: "order", direction: "asc" },
  colWidths: { ...DEFAULT_COL_WIDTHS },
  editingGroupId: null,
  viewMode: "list",
  groupModal: { open: false, groupName: "" }
};

// Drag state
let dragSrcId = null;
let dragHandleActive = false;

// Resize state
let resizeState = null;

// --- DOM refs ---
const form              = document.querySelector("#task-form");
const titleInput        = document.querySelector("#task-title");
const groupInput        = document.querySelector("#task-group");
const dueDateInput      = document.querySelector("#task-due-date");
const priorityInput     = document.querySelector("#task-priority");
const notesInput        = document.querySelector("#task-notes");
const composerNotesCell = document.querySelector(".composer-notes-cell");
const composerNotesPreview = document.querySelector("#composer-notes-preview");
const composerNotesEditor = document.querySelector("#composer-notes-editor");
const composerNotesCount = document.querySelector("#composer-notes-count");
const tableFrame        = document.querySelector(".table-frame");
const tableBody         = document.querySelector("#task-table-body");
const groupCardBoard    = document.querySelector("#group-card-board");
const groupModal        = document.querySelector("#group-modal");
const groupModalTitle   = document.querySelector("#group-modal-title");
const groupModalTableBody = document.querySelector("#group-modal-table-body");
const groupModalAddTaskBtn = document.querySelector("#group-modal-add-task-btn");
const groupModalCloseBtn = document.querySelector("#group-modal-close-btn");
const taskCount             = document.querySelector("#task-count");
const deleteCompletedBtn    = document.querySelector("#delete-completed-btn");
const rowTemplate       = document.querySelector("#task-row-template");
const storageStatus     = document.querySelector("#storage-status");
const sortButtons       = Array.from(document.querySelectorAll(".sort-button"));
const groupDatalist     = document.querySelector("#group-datalist");
const groupsPanel       = document.querySelector("#groups-panel");
const groupsList        = document.querySelector("#groups-list");
const toggleGroupsBtn   = document.querySelector("#toggle-groups-btn");
const toggleViewBtn     = document.querySelector("#toggle-view-btn");
const addGroupForm      = document.querySelector("#add-group-form");
const newGroupNameInput = document.querySelector("#new-group-name");
const exportBtn         = document.querySelector("#export-btn");
const importFile        = document.querySelector("#import-file");

document.addEventListener("DOMContentLoaded", initializeApp);

// ── INIT ──────────────────────────────────────────────────────────────────────

async function initializeApp() {
  dueDateInput.value = todayString();

  const savedWidths = localStorage.getItem("super-task-col-widths");
  if (savedWidths) {
    try { Object.assign(state.colWidths, JSON.parse(savedWidths)); } catch (_) {}
  }
  applyColumnWidths();

  const savedViewMode = localStorage.getItem("super-task-view-mode");
  if (savedViewMode === "cards") {
    state.viewMode = "cards";
  }
  applyViewMode(false);

  try {
    state.db = await openDatabase();
    state.tasks  = await readAllFromStore(STORE_TASKS);
    state.groups = await readAllFromStore(STORE_GROUPS);
    setStorageStatus("IndexedDB ready", false);
  } catch (err) {
    console.error("IndexedDB unavailable, using localStorage.", err);
    state.storageMode = "localstorage";
    const fallback    = readLocalFallback();
    state.tasks       = fallback.tasks  || [];
    state.groups      = fallback.groups || [];
    setStorageStatus("Using local fallback", true);
  }

  attachEventListeners();
  closeComposerNotesEditor(false);
  initColumnResize();
  renderGroups();
  updateGroupDatalist();
  renderTasks();
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────

function attachEventListeners() {
  form.addEventListener("submit", handleTaskSubmit);
  form.addEventListener("click", handleComposerClick);
  form.addEventListener("input", handleComposerInput);
  form.addEventListener("keydown", handleComposerKeydown);
  form.addEventListener("focusout", handleComposerFocusOut);
  tableBody.addEventListener("click",         handleTableClick);
  deleteCompletedBtn.addEventListener("click", handleDeleteCompleted);
  tableBody.addEventListener("change",    handleTableChange);
  tableBody.addEventListener("input",     handleTableInput);
  tableBody.addEventListener("keydown",   handleTableKeydown);
  tableBody.addEventListener("focusout",  handleTableFocusOut);
  tableBody.addEventListener("mousedown", (e) => { dragHandleActive = !!e.target.closest(".drag-handle"); });
  tableBody.addEventListener("dragstart", handleDragStart);
  tableBody.addEventListener("dragover",  handleDragOver);
  tableBody.addEventListener("dragleave", handleDragLeave);
  tableBody.addEventListener("drop",      handleDrop);
  tableBody.addEventListener("dragend",   handleDragEnd);
  sortButtons.forEach(btn => btn.addEventListener("click", handleSortClick));
  toggleGroupsBtn.addEventListener("click", toggleGroupsPanel);
  toggleViewBtn.addEventListener("click", toggleViewMode);
  addGroupForm.addEventListener("submit", handleAddGroup);
  groupsList.addEventListener("click",   handleGroupsListClick);
  groupsList.addEventListener("keydown", handleGroupsListKeydown);
  groupCardBoard.addEventListener("change", handleCardBoardChange);
  groupCardBoard.addEventListener("click", handleCardBoardClick);
  groupModalTableBody.addEventListener("click", handleGroupModalTableClick);
  groupModalTableBody.addEventListener("change", handleGroupModalTableChange);
  groupModalTableBody.addEventListener("input", handleGroupModalTableInput);
  groupModalTableBody.addEventListener("keydown", handleGroupModalTableKeydown);
  groupModalTableBody.addEventListener("focusout", handleGroupModalTableFocusOut);
  groupModalCloseBtn.addEventListener("click", closeGroupModal);
  groupModalAddTaskBtn.addEventListener("click", handleGroupModalAddTask);
  groupModal.addEventListener("click", handleGroupModalShellClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  exportBtn.addEventListener("click",   exportBackup);
  importFile.addEventListener("change", handleImportFile);
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape" && state.groupModal.open) {
    closeGroupModal();
  }
}

function toggleViewMode() {
  state.viewMode = state.viewMode === "list" ? "cards" : "list";
  applyViewMode(true);
  renderTasks();
}

function applyViewMode(shouldPersist) {
  const inCardsMode = state.viewMode === "cards";

  if (toggleViewBtn) {
    toggleViewBtn.textContent = inCardsMode ? "Table view" : "Card view";
    toggleViewBtn.setAttribute("aria-pressed", inCardsMode ? "true" : "false");
  }

  if (tableFrame && groupCardBoard) {
    if (inCardsMode) {
      tableFrame.setAttribute("hidden", "");
      groupCardBoard.removeAttribute("hidden");
    } else {
      groupCardBoard.setAttribute("hidden", "");
      tableFrame.removeAttribute("hidden");
    }
  }

  if (shouldPersist) {
    localStorage.setItem("super-task-view-mode", state.viewMode);
  }
}

// ── TASK FORM ─────────────────────────────────────────────────────────────────

function handleTaskSubmit(event) {
  event.preventDefault();
  const groupName = groupInput.value.trim();
  const task = {
    id:        createId(),
    title:     titleInput.value.trim(),
    group:     groupName,
    dueDate:   dueDateInput.value,
    priority:  priorityInput.value,
    notes:     normalizeNotes(notesInput.value.trim()),
    completed: false,
    order:     state.tasks.length
  };
  if (!task.title || !task.group || !task.dueDate) return;
  state.tasks = insertTaskByCurrentSort(task);
  autoRegisterGroup(groupName).then(() => syncTasks()).then(() => {
    renderTasks();
    form.reset();
    closeComposerNotesEditor(false);
    dueDateInput.value = todayString();
    priorityInput.value = "Low";
    titleInput.focus();
  });
}

function handleComposerClick(event) {
  if (event.target.closest(".composer-notes-done-btn")) {
    closeComposerNotesEditor(true);
    return;
  }

  if (event.target.closest("#composer-notes-preview")) {
    if (composerNotesCell?.classList.contains("notes-active")) {
      closeComposerNotesEditor(true);
      return;
    }
    openComposerNotesEditor();
  }
}

function handleComposerInput(event) {
  if (event.target !== notesInput) return;
  if (composerNotesCount) {
    composerNotesCount.textContent = `${notesInput.value.length}/1000`;
  }
}

function handleComposerKeydown(event) {
  if (event.target === composerNotesPreview && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openComposerNotesEditor();
    return;
  }

  if (event.target !== notesInput || event.key !== "Escape") return;
  event.preventDefault();
  closeComposerNotesEditor(true);
}

function handleComposerFocusOut(event) {
  const inComposerEditor = event.target.closest("#composer-notes-editor");
  if (!inComposerEditor || !composerNotesCell?.classList.contains("notes-active")) return;

  const next = event.relatedTarget;
  if (next && composerNotesEditor?.contains(next)) return;
  if (next && next === composerNotesPreview) return;
  closeComposerNotesEditor(false);
}

function openComposerNotesEditor() {
  if (!composerNotesCell || !composerNotesEditor || !notesInput) return;
  composerNotesCell.classList.add("notes-active");
  composerNotesEditor.hidden = false;
  if (composerNotesCount) {
    composerNotesCount.textContent = `${notesInput.value.length}/1000`;
  }
  notesInput.focus();
  notesInput.setSelectionRange(notesInput.value.length, notesInput.value.length);
}

function closeComposerNotesEditor(focusPreview) {
  if (!composerNotesCell || !composerNotesEditor || !composerNotesPreview || !notesInput) return;
  const normalized = normalizeNotes(notesInput.value.trim());
  notesInput.value = normalized;
  composerNotesPreview.textContent = normalized ? summarizeNotes(normalized) : "No notes";
  composerNotesPreview.classList.toggle("is-empty", !normalized);
  if (composerNotesCount) {
    composerNotesCount.textContent = `${normalized.length}/1000`;
  }
  composerNotesEditor.hidden = true;
  composerNotesCell.classList.remove("notes-active");
  if (focusPreview) composerNotesPreview.focus();
}

// ── TABLE INTERACTIONS ────────────────────────────────────────────────────────

function handleTableClick(event) {
  const notesDoneBtn = event.target.closest(".notes-done-btn");
  if (notesDoneBtn) {
    const row = notesDoneBtn.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    saveNotesFromRow(row.dataset.taskId, row, true);
    return;
  }

  const notesPreview = event.target.closest(".notes-preview");
  if (notesPreview) {
    const row = notesPreview.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    if (row.classList.contains("notes-active")) {
      saveNotesFromRow(row.dataset.taskId, row, true);
      return;
    }
    openNotesEditor(row.dataset.taskId, row);
    return;
  }

  const btn = event.target.closest(".delete-task");
  if (!btn) return;
  const row = btn.closest("tr");
  if (!row?.dataset.taskId) return;
  state.tasks = state.tasks.filter(t => t.id !== row.dataset.taskId);
  syncTasks().then(renderTasks);
}

function handleTableInput(event) {
  const text = event.target.closest(".task-notes-text");
  if (!text) return;
  const count = text.closest(".notes-editor")?.querySelector(".notes-count");
  if (count) count.textContent = `${text.value.length}/1000`;
}

function handleTableKeydown(event) {
  const preview = event.target.closest(".notes-preview");
  if (preview && (event.key === "Enter" || event.key === " ")) {
    const row = preview.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    event.preventDefault();
    openNotesEditor(row.dataset.taskId, row);
    return;
  }

  const text = event.target.closest(".task-notes-text");
  if (!text || event.key !== "Escape") return;
  const row = text.closest("tr[data-task-id]");
  if (!row?.dataset.taskId) return;
  event.preventDefault();
  saveNotesFromRow(row.dataset.taskId, row, true);
  row.querySelector(".notes-preview")?.focus();
}

function handleTableFocusOut(event) {
  const editor = event.target.closest(".notes-editor");
  if (!editor) return;
  const row = editor.closest("tr[data-task-id]");
  if (!row?.dataset.taskId || !row.classList.contains("notes-active")) return;

  const next = event.relatedTarget;
  if (next && editor.contains(next)) return;
  if (next && next === row.querySelector(".notes-preview")) return;

  saveNotesFromRow(row.dataset.taskId, row, true);
}

function handleDeleteCompleted() {
  const count = state.tasks.filter(t => t.completed).length;
  if (!count) return;
  if (!confirm(`Delete ${count} completed task${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
  state.tasks = state.tasks.filter(t => !t.completed);
  state.tasks.forEach((t, i) => { t.order = i; });
  syncTasks().then(renderTasks);
}

function handleTableChange(event) {
  const el = event.target;
  const row = el.closest("tr[data-task-id]");
  if (!row) return;
  const task = state.tasks.find(t => t.id === row.dataset.taskId);
  if (!task) return;

  if (el.classList.contains("task-complete")) {
    task.completed = el.checked;
    row.classList.toggle("is-complete", task.completed);
    state.tasks = positionTaskByCurrentSort(task);
    syncTasks().then(renderTasks);
    return;
  }

  const field = el.closest(".task-field");
  if (!field) return;
  const fieldName = field.dataset.field;

  if (fieldName === "group") {
    const trimmed = el.value.trim();
    if (!trimmed) return;
    task.group = trimmed;
    const dot = row.querySelector(".group-dot");
    if (dot) dot.style.background = colorForGroup(trimmed);
    autoRegisterGroup(trimmed).then(() => syncTasks());
    return;
  }
  if (fieldName === "title") {
    const v = el.value.trim();
    if (v) task.title = v;
    syncTasks();
    return;
  }
  if (fieldName === "dueDate" && el.value) {
    task.dueDate = el.value;
    syncTasks();
    return;
  }
  if (fieldName === "priority") {
    task.priority = el.value;
    el.dataset.priority = el.value;
    syncTasks();
    return;
  }
}

// ── DRAG & DROP ───────────────────────────────────────────────────────────────

function handleDragStart(event) {
  if (!dragHandleActive) { event.preventDefault(); return; }
  const row = event.target.closest("tr[data-task-id]");
  if (!row || state.sort.key !== "order") { event.preventDefault(); return; }
  dragSrcId = row.dataset.taskId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragSrcId);
  row.classList.add("row-dragging");
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const row = event.target.closest("tr[data-task-id]");
  if (!row || row.dataset.taskId === dragSrcId) return;
  clearDropClasses();
  const rect = row.getBoundingClientRect();
  row.classList.add(event.clientY < rect.top + rect.height / 2 ? "drop-above" : "drop-below");
}

function handleDragLeave(event) {
  const row = event.target.closest("tr[data-task-id]");
  if (row && !row.contains(event.relatedTarget)) {
    row.classList.remove("drop-above", "drop-below");
  }
}

function handleDrop(event) {
  event.preventDefault();
  const targetRow = event.target.closest("tr[data-task-id]");
  if (!targetRow || !dragSrcId || targetRow.dataset.taskId === dragSrcId) return;

  const insertAfter = event.clientY >= targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
  const ordered = getManualTasks();
  const srcIdx  = ordered.findIndex(t => t.id === dragSrcId);
  const tgtId   = targetRow.dataset.taskId;

  const [removed] = ordered.splice(srcIdx, 1);
  const newTgtIdx = ordered.findIndex(t => t.id === tgtId);
  ordered.splice(insertAfter ? newTgtIdx + 1 : newTgtIdx, 0, removed);
  ordered.forEach((t, i) => { t.order = i; });
  state.tasks = ordered;
  syncTasks().then(renderTasks);
}

function handleDragEnd() {
  dragSrcId = null;
  dragHandleActive = false;
  clearDropClasses();
  document.querySelectorAll(".row-dragging").forEach(el => el.classList.remove("row-dragging"));
}

function clearDropClasses() {
  document.querySelectorAll(".drop-above, .drop-below").forEach(el => el.classList.remove("drop-above", "drop-below"));
}

// ── SORT ──────────────────────────────────────────────────────────────────────

function handleSortClick(event) {
  const key = event.currentTarget.dataset.sortKey;
  if (state.sort.key === key) {
    if (state.sort.direction === "asc") {
      state.sort.direction = "desc";
    } else {
      state.sort.key = "order";
      state.sort.direction = "asc";
    }
  } else {
    state.sort.key = key;
    state.sort.direction = "asc";
  }
  renderTasks();
}

// ── GROUPS PANEL ──────────────────────────────────────────────────────────────

function toggleGroupsPanel() {
  const hidden = groupsPanel.hasAttribute("hidden");
  if (hidden) {
    groupsPanel.removeAttribute("hidden");
    toggleGroupsBtn.innerHTML = "Groups &#9650;";
  } else {
    groupsPanel.setAttribute("hidden", "");
    toggleGroupsBtn.innerHTML = "Groups &#9660;";
  }
}

function handleAddGroup(event) {
  event.preventDefault();
  const name = newGroupNameInput.value.trim();
  if (!name) return;
  autoRegisterGroup(name).then(() => {
    newGroupNameInput.value = "";
    newGroupNameInput.focus();
  });
}

function handleGroupsListClick(event) {
  const btn  = event.target.closest("button");
  if (!btn) return;
  const item    = btn.closest(".group-item");
  if (!item) return;
  const groupId = item.dataset.groupId;

  if (btn.classList.contains("edit-group")) {
    state.editingGroupId = groupId;
    renderGroups();
    item.querySelector && setTimeout(() => {
      const inp = groupsList.querySelector(`.group-item[data-group-id="${groupId}"] .group-edit-input`);
      if (inp) inp.focus();
    }, 0);
    return;
  }
  if (btn.classList.contains("save-group")) {
    const inp     = item.querySelector(".group-edit-input");
    const newName = inp ? inp.value.trim() : "";
    if (!newName) return;
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    const oldName = group.name;
    group.name = newName;
    state.tasks.forEach(t => { if (t.group === oldName) t.group = newName; });
    state.editingGroupId = null;
    Promise.all([saveGroupToDb(group), syncTasks()]).then(() => {
      renderGroups();
      updateGroupDatalist();
      renderTasks();
    });
    return;
  }
  if (btn.classList.contains("cancel-group")) {
    state.editingGroupId = null;
    renderGroups();
    return;
  }
  if (btn.classList.contains("delete-group")) {
    state.groups = state.groups.filter(g => g.id !== groupId);
    deleteGroupFromDb(groupId).then(() => { renderGroups(); updateGroupDatalist(); });
    return;
  }
}

function handleGroupsListKeydown(event) {
  const inp = event.target.closest(".group-edit-input");
  if (!inp) return;
  const item = inp.closest(".group-item");
  if (event.key === "Enter")  item?.querySelector(".save-group")?.click();
  if (event.key === "Escape") item?.querySelector(".cancel-group")?.click();
}

function renderGroups() {
  groupsList.innerHTML = "";
  const sorted = [...state.groups].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (!sorted.length) {
    const p = document.createElement("p");
    p.className = "groups-empty";
    p.textContent = "No groups yet. Groups are auto-saved when you add tasks, or add one above.";
    groupsList.appendChild(p);
    return;
  }
  for (const group of sorted) {
    const isEditing = state.editingGroupId === group.id;
    const item = document.createElement("div");
    item.className = "group-item";
    item.dataset.groupId = group.id;

    const dot = document.createElement("span");
    dot.className = "group-dot";
    dot.style.background = colorForGroup(group.name);
    item.appendChild(dot);

    const actions = document.createElement("div");
    actions.className = "group-item-actions";

    if (isEditing) {
      const inp = document.createElement("input");
      inp.className = "group-edit-input";
      inp.type = "text";
      inp.value = group.name;
      inp.maxLength = 80;
      inp.setAttribute("aria-label", "Edit group name");
      item.appendChild(inp);

      const saveBtn = makeBtn("✓", "icon-button save-group", "Save");
      const cancelBtn = makeBtn("✕", "icon-button cancel-group", "Cancel");
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
    } else {
      const span = document.createElement("span");
      span.className = "group-item-name";
      span.textContent = group.name;
      item.appendChild(span);

      const editBtn = makeBtn("✏", "icon-button edit-group", "Rename");
      const delBtn  = makeBtn("✕", "icon-button delete-group danger", "Delete");
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
    }
    item.appendChild(actions);
    groupsList.appendChild(item);
  }
}

function makeBtn(text, classes, title) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = classes;
  btn.title = title;
  btn.textContent = text;
  return btn;
}

function updateGroupDatalist() {
  groupDatalist.innerHTML = "";
  const sorted = [...state.groups].sort((a, b) => a.name.localeCompare(b.name));
  for (const g of sorted) {
    const opt = document.createElement("option");
    opt.value = g.name;
    groupDatalist.appendChild(opt);
  }
}

async function autoRegisterGroup(name) {
  if (!name || state.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) return;
  const group = { id: createId(), name };
  state.groups.push(group);
  await saveGroupToDb(group);
  renderGroups();
  updateGroupDatalist();
}

// ── RENDER TASKS ──────────────────────────────────────────────────────────────

function renderTasks() {
  renderSortState();
  const tasks = getVisibleTasks();

  if (state.viewMode === "cards") {
    renderGroupCards(tasks);
  } else {
    renderTaskTable(tasks);
  }

  const completedCount = state.tasks.filter(t => t.completed).length;
  const totalCount     = state.tasks.length;
  taskCount.textContent = completedCount
    ? `${totalCount} task${totalCount === 1 ? "" : "s"} · ${completedCount} completed`
    : `${totalCount} task${totalCount === 1 ? "" : "s"}`;
  if (deleteCompletedBtn) {
    deleteCompletedBtn.hidden = completedCount === 0;
  }
}

function renderTaskTable(tasks) {
  tableBody.innerHTML = "";
  const isManual = state.sort.key === "order";

  if (!tasks.length) {
    tableBody.innerHTML = '<tr class="empty-row"><td colspan="8">No tasks yet. Add one above to get started.</td></tr>';
    return;
  }

  for (const task of tasks) {
    tableBody.appendChild(createTaskRow(task, { isManual, rowVariant: "main" }));
  }
}

function createTaskRow(task, options) {
  const isManual = !!options.isManual;
  const rowVariant = options.rowVariant || "main";
  const frag = rowTemplate.content.cloneNode(true);
  const row  = frag.querySelector("tr");
  row.dataset.taskId = task.id;
  row.dataset.rowVariant = rowVariant;
  row.setAttribute("draggable", isManual ? "true" : "false");
  row.classList.toggle("is-complete", task.completed);

  const handle = frag.querySelector(".drag-handle");
  handle.style.opacity = isManual ? "1" : "0.3";
  handle.style.cursor  = isManual ? "grab" : "not-allowed";
  handle.title = isManual ? "Drag to reorder" : "Switch to manual order to reorder";

  frag.querySelector(".task-complete").checked     = task.completed;
  frag.querySelector(".task-title-input").value    = task.title;
  frag.querySelector(".task-group-input").value    = task.group;

  const dot = frag.querySelector(".group-dot");
  dot.style.background = colorForGroup(task.group);

  frag.querySelector(".due-indicator").style.setProperty("--progress", dueProgress(task.dueDate));
  frag.querySelector(".task-date-input").value = task.dueDate;

  const sel = frag.querySelector(".priority-select");
  sel.value = task.priority;
  sel.dataset.priority = task.priority;

  const notesText = normalizeNotes(task.notes);
  const notesPreview = frag.querySelector(".notes-preview");
  notesPreview.textContent = notesText ? summarizeNotes(notesText) : "No notes";
  notesPreview.classList.toggle("is-empty", !notesText);

  const notesArea = frag.querySelector(".task-notes-text");
  notesArea.value = notesText;
  frag.querySelector(".notes-count").textContent = `${notesText.length}/1000`;

  return frag;
}

function renderGroupCards(tasks) {
  groupCardBoard.innerHTML = "";

  const openTasks = tasks.filter(task => !task.completed);

  const groupsMap = new Map();
  for (const task of openTasks) {
    if (!groupsMap.has(task.group)) groupsMap.set(task.group, []);
    groupsMap.get(task.group).push(task);
  }

  const orderedGroups = [...groupsMap.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });

  if (!orderedGroups.length) {
    groupCardBoard.innerHTML = '<p class="group-card-empty">No open tasks to show in card view.</p>';
    return;
  }

  for (const [groupName, groupTasks] of orderedGroups) {
    const card = document.createElement("article");
    card.className = "group-card";
    card.dataset.groupName = groupName;
    card.style.setProperty("--card-span", String(Math.max(3, Math.min(12, 3 + Math.ceil(groupTasks.length * 1.2)))));

    const header = document.createElement("header");
    header.className = "group-card-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "group-card-title-wrap";

    const dot = document.createElement("span");
    dot.className = "group-dot";
    dot.style.background = colorForGroup(groupName);

    const title = document.createElement("h3");
    title.className = "group-card-title";
    title.textContent = groupName;

    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);

    const count = document.createElement("span");
    count.className = "group-card-count";
    count.textContent = `${groupTasks.length} task${groupTasks.length === 1 ? "" : "s"}`;

    header.appendChild(titleWrap);
    header.appendChild(count);

    const list = document.createElement("ul");
    list.className = "group-card-task-list";

    if (!groupTasks.length) {
      const empty = document.createElement("li");
      empty.className = "group-card-task-empty";
      empty.textContent = "No tasks in this group";
      list.appendChild(empty);
    } else {
      for (const task of groupTasks) {
        const item = document.createElement("li");
        item.className = "group-card-task";
        item.classList.toggle("is-complete", task.completed);

        const left = document.createElement("div");
        left.className = "group-card-task-main";

        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "card-task-complete";
        check.dataset.taskId = task.id;
        check.checked = task.completed;
        check.setAttribute("aria-label", `Mark ${task.title} complete`);

        const text = document.createElement("span");
        text.className = "group-card-task-title";
        text.textContent = task.title;

        left.appendChild(check);
        left.appendChild(text);

        const meta = document.createElement("span");
        meta.className = "group-card-task-meta";
        meta.textContent = `${task.dueDate} · ${task.priority}`;

        const del = document.createElement("button");
        del.type = "button";
        del.className = "icon-button card-task-delete danger";
        del.dataset.taskId = task.id;
        del.setAttribute("aria-label", `Delete ${task.title}`);
        del.textContent = "✕";

        item.appendChild(left);
        item.appendChild(meta);
        item.appendChild(del);
        list.appendChild(item);
      }
    }

    card.appendChild(header);
    card.appendChild(list);
    groupCardBoard.appendChild(card);
  }
}

function handleCardBoardChange(event) {
  const completeInput = event.target.closest(".card-task-complete");
  if (!completeInput?.dataset.taskId) return;

  const task = state.tasks.find(t => t.id === completeInput.dataset.taskId);
  if (!task) return;
  task.completed = completeInput.checked;

  state.tasks = positionTaskByCurrentSort(task);
  syncTasks().then(renderTasks);
}

function handleCardBoardClick(event) {
  if (!event.target.closest("input") && !event.target.closest("button")) {
    const card = event.target.closest(".group-card");
    if (card?.dataset.groupName) {
      openGroupModal(card.dataset.groupName);
      return;
    }
  }

  const deleteBtn = event.target.closest(".card-task-delete");
  if (!deleteBtn?.dataset.taskId) return;
  state.tasks = state.tasks.filter(task => task.id !== deleteBtn.dataset.taskId);
  syncTasks().then(renderTasks);
}

function openGroupModal(groupName) {
  state.groupModal.open = true;
  state.groupModal.groupName = groupName;
  groupModalTitle.textContent = `${groupName} tasks`;
  groupModal.removeAttribute("hidden");
  groupModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  renderGroupModalTasks();
}

function closeGroupModal() {
  state.groupModal.open = false;
  state.groupModal.groupName = "";
  groupModal.setAttribute("hidden", "");
  groupModal.setAttribute("aria-hidden", "true");
  groupModalTableBody.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function handleGroupModalShellClick(event) {
  if (event.target.closest("[data-close-group-modal='true']")) {
    closeGroupModal();
  }
}

function renderGroupModalTasks(focusTaskId) {
  if (!state.groupModal.open || !state.groupModal.groupName) return;
  groupModalTableBody.innerHTML = "";

  const groupTasks = getVisibleTasks().filter(task => task.group === state.groupModal.groupName);
  if (!groupTasks.length) {
    groupModalTableBody.innerHTML = '<tr class="empty-row"><td colspan="8">No tasks in this group.</td></tr>';
    return;
  }

  for (const task of groupTasks) {
    groupModalTableBody.appendChild(createTaskRow(task, { isManual: false, rowVariant: "group-modal" }));
  }

  if (focusTaskId) {
    const input = groupModalTableBody.querySelector(`tr[data-task-id="${focusTaskId}"] .task-title-input`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function handleGroupModalAddTask() {
  if (!state.groupModal.groupName) return;

  const task = {
    id:        createId(),
    title:     "New task",
    group:     state.groupModal.groupName,
    dueDate:   todayString(),
    priority:  "Low",
    notes:     "",
    completed: false,
    order:     state.tasks.length
  };

  state.tasks = insertTaskByCurrentSort(task);
  autoRegisterGroup(task.group)
    .then(() => syncTasks())
    .then(() => {
      renderTasks();
      renderGroupModalTasks(task.id);
    });
}

function handleGroupModalTableClick(event) {
  const notesDoneBtn = event.target.closest(".notes-done-btn");
  if (notesDoneBtn) {
    const row = notesDoneBtn.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    saveNotesFromRow(row.dataset.taskId, row, true);
    return;
  }

  const notesPreview = event.target.closest(".notes-preview");
  if (notesPreview) {
    const row = notesPreview.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    if (row.classList.contains("notes-active")) {
      saveNotesFromRow(row.dataset.taskId, row, true);
      return;
    }
    openNotesEditor(row.dataset.taskId, row, groupModalTableBody);
    return;
  }

  const btn = event.target.closest(".delete-task");
  if (!btn) return;
  const row = btn.closest("tr");
  if (!row?.dataset.taskId) return;
  state.tasks = state.tasks.filter(t => t.id !== row.dataset.taskId);
  syncTasks().then(() => {
    renderTasks();
    renderGroupModalTasks();
  });
}

function handleGroupModalTableInput(event) {
  const text = event.target.closest(".task-notes-text");
  if (!text) return;
  const count = text.closest(".notes-editor")?.querySelector(".notes-count");
  if (count) count.textContent = `${text.value.length}/1000`;
}

function handleGroupModalTableKeydown(event) {
  const preview = event.target.closest(".notes-preview");
  if (preview && (event.key === "Enter" || event.key === " ")) {
    const row = preview.closest("tr[data-task-id]");
    if (!row?.dataset.taskId) return;
    event.preventDefault();
    openNotesEditor(row.dataset.taskId, row, groupModalTableBody);
    return;
  }

  const text = event.target.closest(".task-notes-text");
  if (!text || event.key !== "Escape") return;
  const row = text.closest("tr[data-task-id]");
  if (!row?.dataset.taskId) return;
  event.preventDefault();
  saveNotesFromRow(row.dataset.taskId, row, true);
  row.querySelector(".notes-preview")?.focus();
}

function handleGroupModalTableFocusOut(event) {
  const editor = event.target.closest(".notes-editor");
  if (!editor) return;
  const row = editor.closest("tr[data-task-id]");
  if (!row?.dataset.taskId || !row.classList.contains("notes-active")) return;

  const next = event.relatedTarget;
  if (next && editor.contains(next)) return;
  if (next && next === row.querySelector(".notes-preview")) return;

  saveNotesFromRow(row.dataset.taskId, row, true);
}

function handleGroupModalTableChange(event) {
  const el = event.target;
  const row = el.closest("tr[data-task-id]");
  if (!row) return;
  const task = state.tasks.find(t => t.id === row.dataset.taskId);
  if (!task) return;

  if (el.classList.contains("task-complete")) {
    task.completed = el.checked;
    row.classList.toggle("is-complete", task.completed);
    state.tasks = positionTaskByCurrentSort(task);
    syncTasks().then(() => {
      renderTasks();
      renderGroupModalTasks();
    });
    return;
  }

  const field = el.closest(".task-field");
  if (!field) return;
  const fieldName = field.dataset.field;

  if (fieldName === "group") {
    const trimmed = el.value.trim();
    if (!trimmed) return;
    task.group = trimmed;
    const dot = row.querySelector(".group-dot");
    if (dot) dot.style.background = colorForGroup(trimmed);
    autoRegisterGroup(trimmed)
      .then(() => syncTasks())
      .then(() => {
        renderTasks();
        renderGroupModalTasks();
      });
    return;
  }
  if (fieldName === "title") {
    const v = el.value.trim();
    if (v) task.title = v;
    syncTasks().then(renderTasks);
    return;
  }
  if (fieldName === "dueDate" && el.value) {
    task.dueDate = el.value;
    syncTasks().then(renderTasks);
    return;
  }
  if (fieldName === "priority") {
    task.priority = el.value;
    el.dataset.priority = el.value;
    syncTasks().then(renderTasks);
  }
}

// ── COLUMN RESIZE ─────────────────────────────────────────────────────────────

function initColumnResize() {
  document.querySelectorAll(".resize-handle").forEach(h => h.addEventListener("mousedown", onResizeMouseDown));
}

function applyColumnWidths() {
  for (const [colId, w] of Object.entries(state.colWidths)) {
    const col = document.getElementById(colId);
    if (col) col.style.width = w + "px";
  }
}

function saveColWidths() {
  localStorage.setItem("super-task-col-widths", JSON.stringify(state.colWidths));
}

function onResizeMouseDown(event) {
  event.preventDefault();
  const colId        = event.currentTarget.dataset.col;
  const col          = document.getElementById(colId);
  if (!col) return;
  const currentWidth = col.getBoundingClientRect().width;
  resizeState = { colId, startX: event.clientX, startWidth: currentWidth };
  event.currentTarget.classList.add("active");
  document.addEventListener("mousemove", onResizeMouseMove);
  document.addEventListener("mouseup",   onResizeMouseUp);
  document.body.style.cursor     = "col-resize";
  document.body.style.userSelect = "none";
}

function onResizeMouseMove(event) {
  if (!resizeState) return;
  const w = Math.max(80, resizeState.startWidth + (event.clientX - resizeState.startX));
  state.colWidths[resizeState.colId] = w;
  const col = document.getElementById(resizeState.colId);
  if (col) col.style.width = w + "px";
}

function onResizeMouseUp() {
  if (!resizeState) return;
  saveColWidths();
  document.removeEventListener("mousemove", onResizeMouseMove);
  document.removeEventListener("mouseup",   onResizeMouseUp);
  document.body.style.cursor     = "";
  document.body.style.userSelect = "";
  document.querySelectorAll(".resize-handle.active").forEach(h => h.classList.remove("active"));
  resizeState = null;
}

// ── BACKUP / RESTORE ──────────────────────────────────────────────────────────

function exportBackup() {
  const data = {
    version:    1,
    exportedAt: new Date().toISOString(),
    tasks:      state.tasks,
    groups:     state.groups,
    colWidths:  state.colWidths
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "super-task-backup-" + todayString() + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.tasks)) { alert("Invalid backup: missing tasks array."); return; }
      state.tasks  = data.tasks;
      state.groups = Array.isArray(data.groups) ? data.groups : [];
      if (data.colWidths) {
        Object.assign(state.colWidths, data.colWidths);
        applyColumnWidths();
        saveColWidths();
      }
      await persistAllToStore(STORE_TASKS,  state.tasks);
      await persistAllToStore(STORE_GROUPS, state.groups);
      renderGroups();
      updateGroupDatalist();
      renderTasks();
      alert("Import complete: " + state.tasks.length + " tasks, " + state.groups.length + " groups.");
    } catch (err) {
      alert("Import failed: " + err.message);
    }
    importFile.value = "";
  };
  reader.readAsText(file);
}

// ── ORDERING ──────────────────────────────────────────────────────────────────

function getManualTasks() {
  return [...state.tasks].sort((a, b) => a.order - b.order);
}

function sortTaskSubset(tasks) {
  const sorted = [...tasks].sort(compareTasks);
  if (state.sort.direction === "desc") sorted.reverse();
  return sorted;
}

function reindexTasks(tasks) {
  return tasks.map((task, index) => ({ ...task, order: index }));
}

function positionTaskByCurrentSort(task) {
  const ordered = getManualTasks().filter(t => t.id !== task.id);
  const incomplete = ordered.filter(t => !t.completed);
  const completed = ordered.filter(t => t.completed);

  if (task.completed) {
    if (state.sort.key === "order") {
      return reindexTasks([...incomplete, ...completed, task]);
    }

    return reindexTasks([...sortTaskSubset(incomplete), ...sortTaskSubset([...completed, task])]);
  }

  if (state.sort.key === "order") {
    return reindexTasks([...incomplete, task, ...completed]);
  }

  return reindexTasks([...sortTaskSubset([...incomplete, task]), ...completed]);
}

function insertTaskByCurrentSort(task) {
  return positionTaskByCurrentSort(task);
}

function getVisibleTasks() {
  const ordered = getManualTasks();
  if (state.sort.key === "order") return ordered;

  const incomplete = ordered.filter(t => !t.completed);
  const completed = ordered.filter(t => t.completed);

  return [...sortTaskSubset(incomplete), ...sortTaskSubset(completed)];
}

function compareTasks(a, b) {
  if (state.sort.key === "priority") return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || a.order - b.order;
  if (state.sort.key === "dueDate")  return a.dueDate.localeCompare(b.dueDate) || (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || a.order - b.order;
  return a.group.localeCompare(b.group, undefined, { sensitivity: "base" }) || a.order - b.order;
}

function renderSortState() {
  sortButtons.forEach(btn => {
    const active = btn.dataset.sortKey === state.sort.key;
    btn.dataset.active    = active ? "true" : "false";
    btn.dataset.direction = active ? state.sort.direction : "";
  });
}

function normalizeNotes(value) {
  return typeof value === "string" ? value.slice(0, 1000) : "";
}

function summarizeNotes(notesText) {
  const singleLine = notesText.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 36) return singleLine;
  return singleLine.slice(0, 36) + "...";
}

function openNotesEditor(taskId, row, container = tableBody) {
  const active = container.querySelector("tr.notes-active");
  if (active && active !== row && active.dataset.taskId) {
    saveNotesFromRow(active.dataset.taskId, active, false);
  }

  const cell = row.querySelector(".notes-cell");
  const editor = row.querySelector(".notes-editor");
  const text = row.querySelector(".task-notes-text");
  if (!cell || !editor || !text) return;

  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    const notes = normalizeNotes(task.notes);
    text.value = notes;
    const count = row.querySelector(".notes-count");
    if (count) count.textContent = `${notes.length}/1000`;
  }

  row.classList.add("notes-active");
  cell.classList.add("is-expanded");
  editor.hidden = false;
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
}

function saveNotesFromRow(taskId, row, syncAfterSave) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const cell = row.querySelector(".notes-cell");
  const editor = row.querySelector(".notes-editor");
  const text = row.querySelector(".task-notes-text");
  const preview = row.querySelector(".notes-preview");
  if (!cell || !editor || !text || !preview) return;

  task.notes = normalizeNotes(text.value.trim());
  preview.textContent = task.notes ? summarizeNotes(task.notes) : "No notes";
  preview.classList.toggle("is-empty", !task.notes);

  editor.hidden = true;
  cell.classList.remove("is-expanded");
  row.classList.remove("notes-active");

  if (syncAfterSave) {
    syncTasks();
  }
}

// ── SYNC / PERSIST ────────────────────────────────────────────────────────────

async function syncTasks() {
  state.tasks = getManualTasks().map((t, i) => ({ ...t, order: i }));
  if (state.storageMode === "indexeddb") {
    await persistAllToStore(STORE_TASKS, state.tasks);
  } else {
    writeLocalFallback({ tasks: state.tasks, groups: state.groups });
  }
}

// ── DATABASE ──────────────────────────────────────────────────────────────────

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB not supported.")); return; }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1 && !db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: "id" });
      }
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(STORE_GROUPS)) {
        db.createObjectStore(STORE_GROUPS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error("Cannot open DB."));
  });
}

function readAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = state.db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

function persistAllToStore(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const clearReq = store.clear();
    clearReq.onsuccess = () => { items.forEach(item => store.put(item)); };
    clearReq.onerror   = () => reject(clearReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function saveGroupToDb(group) {
  if (state.storageMode !== "indexeddb") {
    writeLocalFallback({ tasks: state.tasks, groups: state.groups });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx  = state.db.transaction(STORE_GROUPS, "readwrite");
    const req = tx.objectStore(STORE_GROUPS).put(group);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function deleteGroupFromDb(id) {
  if (state.storageMode !== "indexeddb") {
    writeLocalFallback({ tasks: state.tasks, groups: state.groups });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx  = state.db.transaction(STORE_GROUPS, "readwrite");
    const req = tx.objectStore(STORE_GROUPS).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function createId() {
  return window.crypto?.randomUUID?.() || "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function colorForGroup(name) {
  const s = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  return GROUP_COLORS[s % GROUP_COLORS.length];
}

function dueProgress(dateValue) {
  const days = Math.ceil((new Date(dateValue + "T00:00:00") - new Date()) / 86400000);
  if (days <= 0) return "100%";
  if (days >= 14) return "12%";
  return Math.max(12, Math.min(100 - Math.round((days / 14) * 88), 100)) + "%";
}

function todayString() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function setStorageStatus(msg, warn) {
  storageStatus.textContent = msg;
  storageStatus.classList.toggle("warning", warn);
}

function readLocalFallback() {
  try {
    const raw    = localStorage.getItem("super-task-fallback");
    const parsed = raw ? JSON.parse(raw) : {};
    return Array.isArray(parsed) ? { tasks: parsed, groups: [] } : parsed;
  } catch (_) { return { tasks: [], groups: [] }; }
}

function writeLocalFallback(data) {
  localStorage.setItem("super-task-fallback", JSON.stringify(data));
}
