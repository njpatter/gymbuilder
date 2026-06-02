import { defaultParts } from "../data/defaultParts.js";
import { snap } from "./geometry.js";

/** @typedef {"top" | "front" | "side"} ViewName */

/**
 * @typedef {Object} PlacedObject
 * @property {string} id
 * @property {"part"} kind
 * @property {string} sourceId
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} width
 * @property {number} depth
 * @property {number} height
 * @property {number} rotationZ
 * @property {number} buryDepth
 * @property {boolean} locked
 * @property {string | null} parentId
 * @property {string | null} [partRole]
 */

/**
 * @typedef {Object} AppState
 * @property {Object} project
 * @property {string[]} selectedIds
 * @property {ViewName} activeView
 * @property {string} mode
 * @property {PlacedObject[]} clipboard
 */

/**
 * @returns {AppState}
 */
export function createAppState() {
  return {
    project: {
      name: "Untitled Ninja Gym",
      units: "in",
      placementGrid: 1,
      yard: {
        width: 360,
        depth: 480,
      },
      dimensionOrigin: { x: 0, y: 0, z: 0 },
      objects: [],
      templates: [],
      groups: {},
    },
    selectedIds: [],
    activeView: "top",
    mode: "select",
    clipboard: [],
  };
}

/** @type {AppState | null} */
let appState = null;

export function getState() {
  if (!appState) {
    appState = createAppState();
  }
  return appState;
}

/**
 * @param {AppState} next
 */
export function setAppState(next) {
  appState = next;
}

export function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {typeof defaultParts[0]} part
 * @param {Partial<PlacedObject>} [overrides]
 * @returns {PlacedObject}
 */
export function createPlacedFromPart(part, overrides = {}) {
  return {
    id: /** @type {string} */ (newId()),
    kind: "part",
    sourceId: part.id,
    name: part.name,
    x: 0,
    y: 0,
    z: 0,
    width: part.dimensions.width,
    depth: part.dimensions.depth,
    height: part.dimensions.height,
    rotationZ: 0,
    buryDepth: 0,
    locked: false,
    parentId: null,
    partRole: null,
    ...overrides,
  };
}

/**
 * @param {PlacedObject} obj
 * @param {Partial<PlacedObject>} updates
 */
function applyPostGradeRules(obj, updates) {
  const catalog = defaultParts.find((p) => p.id === obj.sourceId);
  const bury =
    updates.buryDepth !== undefined ? updates.buryDepth : obj.buryDepth ?? 0;
  if (catalog?.type === "post" && bury > 0) {
    updates.z = 0;
  }
}

/**
 * @param {string} id
 * @param {Partial<PlacedObject>} updates
 */
export function updatePlacedObject(id, updates) {
  const obj = getObjectById(id);
  if (!obj) return false;
  const patch = { ...updates };
  applyPostGradeRules(obj, patch);
  Object.assign(obj, patch);
  return true;
}

/**
 * @param {string} id
 * @returns {PlacedObject | undefined}
 */
export function getObjectById(id) {
  return getState().project.objects.find((o) => o.id === id);
}

export function getSelectedObjects() {
  const state = getState();
  return state.selectedIds
    .map((id) => getObjectById(id))
    .filter((o) => o !== undefined);
}

export function setActiveView(viewName) {
  getState().activeView = viewName;
}

/**
 * @param {string} id
 */
export function setSelection(id) {
  const state = getState();
  state.selectedIds = id ? [id] : [];
}

/**
 * @param {string} id
 * @param {boolean} additive
 */
export function toggleSelection(id, additive) {
  const state = getState();
  if (!additive) {
    state.selectedIds = [id];
    return;
  }
  const idx = state.selectedIds.indexOf(id);
  if (idx >= 0) {
    state.selectedIds = state.selectedIds.filter((x) => x !== id);
  } else {
    state.selectedIds = [...state.selectedIds, id];
  }
}

export function deleteSelected() {
  const state = getState();
  const ids = new Set(state.selectedIds);
  state.project.objects = state.project.objects.filter((o) => !ids.has(o.id));
  state.selectedIds = [];
}

/**
 * @returns {string | null} parentId if selection is a single group
 */
export function getSelectedGroupParentId() {
  const objs = getSelectedObjects();
  if (!objs.length) return null;
  const parentId = objs[0].parentId;
  if (!parentId) return null;
  return objs.every((o) => o.parentId === parentId) ? parentId : null;
}

export function explodeSelectedGroup() {
  const parentId = getSelectedGroupParentId();
  if (!parentId) {
    const obj = getSelectedObjects()[0];
    if (obj?.parentId) {
      clearParentId(obj.parentId);
    }
    return;
  }
  clearParentId(parentId);
}

function removeGroupMetaForParent(parentId) {
  const state = getState();
  if (state.project.groups) {
    delete state.project.groups[parentId];
  }
}

/**
 * @param {string} parentId
 */
function clearParentId(parentId) {
  for (const obj of getState().project.objects) {
    if (obj.parentId === parentId) {
      obj.parentId = null;
    }
  }
  removeGroupMetaForParent(parentId);
}

export function copySelection() {
  const state = getState();
  const copies = getSelectedObjects().map((o) => structuredClone(o));
  state.clipboard = copies;
}

export function pasteSelection() {
  const state = getState();
  if (!state.clipboard.length) return [];

  const grid = state.project.placementGrid;
  const offset = grid;
  const newIds = [];
  const parentMap = new Map();

  for (const src of state.clipboard) {
    const newParent =
      src.parentId && parentMap.has(src.parentId)
        ? parentMap.get(src.parentId)
        : src.parentId
          ? newId()
          : null;
    if (src.parentId && !parentMap.has(src.parentId)) {
      parentMap.set(src.parentId, newParent);
    }

    const placed = {
      ...structuredClone(src),
      id: newId(),
      x: snap(src.x + offset, grid),
      y: snap(src.y + offset, grid),
      z: snap(src.z, grid),
      parentId: newParent,
    };
    state.project.objects.push(placed);
    newIds.push(placed.id);
  }

  state.selectedIds = newIds;
  return newIds;
}

/**
 * @param {{ z: number, height: number, buryDepth: number }} obj
 */
export function getVerticalSpan(obj) {
  const bury = obj.buryDepth ?? 0;
  if (bury > 0) {
    return { bottom: -bury, top: obj.height };
  }
  return { bottom: obj.z, top: obj.z + obj.height };
}

/** World Z of the grade line used for bury / above-grade transition. */
export const GRADE_Z = 0;

/**
 * @param {import("./state.js").PlacedObject} obj
 */
export function isPartiallyBuried(obj) {
  return (obj.buryDepth ?? 0) > 0;
}
