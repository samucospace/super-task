const {
  DB_NAME,
  DB_VERSION,
  STORE_TASKS,
  STORE_GROUPS,
  GROUP_COLORS,
  PRIORITY_ORDER,
  DEFAULT_COL_WIDTHS,
  createInitialState
} = window.SuperTaskCore;

const state = createInitialState();
const authService = window.SuperTaskAuth.createAuthService();

const appStore = window.SuperTaskStorage.createAppStore({
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
  taskStoreName: STORE_TASKS,
  groupStoreName: STORE_GROUPS,
  setStorageStatus,
  getState: () => state
});
const repositories = window.SuperTaskRepositories.createRepositories({
  state,
  appStore,
  insertTaskByCurrentSort,
  positionTaskByCurrentSort,
  autoRegisterGroup,
  syncTasks,
  cloudSync: {
    upsertTasks: cloudUpsertTasks,
    deleteTasks: cloudDeleteTasks,
    upsertGroup: cloudUpsertGroup,
    deleteGroup: cloudDeleteGroup
  }
});

// Drag state
let dragSrcId = null;
let dragHandleActive = false;

// Resize state
let resizeState = null;
let cloudBootstrapUserId = null;
let cloudBootstrapInFlight = false;
let realtimeChannel = null;
let realtimeUserId = null;
let realtimePullTimer = null;

// Guards against a racing cloud pull (e.g. the delete's own realtime
// self-notification) resurrecting a task/group that was just deleted
// locally, before the pull's SELECT reliably reflects the deletion.
const PENDING_DELETE_TTL_MS = 2 * 60 * 1000;
const pendingDeletedIds = new Map();

function markPendingDeleted(ids) {
  const now = Date.now();
  for (const [id, deletedAt] of pendingDeletedIds) {
    if (now - deletedAt > PENDING_DELETE_TTL_MS) pendingDeletedIds.delete(id);
  }
  ids.forEach(id => pendingDeletedIds.set(id, now));
}

// --- DOM refs ---
const {
  form,
  authGate,
  authForm,
  authEmailInput,
  authMessage,
  authUserEmail,
  authRefreshBtn,
  authSignOutBtn,
  authProtectedElements,
  titleInput,
  groupInput,
  dueDateInput,
  priorityInput,
  notesInput,
  composerNotesCell,
  composerNotesPreview,
  composerNotesEditor,
  composerNotesCount,
  tableFrame,
  tableBody,
  groupCardBoard,
  groupModal,
  groupModalTitle,
  groupModalTableBody,
  groupModalAddTaskBtn,
  groupModalCloseBtn,
  taskCount,
  deleteCompletedBtn,
  rowTemplate,
  storageStatus,
  syncStatusPill,
  sortButtons,
  groupDatalist,
  groupsPanel,
  groupsList,
  toggleGroupsBtn,
  toggleViewBtn,
  addGroupForm,
  newGroupNameInput,
  exportBtn,
  importFile,
  moreMenuBtn,
  moreMenuList,
  moreMenuAccountDivider,
  openTaskModalBtn,
  taskModal,
  taskModalTitle,
  taskModalCloseBtn,
  taskFormSubmitBtn
} = window.SuperTaskDom.getDomRefs();

document.addEventListener("DOMContentLoaded", initializeApp);

// ── INIT ──────────────────────────────────────────────────────────────────────

