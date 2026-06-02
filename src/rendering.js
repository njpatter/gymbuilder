import {
  getDefaultViewBounds,
  getObjectViewRect,
  MAJOR_GRID_INCHES,
  VIEW_AXES,
  worldToStage,
} from "./geometry.js";
import { getState, getVerticalSpan, GRADE_Z } from "./state.js";
import {
  getViewCamera,
  initViewZoom,
  registerRenderViewCallback,
  updateZoomLabel,
} from "./viewCamera.js";
import { renderPreview3d } from "./preview3d.js";

/** @typedef {"top" | "front" | "side"} ViewName */

/** @type {Record<ViewName, Konva.Stage>} */
const stages = {};

/** @type {Record<ViewName, { grid: Konva.Layer, guides: Konva.Layer, objects: Konva.Layer, selection: Konva.Layer, labels: Konva.Layer }>} */
const layers = {};

/** @type {Record<ViewName, HTMLElement> | null} */
let containerRefs = null;

const VIEW_IDS = {
  top: "view-top",
  front: "view-front",
  side: "view-side",
};

const VIEW_NAMES = /** @type {ViewName[]} */ (["top", "front", "side"]);

function getKonva() {
  const K = globalThis.Konva;
  if (!K) {
    throw new Error(
      "Konva is not loaded. Serve the app over http://localhost (not file://) and check your network.",
    );
  }
  return K;
}

/**
 * @param {Record<ViewName, HTMLElement>} containers
 */
export function initRenderer(containers) {
  getKonva();
  containerRefs = containers;
  registerRenderViewCallback(renderView);
  ensureStages();
  renderAllViews();
}

function ensureStages() {
  if (!containerRefs) return;

  for (const viewName of VIEW_NAMES) {
    const container = containerRefs[viewName];
    if (!container) continue;

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);

    if (stages[viewName]) {
      stages[viewName].width(w);
      stages[viewName].height(h);
      continue;
    }

    const Konva = getKonva();
    const stage = new Konva.Stage({
      container,
      width: w,
      height: h,
    });

    const grid = new Konva.Layer({ listening: false });
    const guides = new Konva.Layer({ listening: false });
    const objects = new Konva.Layer();
    const selection = new Konva.Layer({ listening: false });
    const labels = new Konva.Layer({ listening: false });

    stage.add(grid);
    stage.add(guides);
    stage.add(objects);
    stage.add(selection);
    stage.add(labels);

    stages[viewName] = stage;
    layers[viewName] = { grid, guides, objects, selection, labels };
    initViewZoom(stage, viewName);
    updateZoomLabel(viewName);
  }
}

/**
 * @param {ViewName} viewName
 */
export function getStage(viewName) {
  return stages[viewName];
}

/**
 * @param {ViewName} viewName
 */
export function getViewBounds(viewName) {
  return getDefaultViewBounds(getState().project, viewName);
}

export function resizeStages() {
  if (!containerRefs) {
    containerRefs = {
      top: document.getElementById(VIEW_IDS.top),
      front: document.getElementById(VIEW_IDS.front),
      side: document.getElementById(VIEW_IDS.side),
    };
  }
  ensureStages();
  renderAllViews();
}

export function renderAllViews() {
  if (!stages.top) return;
  for (const viewName of VIEW_NAMES) {
    renderView(viewName);
  }
  renderPreview3d();
}

export function renderObjectsAndSelection() {
  if (!stages.top) return;
  for (const viewName of VIEW_NAMES) {
    drawObjects(layers[viewName].objects, viewName);
    drawSelection(layers[viewName].selection, viewName);
    layers[viewName].objects.batchDraw();
    layers[viewName].selection.batchDraw();
  }
  renderPreview3d();
}

/**
 * @param {ViewName} viewName
 */
