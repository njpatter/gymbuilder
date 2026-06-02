import { createAppState, newId } from "./state.js";

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = "gymbuilder_project_v1";

/**
 * @param {import("./state.js").AppState} state
 * @returns {object}
 */
export function serializeProjectFromState(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: structuredClone(state.project),
    activeView: state.activeView,
  };
}

/**
 * @param {object} data
 * @returns {boolean}
 */
export function validateProjectData(data) {
  if (!data || typeof data !== "object") return false;
  if (data.schemaVersion !== SCHEMA_VERSION) return false;
  const p = data.project;
  if (!p || typeof p !== "object") return false;
  if (!Array.isArray(p.objects)) return false;
  if (!Array.isArray(p.templates)) return false;
  return true;
}

/**
 * @param {import("./state.js").AppState["project"]} project
 */
export function remapProjectIds(project) {
  const idMap = new Map();

  for (const obj of project.objects) {
    idMap.set(obj.id, newId());
  }

  for (const obj of project.objects) {
    if (obj.parentId && !idMap.has(obj.parentId)) {
      idMap.set(obj.parentId, newId());
    }
  }

  for (const key of Object.keys(project.groups ?? {})) {
    if (!idMap.has(key)) {
      idMap.set(key, newId());
    }
  }

  for (const obj of project.objects) {
    obj.id = idMap.get(obj.id) ?? newId();
    if (obj.parentId) {
      obj.parentId = idMap.get(obj.parentId) ?? null;
    }
  }

  const newGroups = {};
  for (const [oldKey, meta] of Object.entries(project.groups ?? {})) {
    const newKey = idMap.get(oldKey);
    if (newKey) newGroups[newKey] = meta;
  }
  project.groups = newGroups;

  for (const tmpl of project.templates) {
    if (tmpl.source === "user" && tmpl.id) {
      tmpl.id = `user_${newId()}`;
    }
  }
}

/**
 * @param {object} data
 * @param {{ regenerateIds?: boolean }} [opts]
 * @returns {import("./state.js").AppState}
 */
export function projectDataToAppState(data, opts = {}) {
  if (!validateProjectData(data)) {
    throw new Error("Invalid project file (schema version 1 required).");
  }

  const project = structuredClone(data.project);
  if (!project.groups) project.groups = {};
  if (!project.templates) project.templates = [];
  if (!project.dimensionOrigin) {
    project.dimensionOrigin = { x: 0, y: 0, z: 0 };
  }

  if (opts.regenerateIds) {
    remapProjectIds(project);
  }

  const state = createAppState();
  state.project = project;
  state.activeView = data.activeView ?? "top";
  state.selectedIds = [];
  state.clipboard = [];
  return state;
}

/**
 * @param {import("./state.js").AppState} state
 */
export function saveToLocalStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProjectFromState(state)));
}

/**
 * @returns {object | null}
 */
export function readLocalStorageProject() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {import("./state.js").AppState} state
 * @param {string} [filename]
 */
export function downloadProjectJson(state, filename) {
  const payload = serializeProjectFromState(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `${(payload.project.name || "ninja-gym-project").replace(/[^a-z0-9-_]+/gi, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
