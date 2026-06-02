import { getDefaultViewBounds, snap } from "./geometry.js";
import { getState, createPlacedFromPart } from "./state.js";
import { pushUndoSnapshot } from "./history.js";
import { defaultParts } from "../data/defaultParts.js";

/** @typedef {"top" | "front" | "side"} ViewName */

/**
 * @param {ViewName} viewName
 */
export function getViewCenterWorld(viewName) {
  const project = getState().project;
  const bounds = getDefaultViewBounds(project, viewName);
  return {
    h: (bounds.minH + bounds.maxH) / 2,
    v: (bounds.minV + bounds.maxV) / 2,
  };
}

/**
 * @param {typeof defaultParts[0]} part
 */
export function placePart(part) {
  pushUndoSnapshot();
  const state = getState();
  const view = state.activeView;
  const grid = state.project.placementGrid;
  const center = getViewCenterWorld(view);
  const placed = createPlacedFromPart(part);

  if (part.type === "post") {
    placed.buryDepth = 24;
    placed.z = 0;
  }

  if (view === "top") {
    placed.x = snap(center.h - placed.width / 2, grid);
    placed.y = snap(center.v - placed.depth / 2, grid);
  } else if (view === "front") {
    placed.x = snap(center.h - placed.width / 2, grid);
    if (part.type !== "post") {
      placed.z = snap(center.v - placed.height / 2, grid);
    }
    placed.y = snap(state.project.yard.depth / 2 - placed.depth / 2, grid);
  } else {
    placed.y = snap(center.h - placed.depth / 2, grid);
    if (part.type !== "post") {
      placed.z = snap(center.v - placed.height / 2, grid);
    }
    placed.x = snap(state.project.yard.width / 2 - placed.width / 2, grid);
  }

  state.project.objects.push(placed);
  return placed;
}

/**
 * @param {{ width?: number, depth?: number, parts: Array<{ x: number, y: number, z: number }> }} template
 * @param {ViewName} viewName
 */
export function getSubsystemPlacementOffset(template, viewName) {
  const state = getState();
  const grid = state.project.placementGrid;
  const center = getViewCenterWorld(viewName);

  const width =
    template.width ??
    Math.max(...template.parts.map((p) => p.x + (lookupPartSize(p).width || 0)));
  const depth =
    template.depth ??
    Math.max(...template.parts.map((p) => p.y + (lookupPartSize(p).depth || 0)));

  if (viewName === "top") {
    return {
      x: snap(center.h - width / 2, grid),
      y: snap(center.v - depth / 2, grid),
      z: 0,
    };
  }
  if (viewName === "front") {
    const height =
      template.height ??
      Math.max(...template.parts.map((p) => p.z + (lookupPartSize(p).height || 0)));
    return {
      x: snap(center.h - width / 2, grid),
      y: snap(state.project.yard.depth / 2 - depth / 2, grid),
      z: snap(center.v - height / 2, grid),
    };
  }
  const height =
    template.height ??
    Math.max(...template.parts.map((p) => p.z + (lookupPartSize(p).height || 0)));
  return {
    x: snap(state.project.yard.width / 2 - width / 2, grid),
    y: snap(center.h - depth / 2, grid),
    z: snap(center.v - height / 2, grid),
  };
}

/**
 * @param {{ sourceId: string }} partRef
 */
function lookupPartSize(partRef) {
  const part = defaultParts.find((p) => p.id === partRef.sourceId);
  return part?.dimensions ?? { width: 0, depth: 0, height: 0 };
}
