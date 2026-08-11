window.SuperTaskRepositories = (() => {
  function createRepositories(options) {
    const {
      state,
      appStore,
      insertTaskByCurrentSort,
      positionTaskByCurrentSort,
      autoRegisterGroup,
      syncTasks
    } = options;

    return {
      addTask(task) {
        state.tasks = insertTaskByCurrentSort(task);
        return autoRegisterGroup(task.group).then(() => syncTasks());
      },

      deleteTask(taskId) {
        state.tasks = state.tasks.filter(task => task.id !== taskId);
        return syncTasks();
      },

      deleteCompletedTasks() {
        state.tasks = state.tasks.filter(task => !task.completed);
        state.tasks.forEach((task, index) => { task.order = index; });
        return syncTasks();
      },

      updateTaskPosition(task) {
        state.tasks = positionTaskByCurrentSort(task);
        return syncTasks();
      },

      persistTaskWithGroup(task, groupName) {
        task.group = groupName;
        return autoRegisterGroup(groupName).then(() => syncTasks());
      },

      renameGroup(group, oldName) {
        state.tasks.forEach(task => {
          if (task.group === oldName) task.group = group.name;
        });
        return Promise.all([appStore.saveGroup(group), syncTasks()]);
      },

      deleteGroup(groupId) {
        state.groups = state.groups.filter(group => group.id !== groupId);
        return appStore.deleteGroup(groupId);
      },

      importData(nextState) {
        return appStore.saveAll(nextState);
      },

      saveTasks() {
        return syncTasks();
      }
    };
  }

  return { createRepositories };
})();