export function renderView(viewName) {
  const stage = stages[viewName];
  const L = layers[viewName];
  if (!stage || !L) return;

  const state = getState();
  const bounds = getDefaultViewBounds(state.project, viewName);
  const w = stage.width();
  const h = stage.height();
  const camera = getViewCamera(viewName, bounds);

  L.grid.destroyChildren();
  L.guides.destroyChildren();
  L.labels.destroyChildren();

  drawGrid(L.grid, viewName, bounds, w, h, state.project.placementGrid, camera);
  drawGuides(L.guides, viewName, bounds, w, h, state.project, camera);
  drawAxisLabels(L.labels, viewName, bounds, w, h, camera);
  drawObjects(L.objects, viewName);
  drawSelection(L.selection, viewName);

  L.grid.batchDraw();
  L.guides.batchDraw();
  L.labels.batchDraw();
  L.objects.batchDraw();
  L.selection.batchDraw();
}

/**
 * @param {Konva.Layer} layer
 * @param {ViewName} viewName
 */
function drawObjects(layer, viewName) {
  layer.destroyChildren();
  const state = getState();
  const stage = stages[viewName];
  const bounds = getDefaultViewBounds(state.project, viewName);
  const w = stage.width();
  const h = stage.height();
  const camera = getViewCamera(viewName, bounds);

  for (const obj of state.project.objects) {
    const group = buildObjectGroup(obj, viewName, bounds, w, h, camera);
    layer.add(group);
  }
}

/**
 * @param {import("./state.js").PlacedObject} obj
 * @param {ViewName} viewName
 */
function buildObjectGroup(obj, viewName, bounds, stageW, stageH, camera) {
  const group = new Konva.Group({
    name: "object",
    objectId: obj.id,
  });

  if (viewName === "top") {
    drawTopObject(group, obj, bounds, stageW, stageH, camera);
  } else {
    drawElevationObject(group, obj, viewName, bounds, stageW, stageH, camera);
  }

  return group;
}

/**
 * @param {import("./state.js").PlacedObject} obj
 */
function drawTopObject(group, obj, bounds, stageW, stageH, camera) {
  const Konva = getKonva();
  const p = worldToStage("top", obj.x, obj.y, bounds, stageW, stageH, camera);
  const p2 = worldToStage(
    "top",
    obj.x + obj.width,
    obj.y + obj.depth,
    bounds,
    stageW,
    stageH,
    camera,
  );
  const wPx = Math.max(Math.abs(p2.x - p.x), 2);
  const hPx = Math.max(Math.abs(p2.y - p.y), 2);

  group.add(
    new Konva.Rect({
      x: p.x,
      y: p.y,
      width: wPx,
      height: hPx,
      offsetX: 0,
      offsetY: hPx,
      rotation: obj.rotationZ,
      fill: "rgba(196, 149, 106, 0.85)",
      stroke: "#c4956a",
      strokeWidth: 2,
      objectId: obj.id,
    }),
  );
}

/**
 * @param {import("./state.js").PlacedObject} obj
 * @param {ViewName} viewName
 */
function drawElevationObject(group, obj, viewName, bounds, stageW, stageH, camera) {
  const Konva = getKonva();
  const rect = getObjectViewRect(obj, viewName);
  const pLeft = worldToStage(viewName, rect.h, 0, bounds, stageW, stageH, camera);
  const pRight = worldToStage(
    viewName,
    rect.h + rect.width,
    0,
    bounds,
    stageW,
    stageH,
    camera,
  );
  const wPx = Math.abs(pRight.x - pLeft.x);
  const xPx = Math.min(pLeft.x, pRight.x);

  const bury = obj.buryDepth ?? 0;
  const span = getVerticalSpan(obj);
  const pGrade = worldToStage(viewName, rect.h, GRADE_Z, bounds, stageW, stageH, camera);

  if (bury > 0) {
    const pBottom = worldToStage(
      viewName,
      rect.h,
      span.bottom,
      bounds,
      stageW,
      stageH,
      camera,
    );
    group.add(
      new Konva.Rect({
        x: xPx,
        y: Math.min(pGrade.y, pBottom.y),
        width: wPx,
        height: Math.abs(pGrade.y - pBottom.y),
        fill: "rgba(90, 70, 50, 0.85)",
        stroke: "#5a4632",
        strokeWidth: 1,
        objectId: obj.id,
      }),
    );

    const pTop = worldToStage(viewName, rect.h, span.top, bounds, stageW, stageH, camera);
    group.add(
      new Konva.Rect({
        x: xPx,
        y: Math.min(pGrade.y, pTop.y),
        width: wPx,
        height: Math.abs(pGrade.y - pTop.y),
        fill: "rgba(196, 149, 106, 0.85)",
        stroke: "#c4956a",
        strokeWidth: 2,
        objectId: obj.id,
      }),
    );
    return;
  }

  const pBottom = worldToStage(
    viewName,
    rect.h,
    span.bottom,
    bounds,
    stageW,
    stageH,
    camera,
  );
  const pTop = worldToStage(viewName, rect.h, span.top, bounds, stageW, stageH, camera);
  group.add(
    new Konva.Rect({
      x: xPx,
      y: Math.min(pBottom.y, pTop.y),
      width: wPx,
      height: Math.abs(pTop.y - pBottom.y),
      fill: "rgba(196, 149, 106, 0.85)",
      stroke: "#c4956a",
      strokeWidth: 2,
      objectId: obj.id,
    }),
  );
}

