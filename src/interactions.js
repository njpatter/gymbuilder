import { getFootprintExtents, getWorldAtStage, snap } from "./geometry.js";
import { pushUndoSnapshot } from "./history.js";
import { getViewCamera } from "./viewCamera.js";
import {
  getStage,
  getViewBounds,
  renderAllViews,
  renderObjectsAndSelection,
} from "./rendering.js";
import { getGroupMeta, syncMonkeyBarsOrigin } from "./groups.js";
import {
  copySelection,
  deleteSelected,
  explodeSelectedGroup,
  getObjectById,
  getState,
  isPartiallyBuried,
  pasteSelection,
  setSelection,
  toggleSelection,
} from "./state.js";
import { promptSaveTemplate, updatePropertiesPanel } from "./ui.js";

/** @typedef {"top" | "front" | "side"} ViewName */

/**
 * @typedef {Object} DragSession
 * @property {ViewName} viewName
 * @property {string} objectId
 * @property {string[]} groupIds
 * @property {Record<string, { x: number, y: number, z: number }>} startPositions
 * @property {number} offsetH
 * @property {number} offsetV
 * @property {boolean} lockVertical
 */

/** @type {DragSession | null} */
let dragSession = null;

export function initInteractions() {
  for (const viewName of /** @type {ViewName[]} */ (["top", "front", "side"])) {
    const stage = getStage(viewName);
    if (!stage) continue;

    stage.on("mousedown touchstart", (e) => {
      if (e.evt.button === 1 || (e.evt.altKey && e.evt.button === 0)) return;

      const objectId = e.target === stage ? null : findObjectId(e.target);
      const shift = e.evt?.shiftKey ?? false;

      if (!objectId) {
        if (e.target === stage && !shift) {
          setSelection("");
          renderObjectsAndSelection();
          updatePropertiesPanel();
        }
        return;
      }

      e.cancelBubble = true;
      const obj = getObjectById(objectId);
      if (!obj || obj.locked) return;

      if (shift) {
        toggleSelection(objectId, true);
        renderObjectsAndSelection();
        updatePropertiesPanel();
        return;
      }

      setSelection(objectId);
      startDrag(viewName, stage, obj);
      renderObjectsAndSelection();
      updatePropertiesPanel();
    });

    stage.on("mousemove touchmove", () => {
      if (!dragSession || dragSession.viewName !== viewName) return;
      handleDragMove(viewName, stage);
    });

    stage.on("mouseup touchend mouseleave", () => {
      if (dragSession?.viewName === viewName) {
        const session = dragSession;
        dragSession = null;
        if (session.groupIds.length > 1) {
          const primary = getObjectById(session.objectId);
          if (primary?.parentId && getGroupMeta(primary.parentId)?.type === "monkey_bars") {
            syncMonkeyBarsOrigin(primary.parentId);
          }
        }
        renderAllViews();
        updatePropertiesPanel();
      }
    });
  }

  window.addEventListener("keydown", onKeyDown);
  wireToolbarActions();
}

function wireToolbarActions() {
  document.getElementById("btn-save-template")?.addEventListener("click", () => {
    promptSaveTemplate();
  });

  document.getElementById("btn-delete")?.addEventListener("click", () => {
    pushUndoSnapshot();
    deleteSelected();
    renderAllViews();
    updatePropertiesPanel();
  });
  document.getElementById("btn-explode")?.addEventListener("click", () => {
    pushUndoSnapshot();
    explodeSelectedGroup();
    renderAllViews();
    updatePropertiesPanel();
  });
}

/**
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
  const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    pushUndoSnapshot();
    deleteSelected();
    renderAllViews();
    updatePropertiesPanel();
    return;
  }

  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "c") {
    e.preventDefault();
    copySelection();
    return;
  }
  if (mod && e.key === "v") {
    e.preventDefault();
    pushUndoSnapshot();
    pasteSelection();
    renderAllViews();
    updatePropertiesPanel();
  }
}

/**
 * @param {Konva.Node} target
 */
