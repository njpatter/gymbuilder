import { defaultParts } from "../data/defaultParts.js";
import {
  buildCrossBeamDefs,
  buildMonkeyBarsPartDefs,
  buildRungDefs,
  DEFAULT_MONKEY_BARS_CONFIG,
  getRungSpanY,
} from "./monkeyBars.js";
import { snap } from "./geometry.js";
import { createPlacedFromPart, getState, newId } from "./state.js";

/**
 * @typedef {import("./monkeyBars.js").MonkeyBarsConfig} MonkeyBarsConfig
 */

/**
 * @typedef {Object} MonkeyBarsGroupMeta
 * @property {"monkey_bars"} type
 * @property {MonkeyBarsConfig} config
 * @property {number} originX
 * @property {number} originY
 * @property {number} originZ
 */

/**
 * @param {string} parentId
 * @returns {MonkeyBarsGroupMeta | null}
 */
export function getGroupMeta(parentId) {
  return getState().project.groups?.[parentId] ?? null;
}

/**
 * @param {string} parentId
 * @param {MonkeyBarsGroupMeta} meta
 */
export function setGroupMeta(parentId, meta) {
  const state = getState();
  if (!state.project.groups) state.project.groups = {};
  state.project.groups[parentId] = meta;
}

/**
 * @param {string} parentId
 */
export function removeGroupMeta(parentId) {
  const state = getState();
  if (state.project.groups) {
    delete state.project.groups[parentId];
  }
}

/**
 * @param {{ x: number, y: number, z: number }} origin
 * @param {MonkeyBarsConfig} config
 * @param {string} parentId
 */
export function createMonkeyBarsGroup(origin, config, parentId) {
  const state = getState();
  const grid = state.project.placementGrid;
  const defs = buildMonkeyBarsPartDefs(origin, config, grid);

  for (const def of defs) {
    const catalog = defaultParts.find((p) => p.id === def.sourceId);
    if (!catalog) continue;
    const { partRole, ...placedFields } = def;
    const placed = createPlacedFromPart(catalog, {
      ...placedFields,
      parentId,
      partRole,
    });
    state.project.objects.push(placed);
  }

  setGroupMeta(parentId, {
    type: "monkey_bars",
    config: { ...DEFAULT_MONKEY_BARS_CONFIG, ...config },
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
  });
}

/**
 * @param {string} parentId
 * @param {Partial<import("./state.js").PlacedObject> & { partRole: string, sourceId: string }} def
 */
function pushPlacedPart(parentId, def) {
  const catalog = defaultParts.find((p) => p.id === def.sourceId);
  if (!catalog) return;
  const { partRole, ...placedFields } = def;
  getState().project.objects.push(
    createPlacedFromPart(catalog, {
      ...placedFields,
      parentId,
      partRole,
    }),
  );
}

/**
 * @param {string} parentId
 */
export function regenerateMonkeyBarsRungs(parentId) {
  const meta = getGroupMeta(parentId);
  if (!meta || meta.type !== "monkey_bars") return;

  const state = getState();
  const grid = state.project.placementGrid;
  const config = meta.config;

  state.project.objects = state.project.objects.filter(
    (o) => !(o.parentId === parentId && o.partRole === "rung"),
  );

  const origin = { x: meta.originX, y: meta.originY, z: meta.originZ };
  const rungDefs = buildRungDefs(origin, config, grid, getRungSpanY(config));

  for (const def of rungDefs) {
    pushPlacedPart(parentId, def);
  }
}

/**
 * @param {string} parentId
 */
export function regenerateMonkeyBarsCrossBeams(parentId) {
  const meta = getGroupMeta(parentId);
  if (!meta || meta.type !== "monkey_bars") return;

  const state = getState();
  const grid = state.project.placementGrid;
  const config = meta.config;

  state.project.objects = state.project.objects.filter(
    (o) => !(o.parentId === parentId && o.partRole === "crossBeam"),
  );

  const origin = { x: meta.originX, y: meta.originY, z: meta.originZ };
  for (const def of buildCrossBeamDefs(origin, config, grid)) {
    pushPlacedPart(parentId, def);
  }

  regenerateMonkeyBarsRungs(parentId);
}

/**
 * @param {string} parentId
 * @param {number} buryDepth
 */
export function applyGroupPostBuryDepth(parentId, buryDepth) {
  const meta = getGroupMeta(parentId);
  if (!meta || meta.type !== "monkey_bars") return;

  const grid = getState().project.placementGrid;
  const bury = Math.max(0, snap(buryDepth, grid));

  meta.config.postBuryDepth = bury;
  setGroupMeta(parentId, meta);

  for (const obj of getState().project.objects) {
    if (obj.parentId === parentId && obj.partRole === "post") {
      obj.buryDepth = bury;
      obj.z = 0;
    }
  }
}

/**
 * @param {string} parentId
 * @param {Partial<MonkeyBarsConfig>} patch
 */
export function updateMonkeyBarsConfig(parentId, patch) {
  const meta = getGroupMeta(parentId);
  if (!meta || meta.type !== "monkey_bars") return;

  const grid = getState().project.placementGrid;
  const next = { ...meta.config };

  if (patch.postBuryDepth !== undefined) {
    applyGroupPostBuryDepth(parentId, patch.postBuryDepth);
    return;
  }

  if (patch.crossBeamSourceId !== undefined) {
    next.crossBeamSourceId = patch.crossBeamSourceId;
    meta.config = next;
    setGroupMeta(parentId, meta);
    regenerateMonkeyBarsCrossBeams(parentId);
    return;
  }

  if (patch.rungCount !== undefined) {
    next.rungCount = Math.max(1, Math.round(patch.rungCount));
  }
  if (patch.rungSpacing !== undefined) {
    next.rungSpacing = Math.max(1, snap(patch.rungSpacing, grid));
  }
  if (patch.rungStartX !== undefined) {
    next.rungStartX = Math.max(0, snap(patch.rungStartX, grid));
  }

  meta.config = next;
  setGroupMeta(parentId, meta);
  regenerateMonkeyBarsRungs(parentId);
}

/**
 * @param {string | null} parentId
 */
export function getMonkeyBarsGroupForParentId(parentId) {
  if (!parentId) return null;
  const meta = getGroupMeta(parentId);
  if (meta?.type === "monkey_bars") return { parentId, meta };
  return null;
}

/**
 * @param {string} parentId
 */
export function syncMonkeyBarsOrigin(parentId) {
  const meta = getGroupMeta(parentId);
  if (!meta || meta.type !== "monkey_bars") return;

  const posts = getState().project.objects.filter(
    (o) => o.parentId === parentId && o.partRole === "post",
  );
  if (!posts.length) return;

  const originPost = posts.reduce((a, b) =>
    a.x + a.y < b.x + b.y ? a : b,
  );
  meta.originX = originPost.x;
  meta.originY = originPost.y;
  meta.originZ = originPost.z;
  setGroupMeta(parentId, meta);
}