/**
 * @param {Konva.Layer} layer
 * @param {ViewName} viewName
 */
function drawSelection(layer, viewName) {
  const Konva = getKonva();
  layer.destroyChildren();
  const state = getState();
  const stage = stages[viewName];
  const bounds = getDefaultViewBounds(state.project, viewName);
  const w = stage.width();
  const h = stage.height();
  const camera = getViewCamera(viewName, bounds);

  for (const id of state.selectedIds) {
    const obj = state.project.objects.find((o) => o.id === id);
    if (!obj) continue;

    const rect = getObjectViewRect(obj, viewName);
    const p0 = worldToStage(viewName, rect.h, rect.v, bounds, w, h, camera);
    const p1 = worldToStage(
      viewName,
      rect.h + rect.width,
      rect.v + rect.height,
      bounds,
      w,
      h,
      camera,
    );

    if (viewName === "top") {
      const pOrigin = worldToStage("top", obj.x, obj.y, bounds, w, h, camera);
      const pFar = worldToStage(
        "top",
        obj.x + obj.width,
        obj.y + obj.depth,
        bounds,
        w,
        h,
        camera,
      );
      const wPx = Math.abs(pFar.x - pOrigin.x);
      const hPx = Math.abs(pFar.y - pOrigin.y);
      layer.add(
        new Konva.Rect({
          x: pOrigin.x,
          y: pOrigin.y,
          width: wPx,
          height: hPx,
          offsetX: 0,
          offsetY: hPx,
          rotation: obj.rotationZ,
          stroke: "#5b9fd4",
          strokeWidth: 3,
          dash: [6, 4],
          listening: false,
        }),
      );
    } else {
      layer.add(
        new Konva.Rect({
          x: Math.min(p0.x, p1.x) - 3,
          y: Math.min(p0.y, p1.y) - 3,
          width: Math.abs(p1.x - p0.x) + 6,
          height: Math.abs(p1.y - p0.y) + 6,
          stroke: "#5b9fd4",
          strokeWidth: 3,
          dash: [6, 4],
          listening: false,
        }),
      );
    }
  }
}

/**
 * @param {Konva.Layer} layer
 * @param {ViewName} viewName
 */
function drawGrid(layer, viewName, bounds, stageW, stageH, placementGrid, camera) {
  const Konva = getKonva();
  const gridStep = Math.max(placementGrid, 1);
  const startH = Math.floor(bounds.minH / gridStep) * gridStep;
  const endH = bounds.maxH;
  const startV = Math.floor(bounds.minV / gridStep) * gridStep;
  const endV = bounds.maxV;

  for (let hv = startH; hv <= endH; hv += gridStep) {
    const p0 = worldToStage(viewName, hv, bounds.minV, bounds, stageW, stageH, camera);
    const p1 = worldToStage(viewName, hv, bounds.maxV, bounds, stageW, stageH, camera);
    const major = hv % MAJOR_GRID_INCHES === 0;
    layer.add(
      new Konva.Line({
        points: [p0.x, p0.y, p1.x, p1.y],
        stroke: major ? "#454e5e" : "#333a46",
        strokeWidth: major ? 1 : 0.5,
        listening: false,
      }),
    );
  }

  for (let vv = startV; vv <= endV; vv += gridStep) {
    const p0 = worldToStage(viewName, bounds.minH, vv, bounds, stageW, stageH, camera);
    const p1 = worldToStage(viewName, bounds.maxH, vv, bounds, stageW, stageH, camera);
    const major = vv % MAJOR_GRID_INCHES === 0;
    layer.add(
      new Konva.Line({
        points: [p0.x, p0.y, p1.x, p1.y],
        stroke: major ? "#454e5e" : "#333a46",
        strokeWidth: major ? 1 : 0.5,
        listening: false,
      }),
    );
  }
}

