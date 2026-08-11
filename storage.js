window.SuperTaskStorage = (() => {
  function createAppStore(options) {
    const {
      dbName,
      dbVersion,
      taskStoreName,
      groupStoreName,
      setStorageStatus,
      getState
    } = options;

    let db = null;

    return {
      async load() {
        try {
          db = await openDatabase(dbName, dbVersion, taskStoreName, groupStoreName);
          getState().storageMode = "indexeddb";
          setStorageStatus("IndexedDB ready", false);
          return {
            tasks: await readAllFromStore(db, taskStoreName),
            groups: await readAllFromStore(db, groupStoreName)
          };
        } catch (err) {
          console.error("IndexedDB unavailable, using localStorage.", err);
          getState().storageMode = "localstorage";
          setStorageStatus("Using local fallback", true);
          const fallback = readLocalFallback();
          return {
            tasks: fallback.tasks || [],
            groups: fallback.groups || []
          };
        }
      },

      async saveTasks(tasks) {
        if (getState().storageMode === "indexeddb") {
          await persistAllToStore(db, taskStoreName, tasks);
          return;
        }
        writeLocalFallback({ tasks, groups: getState().groups });
      },

      async saveGroups(groups) {
        if (getState().storageMode === "indexeddb") {
          await persistAllToStore(db, groupStoreName, groups);
          return;
        }
        writeLocalFallback({ tasks: getState().tasks, groups });
      },

      async saveAll(nextState) {
        if (getState().storageMode === "indexeddb") {
          await persistAllToStore(db, taskStoreName, nextState.tasks);
          await persistAllToStore(db, groupStoreName, nextState.groups);
          return;
        }
        writeLocalFallback(nextState);
      },

      async saveGroup(group) {
        if (getState().storageMode !== "indexeddb") {
          writeLocalFallback({ tasks: getState().tasks, groups: getState().groups });
          return;
        }
        await saveGroupToDb(db, groupStoreName, group);
      },

      async deleteGroup(groupId) {
        if (getState().storageMode !== "indexeddb") {
          writeLocalFallback({ tasks: getState().tasks, groups: getState().groups });
          return;
        }
        await deleteGroupFromDb(db, groupStoreName, groupId);
      }
    };
  }

  function openDatabase(dbName, dbVersion, taskStoreName, groupStoreName) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB not supported.")); return; }
      const req = window.indexedDB.open(dbName, dbVersion);
      req.onupgradeneeded = (event) => {
        const upgradeDb = req.result;
        if (event.oldVersion < 1 && !upgradeDb.objectStoreNames.contains(taskStoreName)) {
          upgradeDb.createObjectStore(taskStoreName, { keyPath: "id" });
        }
        if (event.oldVersion < 2 && !upgradeDb.objectStoreNames.contains(groupStoreName)) {
          upgradeDb.createObjectStore(groupStoreName, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Cannot open DB."));
    });
  }

  function readAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function persistAllToStore(db, storeName, items) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const clearReq = store.clear();
      clearReq.onsuccess = () => { items.forEach(item => store.put(item)); };
      clearReq.onerror = () => reject(clearReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function saveGroupToDb(db, groupStoreName, group) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(groupStoreName, "readwrite");
      const req = tx.objectStore(groupStoreName).put(group);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function deleteGroupFromDb(db, groupStoreName, groupId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(groupStoreName, "readwrite");
      const req = tx.objectStore(groupStoreName).delete(groupId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function readLocalFallback() {
    try {
      const raw = localStorage.getItem("super-task-fallback");
      const parsed = raw ? JSON.parse(raw) : {};
      return Array.isArray(parsed) ? { tasks: parsed, groups: [] } : parsed;
    } catch (_) {
      return { tasks: [], groups: [] };
    }
  }

  function writeLocalFallback(data) {
    localStorage.setItem("super-task-fallback", JSON.stringify(data));
  }

  return { createAppStore };
})();
