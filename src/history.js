import { getState } from "./state.js";

const MAX_HISTORY = 60;

/** @typedef {{ project: import("./state.js").AppState["project"], selectedIds: string[] }} HistorySnapshot */

/** @type {HistorySnapshot[]} */
const undoStack = [];

/** @type {HistorySnapshot[]} */
const redoStack = [];

let paused = false;

/**
 * @returns {HistorySnapshot}
 */
function captureSnapshot() {
  const state = getState();
  return {
    project: structuredClone(state.project),
    selectedIds: [...state.selectedIds],
  };
}

/**
 * @param {HistorySnapshot} snap
 */
function restoreSnapshot(snap) {
  paused = true;
  const state = getState();
  state.project = structuredClone(snap.project);
  state.selectedIds = [...snap.selectedIds];
  paused = false;
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pushUndoSnapshot() {
  if (paused) return;

  const snap = captureSnapshot();
  const last = undoStack[undoStack.length - 1];
  if (last && snapshotsEqual(last, snap)) return;

  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack.length = 0;
  updateUndoRedoUi();
}

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoRedoUi();
}

/**
 * @returns {boolean}
 */
export function undo() {
  if (!undoStack.length) return false;

  redoStack.push(captureSnapshot());
  const prev = undoStack.pop();
  if (!prev) return false;
  restoreSnapshot(prev);
  updateUndoRedoUi();
  return true;
}

/**
 * @returns {boolean}
 */
export function redo() {
  if (!redoStack.length) return false;

  undoStack.push(captureSnapshot());
  const next = redoStack.pop();
  if (!next) return false;
  restoreSnapshot(next);
  updateUndoRedoUi();
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function updateUndoRedoUi() {
  const undoBtn = document.getElementById("btn-undo");
  const redoBtn = document.getElementById("btn-redo");
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (redoBtn) redoBtn.disabled = !canRedo();
}

/**
 * @param {() => void} onRestore
 */
export function initHistoryUi(onRestore) {
  document.getElementById("btn-undo")?.addEventListener("click", () => {
    if (undo()) onRestore();
  });
  document.getElementById("btn-redo")?.addEventListener("click", () => {
    if (redo()) onRestore();
  });

  window.addEventListener("keydown", (e) => {
    const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (undo()) onRestore();
      return;
    }
    if (e.key === "z" && e.shiftKey) {
      e.preventDefault();
      if (redo()) onRestore();
      return;
    }
    if (e.key === "y") {
      e.preventDefault();
      if (redo()) onRestore();
    }
  });

  updateUndoRedoUi();
}

/**
 * @param {() => void} fn
 */
export function withUndo(fn) {
  pushUndoSnapshot();
  fn();
}
