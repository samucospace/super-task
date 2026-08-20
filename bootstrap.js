window.SuperTaskBootstrap = (() => {
  function initializePreferences(options) {
    const {
      state,
      dueDateInput,
      applyColumnWidths,
      applyViewMode,
      todayString
    } = options;

    dueDateInput.value = todayString();

    const savedWidths = localStorage.getItem("super-task-col-widths");
    if (savedWidths) {
      try {
        Object.assign(state.colWidths, JSON.parse(savedWidths));
      } catch (_) {}
    }
    applyColumnWidths();

    const savedViewMode = localStorage.getItem("super-task-view-mode");
    if (savedViewMode === "cards" || savedViewMode === "list") {
      state.viewMode = savedViewMode;
    } else if (window.innerWidth <= 700) {
      // No explicit preference yet: default to the mobile-friendlier card
      // view on narrow screens instead of the wide table view.
      state.viewMode = "cards";
    }
    applyViewMode(false);
  }

  function attachEventListeners(options) {
    const {
      dom,
      handlers,
      setDragHandleActive
    } = options;

    dom.form.addEventListener("submit", handlers.handleTaskSubmit);
    if (dom.authForm) {
      dom.authForm.addEventListener("submit", handlers.handleAuthSubmit);
    }
    if (dom.authSignOutBtn) {
      dom.authSignOutBtn.addEventListener("click", handlers.handleAuthSignOut);
    }
    if (dom.authRefreshBtn) {
      dom.authRefreshBtn.addEventListener("click", handlers.handleAuthRefresh);
    }
    dom.form.addEventListener("click", handlers.handleComposerClick);
    dom.form.addEventListener("input", handlers.handleComposerInput);
    dom.form.addEventListener("keydown", handlers.handleComposerKeydown);
    dom.form.addEventListener("focusout", handlers.handleComposerFocusOut);
    dom.tableBody.addEventListener("click", handlers.handleTableClick);
    dom.deleteCompletedBtn.addEventListener("click", handlers.handleDeleteCompleted);
    dom.tableBody.addEventListener("change", handlers.handleTableChange);
    dom.tableBody.addEventListener("input", handlers.handleTableInput);
    dom.tableBody.addEventListener("keydown", handlers.handleTableKeydown);
    dom.tableBody.addEventListener("focusout", handlers.handleTableFocusOut);
    dom.tableBody.addEventListener("mousedown", (event) => {
      setDragHandleActive(!!event.target.closest(".drag-handle"));
    });
    dom.tableBody.addEventListener("dragstart", handlers.handleDragStart);
    dom.tableBody.addEventListener("dragover", handlers.handleDragOver);
    dom.tableBody.addEventListener("dragleave", handlers.handleDragLeave);
    dom.tableBody.addEventListener("drop", handlers.handleDrop);
    dom.tableBody.addEventListener("dragend", handlers.handleDragEnd);
    dom.sortButtons.forEach(btn => btn.addEventListener("click", handlers.handleSortClick));
    dom.toggleGroupsBtn.addEventListener("click", handlers.toggleGroupsPanel);
    dom.toggleViewBtn.addEventListener("click", handlers.toggleViewMode);
    dom.addGroupForm.addEventListener("submit", handlers.handleAddGroup);
    dom.groupsList.addEventListener("click", handlers.handleGroupsListClick);
    dom.groupsList.addEventListener("keydown", handlers.handleGroupsListKeydown);
    dom.groupCardBoard.addEventListener("change", handlers.handleCardBoardChange);
    dom.groupCardBoard.addEventListener("click", handlers.handleCardBoardClick);
    dom.groupCardBoard.addEventListener("keydown", handlers.handleCardBoardKeydown);
    dom.groupCardBoard.addEventListener("dragstart", handlers.handleCardDragStart);
    dom.groupCardBoard.addEventListener("dragover", handlers.handleCardDragOver);
    dom.groupCardBoard.addEventListener("dragleave", handlers.handleCardDragLeave);
    dom.groupCardBoard.addEventListener("drop", handlers.handleCardDrop);
    dom.groupCardBoard.addEventListener("dragend", handlers.handleCardDragEnd);
    dom.groupModalTableBody.addEventListener("click", handlers.handleGroupModalTableClick);
    dom.groupModalTableBody.addEventListener("change", handlers.handleGroupModalTableChange);
    dom.groupModalTableBody.addEventListener("input", handlers.handleGroupModalTableInput);
    dom.groupModalTableBody.addEventListener("keydown", handlers.handleGroupModalTableKeydown);
    dom.groupModalTableBody.addEventListener("focusout", handlers.handleGroupModalTableFocusOut);
    dom.groupModalCloseBtn.addEventListener("click", handlers.closeGroupModal);
    dom.groupModalAddTaskBtn.addEventListener("click", handlers.handleGroupModalAddTask);
    dom.groupModal.addEventListener("click", handlers.handleGroupModalShellClick);
    document.addEventListener("keydown", handlers.handleDocumentKeydown);
    document.addEventListener("click", handlers.handleDocumentClick);
    dom.exportBtn.addEventListener("click", handlers.exportBackup);
    dom.importFile.addEventListener("change", handlers.handleImportFile);
    if (dom.moreMenuBtn) {
      dom.moreMenuBtn.addEventListener("click", handlers.toggleMoreMenu);
    }
    if (dom.openTaskModalBtn) {
      dom.openTaskModalBtn.addEventListener("click", handlers.handleOpenTaskModalClick);
    }
    if (dom.taskModalCloseBtn) {
      dom.taskModalCloseBtn.addEventListener("click", handlers.closeTaskModal);
    }
    if (dom.taskModal) {
      dom.taskModal.addEventListener("click", handlers.handleTaskModalShellClick);
    }
  }

  return { initializePreferences, attachEventListeners };
})();
