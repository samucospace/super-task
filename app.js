const DB_NAME = "super-task-db";
const DB_VERSION = 2;
const STORE_TASKS = "tasks";
const STORE_GROUPS = "groups";

const GROUP_COLORS = ["#b0dd48","#8e59e8","#ea408d","#6f9cff","#79c58c","#f2b35a","#5fd3d4"];
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, None: 3 };
const DEFAULT_COL_WIDTHS = { "col-item": 360, "col-group": 200, "col-due": 160, "col-priority": 140 };

const state = {
  db: null,
  tasks: [],
  groups: [],
  storageMode: "indexeddb",
  sort: { key: "order", direction: "asc" },
  colWidths: { ...DEFAULT_COL_WIDTHS },
  editingGroupId: null
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
const tableBody         = document.querySelector("#task-table-body");
const taskCount         = document.querySelector("#task-count");
const rowTemplate       = document.querySelector("#task-row-template");
const storageStatus     = document.querySelector("#storage-status");
const sortButtons       = Array.from(document.querySelectorAll(".sort-button"));
const groupDatalist     = document.querySelector("#group-datalist");
const groupsPanel       = document.querySelector("#groups-panel");
const groupsList        = document.querySelector("#groups-list");
const toggleGroupsBtn   = document.querySelector("#toggle-groups-btn");
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
  initColumnResize();
  renderGroups();
  updateGroupDatalist();
  renderTasks();
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────

function attachEventListeners() {
  form.addEventListener("submit", handleTaskSubmit);
  tableBody.addEventListener("click",     handleTableClick);
  tableBody.addEventListener("change",    handleTableChange);
  tableBody.addEventListener("mousedown", (e) => { dragHandleActive = !!e.target.closest(".drag-handle"); });
  tableBody.addEventListener("dragstart", handleDragStart);
  tableBody.addEventListener("dragover",  handleDragOver);
  tableBody.addEventListener("dragleave", handleDragLeave);
  tableBody.addEventListener("drop",      handleDrop);
  tableBody.addEventListener("dragend",   handleDragEnd);
  sortButtons.forEach(btn => btn.addEventListener("click", handleSortClick));
  toggleGroupsBtn.addEventListener("click", toggleGroupsPanel);
  addGroupForm.addEventListener("submit", handleAddGroup);
  groupsList.addEventListener("click",   handleGroupsListClick);
  groupsList.addEventListener("keydown", handleGroupsListKeydown);
  exportBtn.addEventListener("click",   exportBackup);
  importFile.addEventListener("change", handleImportFile);
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
    completed: false,
    order:     state.tasks.length
  };
  if (!task.title || !task.group || !task.dueDate) return;
  state.tasks.push(task);
  autoRegisterGroup(groupName).then(() => syncTasks()).then(() => {
    renderTasks();
    form.reset();
    dueDateInput.value = todayString();
    priorityInput.value = "Low";
    titleInput.focus();
  });
}

// ── TABLE INTERACTIONS ────────────────────────────────────────────────────────

function handleTableClick(event) {
  const btn = event.target.closest(".delete-task");
  if (!btn) return;
  const row = btn.closest("tr");
  if (!row?.dataset.taskId) return;
  state.tasks = state.tasks.filter(t => t.id !== row.dataset.taskId);
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
    syncTasks();
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
  tableBody.innerHTML = "";
  renderSortState();
  const tasks    = getVisibleTasks();
  const isManual = state.sort.key === "order";

  if (!tasks.length) {
    tableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No tasks yet. Add one above to get started.</td></tr>';
    taskCount.textContent = "0 tasks";
    return;
  }

  for (const task of tasks) {
    const frag = rowTemplate.content.cloneNode(true);
    const row  = frag.querySelector("tr");
    row.dataset.taskId = task.id;
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

    tableBody.appendChild(frag);
  }
  taskCount.textContent = `${state.tasks.length} task${state.tasks.length === 1 ? "" : "s"}`;
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

function getVisibleTasks() {
  const ordered = getManualTasks();
  if (state.sort.key === "order") return ordered;
  const sorted = [...ordered].sort(compareTasks);
  if (state.sort.direction === "desc") sorted.reverse();
  return sorted;
}

function compareTasks(a, b) {
  if (state.sort.key === "priority") return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || a.order - b.order;
  if (state.sort.key === "dueDate")  return a.dueDate.localeCompare(b.dueDate) || a.order - b.order;
  return a.group.localeCompare(b.group, undefined, { sensitivity: "base" }) || a.order - b.order;
}

function renderSortState() {
  sortButtons.forEach(btn => {
    const active = btn.dataset.sortKey === state.sort.key;
    btn.dataset.active    = active ? "true" : "false";
    btn.dataset.direction = active ? state.sort.direction : "";
  });
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
