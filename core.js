window.SuperTaskCore = (() => {
  const DB_NAME = "super-task-db";
  const DB_VERSION = 2;
  const STORE_TASKS = "tasks";
  const STORE_GROUPS = "groups";

  const GROUP_COLORS = ["#b0dd48", "#8e59e8", "#ea408d", "#6f9cff", "#79c58c", "#f2b35a", "#5fd3d4"];
  const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, None: 3 };
  const DEFAULT_COL_WIDTHS = {
    "col-item": 280,
    "col-group": 150,
    "col-due": 130,
    "col-priority": 110,
    "col-notes": 180
  };

  function createInitialState() {
    return {
      tasks: [],
      groups: [],
      storageMode: "indexeddb",
      auth: {
        mode: "disabled",
        status: "disabled",
        user: null,
        session: null,
        message: "Auth not configured. Local mode is active."
      },
      sort: { key: "order", direction: "asc" },
      colWidths: { ...DEFAULT_COL_WIDTHS },
      editingGroupId: null,
      viewMode: "list",
      groupModal: { open: false, groupName: "" },
      taskModal: { open: false, mode: "create", taskId: null }
    };
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORE_TASKS,
    STORE_GROUPS,
    GROUP_COLORS,
    PRIORITY_ORDER,
    DEFAULT_COL_WIDTHS,
    createInitialState
  };
})();