/**
 * @param {Konva.Layer} layer
 * @param {ViewName} viewName
 * @param {import("./state.js").AppState["project"]} project
 */
function drawGuides(layer, viewName, bounds, stageW, stageH, project, camera) {
  if (viewName === "top") {
    drawYardOutline(layer, viewName, project.yard, bounds, stageW, stageH, camera);
  } else {
    drawGroundLine(layer, viewName, bounds, stageW, stageH, camera);
  }
}

/**
 * @param {{ width: number, depth: number }} yard
 */
function drawYardOutline(layer, viewName, yard, bounds, stageW, stageH, camera) {
  const Konva = getKonva();
  const corners = [
    [0, 0],
    [yard.width, 0],
    [yard.width, yard.depth],
    [0, yard.depth],
  ];
  const pts = [];
  for (const [xh, yv] of corners) {
    const p = worldToStage(viewName, xh, yv, bounds, stageW, stageH, camera);
    pts.push(p.x, p.y);
  }
  pts.push(pts[0], pts[1]);

  layer.add(
    new Konva.Line({
      points: pts,
      stroke: "#c9a227",
      strokeWidth: 2,
      closed: true,
      dash: [8, 6],
      listening: false,
    }),
  );
}

function drawGroundLine(layer, viewName, bounds, stageW, stageH, camera) {
  const Konva = getKonva();
  const p0 = worldToStage(viewName, bounds.minH, 0, bounds, stageW, stageH, camera);
  const p1 = worldToStage(viewName, bounds.maxH, 0, bounds, stageW, stageH, camera);

  layer.add(
    new Konva.Line({
      points: [p0.x, p0.y, p1.x, p1.y],
      stroke: "#6bcf7f",
      strokeWidth: 2,
      listening: false,
    }),
  );
}

function drawAxisLabels(layer, viewName, bounds, stageW, stageH, camera) {
  const Konva = getKonva();
  const axes = VIEW_AXES[viewName];
  const origin = worldToStage(viewName, 0, 0, bounds, stageW, stageH, camera);
  const xEnd = worldToStage(viewName, bounds.maxH * 0.15, 0, bounds, stageW, stageH, camera);
  const yEnd = worldToStage(viewName, 0, bounds.maxV * 0.15, bounds, stageW, stageH, camera);

  layer.add(
    new Konva.Arrow({
      points: [origin.x, origin.y, xEnd.x, xEnd.y],
      stroke: "#5b9fd4",
      fill: "#5b9fd4",
      strokeWidth: 2,
      pointerLength: 6,
      pointerWidth: 6,
      listening: false,
    }),
  );

  layer.add(
    new Konva.Arrow({
      points: [origin.x, origin.y, yEnd.x, yEnd.y],
      stroke: "#5b9fd4",
      fill: "#5b9fd4",
      strokeWidth: 2,
      pointerLength: 6,
      pointerWidth: 6,
      listening: false,
    }),
  );

  layer.add(
    new Konva.Text({
      x: xEnd.x + 4,
      y: xEnd.y - 6,
      text: axes.hLabel,
      fontSize: 12,
      fontStyle: "bold",
      fill: "#5b9fd4",
      listening: false,
    }),
  );

  layer.add(
    new Konva.Text({
      x: yEnd.x - 8,
      y: yEnd.y - 20,
      text: axes.vLabel,
      fontSize: 12,
      fontStyle: "bold",
      fill: "#5b9fd4",
      listening: false,
    }),
  );
}