async function initializeApp() {
  authService.subscribe(applyAuthState);

  window.SuperTaskBootstrap.initializePreferences({
    state,
    dueDateInput,
    applyColumnWidths,
    applyViewMode,
    todayString
  });

  const loadedState = await appStore.load();
  state.tasks = loadedState.tasks;
  state.groups = loadedState.groups;

  attachEventListeners();
  closeComposerNotesEditor(false);
  initColumnResize();
  renderGroups();
  updateGroupDatalist();
  renderTasks();
  renderSyncStatus();

  window.addEventListener("online", () => flushSyncQueue());
  setInterval(() => {
    if (window.SuperTaskSyncQueue.getPendingCount() > 0) flushSyncQueue();
  }, 30000);

  await authService.init();
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────

function attachEventListeners() {
  window.SuperTaskBootstrap.attachEventListeners({
    dom: {
      form,
      authForm,
      authRefreshBtn,
      authSignOutBtn,
      tableBody,
      deleteCompletedBtn,
      sortButtons,
      toggleGroupsBtn,
      toggleViewBtn,
      addGroupForm,
      groupsList,
      groupCardBoard,
      groupModalTableBody,
      groupModalCloseBtn,
      groupModalAddTaskBtn,
      groupModal,
      exportBtn,
      importFile,
      moreMenuBtn,
      openTaskModalBtn,
      taskModal,
      taskModalCloseBtn
    },
    handlers: {
      handleTaskSubmit,
      handleAuthSubmit,
      handleAuthSignOut,
      handleAuthRefresh,
      handleComposerClick,
      handleComposerInput,
      handleComposerKeydown,
      handleComposerFocusOut,
      handleTableClick,
      handleDeleteCompleted,
      handleTableChange,
      handleTableInput,
      handleTableKeydown,
      handleTableFocusOut,
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
      handleSortClick,
      toggleGroupsPanel,
      toggleViewMode,
      handleAddGroup,
      handleGroupsListClick,
      handleGroupsListKeydown,
      handleCardBoardChange,
      handleCardBoardClick,
      handleCardBoardKeydown,
      handleGroupModalTableClick,
      handleGroupModalTableChange,
      handleGroupModalTableInput,
      handleGroupModalTableKeydown,
      handleGroupModalTableFocusOut,
      closeGroupModal,
      handleGroupModalAddTask,
      handleGroupModalShellClick,
      handleDocumentKeydown,
      exportBackup,
      handleImportFile,
      toggleMoreMenu,
      closeMoreMenu,
      handleDocumentClick,
      handleOpenTaskModalClick,
      closeTaskModal,
      handleTaskModalShellClick
    },
    setDragHandleActive(value) {
      dragHandleActive = value;
    }
  });
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape" && state.groupModal.open) {
    closeGroupModal();
  }
  if (event.key === "Escape" && state.taskModal.open) {
    closeTaskModal();
  }
  if (event.key === "Escape") {
    closeMoreMenu();
  }
}

