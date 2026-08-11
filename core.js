window.SuperTaskCore = (() => {
  const DB_NAME = "super-task-db";
  const DB_VERSION = 2;
  const STORE_TASKS = "tasks";
  const STORE_GROUPS = "groups";

  const GROUP_COLORS = ["#b0dd48", "#8e59e8", "#ea408d", "#6f9cff", "#79c58c", "#f2b35a", "#5fd3d4"];
  const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, None: 3 };
  const DEFAULT_COL_WIDTHS = {
    "col-item": 360,
    "col-group": 200,
    "col-due": 160,
    "col-priority": 140,
    "col-notes": 220
  };

  function createInitialState() {
    return {
      tasks: [],
      groups: [],
      storageMode: "indexeddb",
      sort: { key: "order", direction: "asc" },
      colWidths: { ...DEFAULT_COL_WIDTHS },
      editingGroupId: null,
      viewMode: "list",
      groupModal: { open: false, groupName: "" }
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
