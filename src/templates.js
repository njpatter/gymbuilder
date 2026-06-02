import { pushUndoSnapshot } from "./history.js";
import { defaultSubsystems } from "../data/defaultSubsystems.js";
import { createMonkeyBarsGroup } from "./groups.js";
import { DEFAULT_MONKEY_BARS_CONFIG } from "./monkeyBars.js";
import { getSubsystemPlacementOffset } from "./placement.js";
import { defaultParts } from "../data/defaultParts.js";
import {
  createPlacedFromPart,
  getSelectedObjects,
  getState,
  newId,
  setSelection,
} from "./state.js";
import { snap } from "./geometry.js";

/**
 * @param {string} templateId
 */
export function placeSubsystemById(templateId) {
  const template =
    defaultSubsystems.find((t) => t.id === templateId) ||
    getState().project.templates.find((t) => t.id === templateId);
  if (!template) return null;
  return placeSubsystem(template);
}

/**
 * @param {string} name
 * @returns {object | null}
 */
export function saveSelectionAsTemplate(name) {
  const objs = getSelectedObjects();
  if (!objs.length) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const minX = Math.min(...objs.map((o) => o.x));
  const minY = Math.min(...objs.map((o) => o.y));
  const minZ = Math.min(...objs.map((o) => o.z - (o.buryDepth ?? 0)));
  const maxX = Math.max(...objs.map((o) => o.x + o.width));
  const maxY = Math.max(...objs.map((o) => o.y + o.depth));
  const maxZ = Math.max(...objs.map((o) => o.z + o.height));

  const template = {
    id: `user_${newId()}`,
    kind: "subsystem",
    source: "user",
    type: "parts",
    name: trimmed,
    width: maxX - minX,
    depth: maxY - minY,
    height: maxZ - minZ,
    parts: objs.map((o) => ({
      sourceId: o.sourceId,
      x: o.x - minX,
      y: o.y - minY,
      z: o.z - minZ,
      width: o.width,
      depth: o.depth,
      height: o.height,
      rotationZ: o.rotationZ ?? 0,
      buryDepth: o.buryDepth ?? 0,
      partRole: o.partRole ?? null,
    })),
  };

  getState().project.templates.push(template);
  return template;
}

/**
 * @param {string} templateId
 */
export function deleteUserTemplate(templateId) {
  const state = getState();
  state.project.templates = state.project.templates.filter(
    (t) => t.id !== templateId,
  );
}

/**
 * @param {object} template
 */
export function placeSubsystem(template) {
  pushUndoSnapshot();
  const state = getState();
  const view = state.activeView;
  const grid = state.project.placementGrid;
  const offset = getSubsystemPlacementOffset(template, view);
  const parentId = newId();

  if (template.type === "monkey_bars") {
    const config = { ...DEFAULT_MONKEY_BARS_CONFIG, ...template.config };
    createMonkeyBarsGroup(offset, config, parentId);
    const first = state.project.objects.find((o) => o.parentId === parentId);
    if (first) setSelection(first.id);
    return state.project.objects.filter((o) => o.parentId === parentId);
  }

  const created = [];
  for (const partDef of template.parts ?? []) {
    const catalog = defaultParts.find((p) => p.id === partDef.sourceId);
    if (!catalog) continue;

    const buryDepth =
      partDef.buryDepth ?? (catalog.type === "post" ? 24 : 0);

    const placed = createPlacedFromPart(catalog, {
      x: snap(partDef.x + offset.x, grid),
      y: snap(partDef.y + offset.y, grid),
      z: snap((partDef.z ?? 0) + offset.z, grid),
      width: partDef.width ?? catalog.dimensions.width,
      depth: partDef.depth ?? catalog.dimensions.depth,
      height: partDef.height ?? catalog.dimensions.height,
      rotationZ: partDef.rotationZ ?? 0,
      buryDepth,
      partRole: partDef.partRole ?? null,
      parentId,
    });

    if (catalog.type === "post" && placed.buryDepth > 0) {
      placed.z = 0;
    }

    state.project.objects.push(placed);
    created.push(placed);
  }

  if (created.length) {
    setSelection(created[0].id);
  }
  return created;
}

export function initTemplates() {
  // library + toolbar wire template actions
}