function toggleMoreMenu() {
  if (!moreMenuList || !moreMenuBtn) return;
  const willOpen = moreMenuList.hidden;
  moreMenuList.hidden = !willOpen;
  moreMenuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeMoreMenu() {
  if (!moreMenuList || moreMenuList.hidden) return;
  moreMenuList.hidden = true;
  moreMenuBtn?.setAttribute("aria-expanded", "false");
}

function handleDocumentClick(event) {
  if (!moreMenuList || moreMenuList.hidden) return;
  if (event.target.closest(".more-menu")) return;
  closeMoreMenu();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = authEmailInput?.value.trim();
  if (!email) return;

  setAuthMessage("Sending sign-in link...", false);
  const result = await authService.sendMagicLink(email);
  setAuthMessage(result.message, !result.ok);
  if (result.ok && authForm) {
    authForm.reset();
  }
}

async function handleAuthSignOut() {
  closeMoreMenu();
  const result = await authService.signOut();
  setAuthMessage(result.message, !result.ok);
}

async function handleAuthRefresh() {
  closeMoreMenu();
  const userId = state.auth.user?.id || null;
  if (!userId || cloudBootstrapInFlight) return;
  await loadCloudDataForUser(userId, userId);
}

function applyAuthState(nextAuthState) {
  const previousUserId = state.auth.user?.id || null;
  state.auth = nextAuthState;
  renderAuthState();
  renderSyncStatus();
  void handleAuthTransition(previousUserId);
}

async function handleAuthTransition(previousUserId) {
  const currentUserId = state.auth.user?.id || null;
  const isSignedIn = state.auth.status === "signed-in";

  if (!isSignedIn) {
    cloudBootstrapUserId = null;
    unsubscribeRealtime();
    restoreLocalStorageStatus();
    return;
  }

  subscribeRealtime(currentUserId);

  if (!currentUserId || cloudBootstrapInFlight || cloudBootstrapUserId === currentUserId) {
    return;
  }

  // Always pull the latest cloud data: with multiple devices (e.g. laptop +
  // phone), cloud is the shared source of truth. Writes are awaited before
  // resolving, so a fresh pull reflects this device's own recent edits too.
  await loadCloudDataForUser(currentUserId, previousUserId);
}

// ── REALTIME SYNC ─────────────────────────────────────────────────────────────
// Listens for changes made by other tabs/devices for the same user and pulls
// fresh cloud data (debounced) so open sessions stay in sync without a manual
// refresh. Requires Realtime to be enabled on the `tasks`/`groups` tables.

function subscribeRealtime(userId) {
  if (!userId || realtimeUserId === userId) return;
  const client = authService.getClient();
  if (!client) return;

  unsubscribeRealtime();

  realtimeChannel = client
    .channel(`super-task-sync-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, scheduleRealtimePull)
    .on("postgres_changes", { event: "*", schema: "public", table: "groups", filter: `user_id=eq.${userId}` }, scheduleRealtimePull)
    .subscribe();
  realtimeUserId = userId;
}

function unsubscribeRealtime() {
  if (realtimePullTimer) {
    clearTimeout(realtimePullTimer);
    realtimePullTimer = null;
  }
  if (realtimeChannel) {
    const client = authService.getClient();
    client?.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  realtimeUserId = null;
}

function scheduleRealtimePull() {
  if (realtimePullTimer) return;
  realtimePullTimer = setTimeout(() => {
    realtimePullTimer = null;
    const userId = state.auth.user?.id || null;
    if (!userId || state.auth.status !== "signed-in") return;
    void loadCloudDataForUser(userId, userId, { silent: true });
  }, 500);
}

function renderAuthState() {
  const requiresSignIn = state.auth.mode === "supabase";
  const isSignedIn = state.auth.status === "signed-in";
  const localTestingMode = requiresSignIn && !isSignedIn;
  const showProtected = !requiresSignIn || isSignedIn || localTestingMode;

  authProtectedElements.forEach(element => {
    element.classList.toggle("is-auth-hidden", !showProtected);
  });

  if (authGate) {
    authGate.hidden = state.auth.mode === "disabled" || isSignedIn;
  }

  if (authUserEmail) {
    authUserEmail.hidden = !isSignedIn;
    authUserEmail.textContent = isSignedIn ? `Logged in - ${state.auth.user?.email || "your account"}` : "";
  }

  if (authSignOutBtn) {
    authSignOutBtn.hidden = !isSignedIn;
  }

  if (authRefreshBtn) {
    authRefreshBtn.hidden = !isSignedIn;
  }

  if (moreMenuAccountDivider) {
    moreMenuAccountDivider.hidden = !isSignedIn;
  }

  setAuthMessage(state.auth.message || "", false);
}

function setAuthMessage(message, isError) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.classList.toggle("is-error", !!isError);
}

async function loadCloudDataForUser(userId, previousUserId, options = {}) {
  const { silent = false } = options;
  const client = authService.getClient();
  if (!client || !userId) return;

  cloudBootstrapInFlight = true;

  // Push any pending offline edits before pulling, so this device's own
  // recent changes aren't lost by the pull that treats cloud as truth.
  if (window.SuperTaskSyncQueue.getPendingCount() > 0) {
    await flushSyncQueue();
  }

  try {
    const [tasksResult, groupsResult] = await Promise.all([
      client
        .from("tasks")
        .select("id, title, group_name, due_date, priority, notes, completed, sort_order, updated_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      client
        .from("groups")
        .select("id, name, updated_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
    ]);

    if (tasksResult.error) throw tasksResult.error;
    if (groupsResult.error) throw groupsResult.error;

    const cloudTasks = mapCloudTasks(tasksResult.data || []);
    const cloudGroups = mapCloudGroups(groupsResult.data || []);
    const hasCloudData = cloudTasks.length > 0 || cloudGroups.length > 0;

    if (hasCloudData) {
      // Timestamp-aware merge: a row that was edited locally more recently
      // than the incoming cloud version wins, instead of the cloud pull
      // blindly overwriting it (blanket last-write-wins on every pull).
      const taskMerge = mergeByTimestamp(state.tasks, cloudTasks);
      const groupMerge = mergeByTimestamp(state.groups, cloudGroups);
      state.tasks = taskMerge.merged;
      state.groups = mergeGroupsFromTasks(groupMerge.merged, state.tasks);
      await repositories.importData({ tasks: state.tasks, groups: state.groups });
      renderGroups();
      updateGroupDatalist();
      renderTasks();
      if (!silent) setAuthMessage("Signed in. Loaded cloud data for this account.", false);

      // Reconcile: push back any local rows that beat the incoming cloud version.
      if (taskMerge.localWins.length) void cloudUpsertTasks(taskMerge.localWins);
      groupMerge.localWins.forEach(group => void cloudUpsertGroup(group));
    } else if (!silent && (!previousUserId || previousUserId !== userId)) {
      setAuthMessage("Signed in. No cloud data yet, continuing with local data.", false);
    }

    cloudBootstrapUserId = userId;
  } catch (err) {
    console.error("Cloud bootstrap failed.", err);
    if (!silent) {
      setAuthMessage(`Signed in, but cloud load failed: ${err.message || "Unknown error"}. Using local data.`, true);
      setStorageStatus("Cloud load failed, using local data", true);
    }
  } finally {
    cloudBootstrapInFlight = false;
  }
}

function mapCloudTasks(rows) {
  return rows.map((row, index) => {
    const rawPriority = typeof row.priority === "string" ? row.priority : "Low";
    const priority = Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, rawPriority) ? rawPriority : "Low";
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled task";
    const group = typeof row.group_name === "string" && row.group_name.trim() ? row.group_name.trim() : "General";

    return {
      id: row.id || createId(),
      title,
      group,
      dueDate: row.due_date || todayString(),
      priority,
      notes: normalizeNotes(typeof row.notes === "string" ? row.notes : ""),
      completed: !!row.completed,
      order: Number.isFinite(row.sort_order) ? row.sort_order : index,
      updatedAt: row.updated_at || null
    };
  });
}

function mapCloudGroups(rows) {
  return rows
    .filter(row => typeof row.name === "string" && row.name.trim())
    .map(row => ({
      id: row.id || createId(),
      name: row.name.trim(),
      updatedAt: row.updated_at || null
    }));
}

// Picks, per id, whichever of the local/cloud version has the newer
// `updatedAt`. Ids only present in cloud are added; ids only present locally
// are dropped (already-flushed local deletes/creates are reflected in cloud).
// Cloud rows recently deleted locally are also dropped even if the cloud
// pull raced ahead of the delete's own soft-delete becoming visible.
function mergeByTimestamp(localItems, cloudItems) {
  const localById = new Map(localItems.map(item => [item.id, item]));
  const localWins = [];

  const merged = cloudItems
    .filter(cloudItem => {
      const deletedAt = pendingDeletedIds.get(cloudItem.id);
      return deletedAt === undefined || isNewerTimestamp(cloudItem.updatedAt, new Date(deletedAt).toISOString());
    })
    .map(cloudItem => {
      const localItem = localById.get(cloudItem.id);
      if (localItem && isNewerTimestamp(localItem.updatedAt, cloudItem.updatedAt)) {
        localWins.push(localItem);
        return localItem;
      }
      return cloudItem;
    });

  return { merged, localWins };
}

function isNewerTimestamp(candidateIso, baselineIso) {
  if (!candidateIso) return false;
  if (!baselineIso) return true;
  return new Date(candidateIso).getTime() > new Date(baselineIso).getTime();
}

function mergeGroupsFromTasks(groups, tasks) {
  const merged = [...groups];
  const knownGroups = new Set(merged.map(group => group.name.toLowerCase()));

  tasks.forEach(task => {
    const name = task.group.trim();
    const lower = name.toLowerCase();
    if (!knownGroups.has(lower)) {
      merged.push({ id: createId(), name });
      knownGroups.add(lower);
    }
  });

  return merged;
}

function restoreLocalStorageStatus() {
  if (state.storageMode === "localstorage") {
    setStorageStatus("Using local fallback", true);
    return;
  }
  setStorageStatus("IndexedDB ready", false);
}

// ── CLOUD WRITE SYNC ──────────────────────────────────────────────────────────

let queueFlushTimer = null;
let queueFlushInFlight = false;

// Cloud sync is "enabled" (worth queuing for) whenever Supabase is configured,
// even while signed out, so edits made before/between sign-ins aren't lost.
function isCloudSyncEnabled() {
  return state.auth.mode === "supabase";
}

function getCloudContext() {
  const client = authService.getClient();
  const userId = state.auth.user?.id || null;
  if (!client || !userId || state.auth.status !== "signed-in") return null;
  return { client, userId };
}

function toCloudTaskRow(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    group_name: task.group,
    due_date: task.dueDate || null,
    priority: task.priority,
    notes: task.notes || "",
    completed: !!task.completed,
    sort_order: task.order,
    // set explicitly since DB trigger may not be present/active
    updated_at: task.updatedAt || new Date().toISOString()
  };
}

function toCloudGroupRow(group, userId) {
  return { id: group.id, user_id: userId, name: group.name, updated_at: group.updatedAt || new Date().toISOString() };
}

async function cloudUpsertTasks(tasks) {
  if (!isCloudSyncEnabled() || !tasks.length) return;
  const now = new Date().toISOString();
  tasks.forEach(task => { task.updatedAt = now; });
  const ctx = getCloudContext();

  if (!ctx) {
    // Not signed in yet: queue the raw task so it syncs once the user signs in.
    tasks.forEach(task => window.SuperTaskSyncQueue.enqueue("task", task.id, "upsert", task));
    renderSyncStatus();
    return;
  }

  try {
    const rows = tasks.map(task => toCloudTaskRow(task, ctx.userId));
    const result = await ctx.client.from("tasks").upsert(rows, { onConflict: "id" });
    if (result.error) throw result.error;
    tasks.forEach(task => window.SuperTaskSyncQueue.removeOps("task", task.id));
  } catch (err) {
    console.error("Cloud task upsert failed, queued for retry.", err);
    tasks.forEach(task => window.SuperTaskSyncQueue.enqueue("task", task.id, "upsert", task));
    scheduleQueueFlush();
  }
  renderSyncStatus();
}

async function cloudDeleteTasks(taskIds) {
  if (!isCloudSyncEnabled() || !taskIds.length) return;
  markPendingDeleted(taskIds);
  const ctx = getCloudContext();

  if (!ctx) {
    taskIds.forEach(id => window.SuperTaskSyncQueue.enqueue("task", id, "delete", null));
    renderSyncStatus();
    return;
  }

  try {
    const result = await ctx.client
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", taskIds)
      .eq("user_id", ctx.userId);
    if (result.error) throw result.error;
    taskIds.forEach(id => window.SuperTaskSyncQueue.removeOps("task", id));
  } catch (err) {
    console.error("Cloud task delete failed, queued for retry.", err);
    taskIds.forEach(id => window.SuperTaskSyncQueue.enqueue("task", id, "delete", null));
    scheduleQueueFlush();
  }
  renderSyncStatus();
}

async function cloudUpsertGroup(group) {
  if (!isCloudSyncEnabled()) return;
  group.updatedAt = new Date().toISOString();
  const ctx = getCloudContext();

  if (!ctx) {
    window.SuperTaskSyncQueue.enqueue("group", group.id, "upsert", group);
    renderSyncStatus();
    return;
  }

  try {
    const row = toCloudGroupRow(group, ctx.userId);
    const result = await ctx.client.from("groups").upsert(row, { onConflict: "id" });
    if (result.error) throw result.error;
    window.SuperTaskSyncQueue.removeOps("group", group.id);
  } catch (err) {
    console.error("Cloud group upsert failed, queued for retry.", err);
    window.SuperTaskSyncQueue.enqueue("group", group.id, "upsert", group);
    scheduleQueueFlush();
  }
  renderSyncStatus();
}

async function cloudDeleteGroup(groupId) {
  if (!isCloudSyncEnabled()) return;
  markPendingDeleted([groupId]);
  const ctx = getCloudContext();

  if (!ctx) {
    window.SuperTaskSyncQueue.enqueue("group", groupId, "delete", null);
    renderSyncStatus();
    return;
  }

  try {
    const result = await ctx.client
      .from("groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", groupId)
      .eq("user_id", ctx.userId);
    if (result.error) throw result.error;
    window.SuperTaskSyncQueue.removeOps("group", groupId);
  } catch (err) {
    console.error("Cloud group delete failed, queued for retry.", err);
    window.SuperTaskSyncQueue.enqueue("group", groupId, "delete", null);
    scheduleQueueFlush();
  }
  renderSyncStatus();
}

function scheduleQueueFlush(delayMs) {
  if (queueFlushTimer) return;
  const queue = window.SuperTaskSyncQueue.getQueue();
  const maxAttempts = queue.reduce((max, op) => Math.max(max, op.attempts || 0), 0);
  const delay = delayMs ?? Math.min(60000, 4000 * Math.pow(2, maxAttempts));
  queueFlushTimer = setTimeout(() => {
    queueFlushTimer = null;
    flushSyncQueue();
  }, delay);
}

async function flushSyncQueue() {
  const ctx = getCloudContext();
  if (!ctx || queueFlushInFlight) return;

  const queue = window.SuperTaskSyncQueue.getQueue();
  if (!queue.length) return;

  queueFlushInFlight = true;
  let anyFailed = false;

  for (const op of queue) {
    try {
      if (op.entityType === "task" && op.kind === "upsert") {
        const row = toCloudTaskRow(op.payload, ctx.userId);
        const result = await ctx.client.from("tasks").upsert(row, { onConflict: "id" });
        if (result.error) throw result.error;
      } else if (op.entityType === "task" && op.kind === "delete") {
        const result = await ctx.client
          .from("tasks")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", op.entityId)
          .eq("user_id", ctx.userId);
        if (result.error) throw result.error;
      } else if (op.entityType === "group" && op.kind === "upsert") {
        const row = toCloudGroupRow(op.payload, ctx.userId);
        const result = await ctx.client.from("groups").upsert(row, { onConflict: "id" });
        if (result.error) throw result.error;
      } else if (op.entityType === "group" && op.kind === "delete") {
        const result = await ctx.client
          .from("groups")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", op.entityId)
          .eq("user_id", ctx.userId);
        if (result.error) throw result.error;
      }
      window.SuperTaskSyncQueue.removeOps(op.entityType, op.entityId);
    } catch (err) {
      console.error("Retry failed for queued sync op.", op, err);
      anyFailed = true;
      window.SuperTaskSyncQueue.updateOp(op.opId, { attempts: (op.attempts || 0) + 1 });
    }
  }

  queueFlushInFlight = false;
  renderSyncStatus();
  renderTasks();

  if (anyFailed) {
    scheduleQueueFlush();
  }
}

function renderSyncStatus() {
  if (!syncStatusPill) return;
  const pendingCount = window.SuperTaskSyncQueue.getPendingCount();
  if (!pendingCount || !isCloudSyncEnabled()) {
    syncStatusPill.hidden = true;
    return;
  }
  syncStatusPill.hidden = false;
  const suffix = state.auth.status === "signed-in" ? "pending sync" : "pending sync (sign in to push)";
  syncStatusPill.textContent = `${pendingCount} change${pendingCount === 1 ? "" : "s"} ${suffix}`;
  syncStatusPill.classList.add("warning");
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
  const title = titleInput.value.trim();
  const dueDate = dueDateInput.value;
  const priority = priorityInput.value;
  const notes = normalizeNotes(notesInput.value.trim());
  if (!title || !groupName || !dueDate) return;

  if (state.taskModal.mode === "edit" && state.taskModal.taskId) {
    const task = state.tasks.find(t => t.id === state.taskModal.taskId);
    if (!task) {
      closeTaskModal();
      return;
    }
    task.title = title;
    task.dueDate = dueDate;
    task.priority = priority;
    task.notes = notes;
    repositories.persistTaskWithGroup(task, groupName).then(() => {
      renderTasks();
      updateGroupDatalist();
      closeTaskModal();
    });
    return;
  }

  const task = {
    id:        createId(),
    title,
    group:     groupName,
    dueDate,
    priority,
    notes,
    completed: false,
    order:     state.tasks.length
  };
  repositories.addTask(task).then(() => {
    renderTasks();
    closeTaskModal();
  });
}

function openTaskModal(task) {
  if (!taskModal) return;
  state.taskModal.open = true;
  state.taskModal.mode = task ? "edit" : "create";
  state.taskModal.taskId = task ? task.id : null;

  if (taskModalTitle) taskModalTitle.textContent = task ? "Edit task" : "Add task";
  if (taskFormSubmitBtn) taskFormSubmitBtn.textContent = task ? "Save changes" : "Add task";

  titleInput.value = task ? task.title : "";
  groupInput.value = task ? task.group : "";
  dueDateInput.value = task ? task.dueDate : todayString();
  priorityInput.value = task ? task.priority : "Low";
  notesInput.value = task ? normalizeNotes(task.notes) : "";
  closeComposerNotesEditor(false);

  taskModal.removeAttribute("hidden");
  taskModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  titleInput.focus();
}

function closeTaskModal() {
  if (!taskModal) return;
  state.taskModal.open = false;
  state.taskModal.mode = "create";
  state.taskModal.taskId = null;
  taskModal.setAttribute("hidden", "");
  taskModal.setAttribute("aria-hidden", "true");
  if (!state.groupModal.open) {
    document.body.classList.remove("modal-open");
  }
  form.reset();
  closeComposerNotesEditor(false);
}

function handleTaskModalShellClick(event) {
  if (event.target.closest("[data-close-task-modal='true']")) {
    closeTaskModal();
  }
}

function handleOpenTaskModalClick() {
  openTaskModal();
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
  repositories.deleteTask(row.dataset.taskId).then(renderTasks);
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
  repositories.deleteCompletedTasks().then(renderTasks);
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
    repositories.updateTaskPosition(task).then(renderTasks);
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
    repositories.persistTaskWithGroup(task, trimmed);
    return;
  }
  if (fieldName === "title") {
    const v = el.value.trim();
    if (v) task.title = v;
    repositories.saveTasks();
    return;
  }
  if (fieldName === "dueDate" && el.value) {
    task.dueDate = el.value;
    repositories.saveTasks();
    return;
  }
  if (fieldName === "priority") {
    task.priority = el.value;
    el.dataset.priority = el.value;
    repositories.saveTasks();
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
  repositories.saveTasks().then(renderTasks);
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
  } else {
    groupsPanel.setAttribute("hidden", "");
  }
  updateGroupsToggleLabel();
}

function updateGroupsToggleLabel() {
  if (!toggleGroupsBtn) return;
  const isOpen = !groupsPanel.hasAttribute("hidden");
  const arrow = isOpen ? "&#9650;" : "&#9660;";
  const count = state.groups.length;
  toggleGroupsBtn.innerHTML = `Groups <span class="groups-count">${count}</span> ${arrow}`;
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
    repositories.renameGroup(group, oldName).then(() => {
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
    repositories.deleteGroup(groupId).then(() => { renderGroups(); updateGroupDatalist(); });
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
  updateGroupsToggleLabel();
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
  await appStore.saveGroup(group);
  await cloudUpsertGroup(group).catch(err => console.error("Cloud sync error.", err));
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
    tableBody.innerHTML = '<tr class="empty-row"><td colspan="8">No tasks yet — add your first one above to get started.</td></tr>';
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

  const isPendingSync = isCloudSyncEnabled() && window.SuperTaskSyncQueue.isPending("task", task.id);
  row.classList.toggle("row-pending-sync", isPendingSync);
  if (isPendingSync) row.title = "Not yet synced to cloud";

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
    groupCardBoard.innerHTML = '<p class="group-card-empty">Nothing open here — completed tasks are hidden in card view.</p>';
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
        item.dataset.taskId = task.id;
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Edit ${task.title}`);

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

  repositories.updateTaskPosition(task).then(renderTasks);
}

function handleCardBoardClick(event) {
  const deleteBtn = event.target.closest(".card-task-delete");
  if (deleteBtn?.dataset.taskId) {
    repositories.deleteTask(deleteBtn.dataset.taskId).then(renderTasks);
    return;
  }

  if (event.target.closest("input") || event.target.closest("button")) return;

  const taskItem = event.target.closest(".group-card-task");
  if (taskItem?.dataset.taskId) {
    const task = state.tasks.find(t => t.id === taskItem.dataset.taskId);
    if (task) openTaskModal(task);
    return;
  }

  const card = event.target.closest(".group-card");
  if (card?.dataset.groupName) {
    openGroupModal(card.dataset.groupName);
  }
}

function handleCardBoardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const taskItem = event.target.closest(".group-card-task");
  if (!taskItem?.dataset.taskId) return;
  event.preventDefault();
  const task = state.tasks.find(t => t.id === taskItem.dataset.taskId);
  if (task) openTaskModal(task);
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
  if (!state.taskModal.open) {
    document.body.classList.remove("modal-open");
  }
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

  repositories.addTask(task)
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
  repositories.deleteTask(row.dataset.taskId).then(() => {
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
    repositories.updateTaskPosition(task).then(() => {
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
    repositories.persistTaskWithGroup(task, trimmed)
      .then(() => {
        renderTasks();
        renderGroupModalTasks();
      });
    return;
  }
  if (fieldName === "title") {
    const v = el.value.trim();
    if (v) task.title = v;
    repositories.saveTasks().then(renderTasks);
    return;
  }
  if (fieldName === "dueDate" && el.value) {
    task.dueDate = el.value;
    repositories.saveTasks().then(renderTasks);
    return;
  }
  if (fieldName === "priority") {
    task.priority = el.value;
    el.dataset.priority = el.value;
    repositories.saveTasks().then(renderTasks);
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
  closeMoreMenu();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  closeMoreMenu();
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
      await repositories.importData({ tasks: state.tasks, groups: state.groups });
      renderGroups();
      updateGroupDatalist();
      renderTasks();
      // Push imported data to cloud too, so it survives the next pull/realtime
      // sync instead of being silently dropped or overwritten by stale cloud state.
      if (isCloudSyncEnabled()) {
        if (state.groups.length) await Promise.all(state.groups.map(group => cloudUpsertGroup(group)));
        if (state.tasks.length) await cloudUpsertTasks(state.tasks);
      }
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
  await appStore.saveTasks(state.tasks);
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
  // Only surface this pill for actual problems (fallback storage, failed
  // cloud load) - routine "storage is fine" messages add noise, not value.
  storageStatus.hidden = !warn;
}