function findObjectId(target) {
  let node = target;
  while (node && node.getType() !== "Stage") {
    const id = node.getAttr("objectId");
    if (id) return id;
    node = node.getParent();
  }
  return null;
}

/**
 * @param {ViewName} viewName
 * @param {import("./state.js").PlacedObject} obj
 */
function startDrag(viewName, stage, obj) {
  const pos = stage.getPointerPosition();
  if (!pos) return;

  pushUndoSnapshot();

  const bounds = getViewBounds(viewName);
  const camera = getViewCamera(viewName, bounds);
  const { h, v } = getWorldAtStage(
    viewName,
    pos.x,
    pos.y,
    bounds,
    stage.width(),
    stage.height(),
    camera,
  );

  let anchorH = obj.x;
  let anchorV = obj.y;

  if (viewName === "front") {
    const fp = getFootprintExtents(obj.width, obj.depth, obj.rotationZ);
    anchorH = obj.x + fp.minX;
    anchorV = obj.z - (obj.buryDepth ?? 0);
  } else if (viewName === "side") {
    const fp = getFootprintExtents(obj.width, obj.depth, obj.rotationZ);
    anchorH = obj.y + fp.minY;
    anchorV = obj.z - (obj.buryDepth ?? 0);
  }

  const groupIds = getDragGroupIds(obj);
  const startPositions = {};
  for (const id of groupIds) {
    const o = getObjectById(id);
    if (o) startPositions[id] = { x: o.x, y: o.y, z: o.z };
  }

  const lockVertical =
    (viewName === "front" || viewName === "side") && isPartiallyBuried(obj);

  dragSession = {
    viewName,
    objectId: obj.id,
    groupIds,
    startPositions,
    offsetH: h - anchorH,
    offsetV: v - anchorV,
    lockVertical,
  };
}

/**
 * @param {import("./state.js").PlacedObject} obj
 */
function getDragGroupIds(obj) {
  if (!obj.parentId) return [obj.id];
  const state = getState();
  return state.project.objects
    .filter((o) => o.parentId === obj.parentId)
    .map((o) => o.id);
}

/**
 * @param {ViewName} viewName
 */
function handleDragMove(viewName, stage) {
  if (!dragSession) return;

  const pos = stage.getPointerPosition();
  if (!pos) return;

  const primary = getObjectById(dragSession.objectId);
  if (!primary) return;

  const bounds = getViewBounds(viewName);
  const camera = getViewCamera(viewName, bounds);
  const { h, v } = getWorldAtStage(
    viewName,
    pos.x,
    pos.y,
    bounds,
    stage.width(),
    stage.height(),
    camera,
  );

  const grid = getState().project.placementGrid;
  const targetH = h - dragSession.offsetH;
  const targetV = v - dragSession.offsetV;

  const start = dragSession.startPositions[dragSession.objectId];
  let newX = start.x;
  let newY = start.y;
  let newZ = start.z;

  if (viewName === "top") {
    newX = snap(targetH, grid);
    newY = snap(targetV, grid);
  } else if (viewName === "front") {
    const fp = getFootprintExtents(primary.width, primary.depth, primary.rotationZ);
    newX = snap(targetH - fp.minX, grid);
    if (!dragSession.lockVertical) {
      newZ = snap(targetV + (primary.buryDepth ?? 0), grid);
    }
  } else if (viewName === "side") {
    const fp = getFootprintExtents(primary.width, primary.depth, primary.rotationZ);
    newY = snap(targetH - fp.minY, grid);
    if (!dragSession.lockVertical) {
      newZ = snap(targetV + (primary.buryDepth ?? 0), grid);
    }
  }

  const dx = newX - start.x;
  const dy = newY - start.y;
  const dz = newZ - start.z;

  for (const id of dragSession.groupIds) {
    const o = getObjectById(id);
    const s = dragSession.startPositions[id];
    if (!o || !s) continue;
    o.x = snap(s.x + dx, grid);
    o.y = snap(s.y + dy, grid);
    o.z = snap(s.z + dz, grid);
  }

  renderObjectsAndSelection();
  updatePropertiesPanel();
}
