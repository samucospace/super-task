window.SuperTaskSyncQueue = (() => {
  const STORAGE_KEY = "super-task-sync-queue";

  function readQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (_) {
      // Storage unavailable/full: queue is best-effort, not fatal.
    }
  }

  // Queuing again for the same entity replaces the prior pending op
  // (e.g. a queued delete supersedes an earlier queued upsert).
  function enqueue(entityType, entityId, kind, payload) {
    const queue = readQueue().filter(op => !(op.entityType === entityType && op.entityId === entityId));
    queue.push({
      opId: `${entityType}:${entityId}:${Date.now()}`,
      entityType,
      entityId,
      kind,
      payload,
      attempts: 0,
      queuedAt: Date.now()
    });
    writeQueue(queue);
    return queue;
  }

  function removeOps(entityType, entityId) {
    const queue = readQueue().filter(op => !(op.entityType === entityType && op.entityId === entityId));
    writeQueue(queue);
    return queue;
  }

  function updateOp(opId, changes) {
    const queue = readQueue().map(op => (op.opId === opId ? { ...op, ...changes } : op));
    writeQueue(queue);
    return queue;
  }

  function getQueue() {
    return readQueue();
  }

  function isPending(entityType, entityId) {
    return readQueue().some(op => op.entityType === entityType && op.entityId === entityId);
  }

  function getPendingCount() {
    return readQueue().length;
  }

  function clear() {
    writeQueue([]);
  }

  return { enqueue, removeOps, updateOp, getQueue, isPending, getPendingCount, clear };
})();
