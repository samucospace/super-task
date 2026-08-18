window.SuperTaskRepositories = (() => {
  function createRepositories(options) {
    const {
      state,
      appStore,
      insertTaskByCurrentSort,
      positionTaskByCurrentSort,
      autoRegisterGroup,
      syncTasks,
      cloudSync
    } = options;

    // cloudSync failures must never block local persistence, but callers still
    // await this so a reload can't race ahead of an in-flight cloud write.
    function runCloud(promise) {
      return Promise.resolve(promise).catch(err => console.error("Cloud sync error.", err));
    }

    return {
      addTask(task) {
        state.tasks = insertTaskByCurrentSort(task);
        // insertTaskByCurrentSort can reindex other tasks' `order` (e.g. to
        // keep completed tasks below the new one), so push all tasks, not
        // just the new one, or cloud sort_order for the rest goes stale.
        return autoRegisterGroup(task.group).then(() => syncTasks()).then(() => {
          return runCloud(cloudSync?.upsertTasks(state.tasks));
        });
      },

      deleteTask(taskId) {
        state.tasks = state.tasks.filter(task => task.id !== taskId);
        state.tasks.forEach((task, index) => { task.order = index; });
        return syncTasks().then(() => {
          return Promise.all([
            runCloud(cloudSync?.deleteTasks([taskId])),
            runCloud(cloudSync?.upsertTasks(state.tasks))
          ]);
        });
      },

      deleteCompletedTasks() {
        const completedIds = state.tasks.filter(task => task.completed).map(task => task.id);
        state.tasks = state.tasks.filter(task => !task.completed);
        state.tasks.forEach((task, index) => { task.order = index; });
        return syncTasks().then(() => {
          return Promise.all([
            runCloud(cloudSync?.deleteTasks(completedIds)),
            runCloud(cloudSync?.upsertTasks(state.tasks))
          ]);
        });
      },

      updateTaskPosition(task) {
        state.tasks = positionTaskByCurrentSort(task);
        return syncTasks().then(() => {
          return runCloud(cloudSync?.upsertTasks(state.tasks));
        });
      },

      persistTaskWithGroup(task, groupName) {
        task.group = groupName;
        return autoRegisterGroup(groupName).then(() => syncTasks()).then(() => {
          return runCloud(cloudSync?.upsertTasks([task]));
        });
      },

      renameGroup(group, oldName) {
        state.tasks.forEach(task => {
          if (task.group === oldName) task.group = group.name;
        });
        return Promise.all([appStore.saveGroup(group), syncTasks()]).then(() => {
          return Promise.all([
            runCloud(cloudSync?.upsertGroup(group)),
            runCloud(cloudSync?.upsertTasks(state.tasks))
          ]);
        });
      },

      deleteGroup(groupId) {
        state.groups = state.groups.filter(group => group.id !== groupId);
        return appStore.deleteGroup(groupId).then(() => {
          return runCloud(cloudSync?.deleteGroup(groupId));
        });
      },

      importData(nextState) {
        return appStore.saveAll(nextState);
      },

      saveTasks() {
        return syncTasks().then(() => {
          return runCloud(cloudSync?.upsertTasks(state.tasks));
        });
      }
    };
  }

  return { createRepositories };
})();
