import {
  computeScale,
  getDefaultViewBounds,
  stageToWorldHV,
} from "./geometry.js";
import { getState } from "./state.js";

/** @typedef {"top" | "front" | "side"} ViewName */
/** @typedef {import("./geometry.js").ViewCamera} ViewCamera */

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 12;

/** @type {Record<ViewName, ViewCamera>} */
const cameras = {};

/** @type {(viewName: ViewName) => void} */
let renderViewCallback = () => {};

/**
 * @param {(viewName: ViewName) => void} fn
 */
export function registerRenderViewCallback(fn) {
  renderViewCallback = fn;
}

/**
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 * @returns {ViewCamera}
 */
export function createDefaultCamera(bounds) {
  return {
    zoom: 1,
    centerH: (bounds.minH + bounds.maxH) / 2,
    centerV: (bounds.minV + bounds.maxV) / 2,
  };
}

/**
 * @param {ViewName} viewName
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 * @returns {ViewCamera}
 */
export function getViewCamera(viewName, bounds) {
  if (!cameras[viewName]) {
    cameras[viewName] = createDefaultCamera(bounds);
  }
  return cameras[viewName];
}

/**
 * @param {ViewName} viewName
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 */
export function resetViewCamera(viewName, bounds) {
  cameras[viewName] = createDefaultCamera(bounds);
  updateZoomLabel(viewName);
  renderViewCallback(viewName);
}

export function resetAllViewCameras() {
  const project = getState().project;
  for (const viewName of /** @type {ViewName[]} */ (["top", "front", "side"])) {
    const bounds = getDefaultViewBounds(project, viewName);
    cameras[viewName] = createDefaultCamera(bounds);
    updateZoomLabel(viewName);
  }
}

/**
 * @param {ViewName} viewName
 */
export function updateZoomLabel(viewName) {
  const el = document.querySelector(`[data-zoom-label="${viewName}"]`);
  if (!el) return;
  const project = getState().project;
  const bounds = getDefaultViewBounds(project, viewName);
  const cam = getViewCamera(viewName, bounds);
  el.textContent = `${Math.round(cam.zoom * 100)}%`;
}

/**
 * @param {number} zoom
 */
function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * @param {ViewName} viewName
 * @param {number} stageX
 * @param {number} stageY
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 * @param {number} stageW
 * @param {number} stageH
 * @param {number} factor
 */
export function zoomViewAtStagePoint(
  viewName,
  stageX,
  stageY,
  bounds,
  stageW,
  stageH,
  factor,
) {
  const cam = getViewCamera(viewName, bounds);
  const before = stageToWorldHV(viewName, stageX, stageY, bounds, stageW, stageH, cam);

  cam.zoom = clampZoom(cam.zoom * factor);

  const after = stageToWorldHV(viewName, stageX, stageY, bounds, stageW, stageH, cam);
  cam.centerH += before.h - after.h;
  cam.centerV += before.v - after.v;

  updateZoomLabel(viewName);
  renderViewCallback(viewName);
}

/**
 * @param {ViewName} viewName
 * @param {number} deltaH world inches
 * @param {number} deltaV world inches
 */
export function panView(viewName, deltaH, deltaV) {
  const project = getState().project;
  const bounds = getDefaultViewBounds(project, viewName);
  const cam = getViewCamera(viewName, bounds);
  cam.centerH += deltaH;
  cam.centerV += deltaV;
  renderViewCallback(viewName);
}

/**
 * @param {import("konva/lib/Stage").Stage} stage
 * @param {ViewName} viewName
 */
export function initViewZoom(stage, viewName) {
  const container = stage.container();

  stage.on("wheel", (e) => {
    e.evt.preventDefault();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const project = getState().project;
    const bounds = getDefaultViewBounds(project, viewName);
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
    zoomViewAtStagePoint(
      viewName,
      pointer.x,
      pointer.y,
      bounds,
      stage.width(),
      stage.height(),
      factor,
    );
  });

  /** @type {{ viewName: ViewName, lastX: number, lastY: number, scale: number } | null} */
  let panSession = null;

  stage.on("mousedown touchstart", (e) => {
    const middle = e.evt.button === 1;
    const altPan = e.evt.altKey && e.evt.button === 0;
    if (!middle && !altPan) return;
    e.evt.preventDefault();

    const project = getState().project;
    const bounds = getDefaultViewBounds(project, viewName);
    const cam = getViewCamera(viewName, bounds);
    const baseScale = computeScale(stage.width(), stage.height(), bounds);
    const pos = stage.getPointerPosition();
    panSession = {
      viewName,
      lastX: pos?.x ?? 0,
      lastY: pos?.y ?? 0,
      scale: baseScale * cam.zoom,
    };
  });

  const endPan = () => {
    panSession = null;
  };

  stage.on("mouseup touchend", endPan);
  stage.on("mouseleave", endPan);

  stage.on("mousemove touchmove", () => {
    if (!panSession || panSession.viewName !== viewName) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const dx = pos.x - panSession.lastX;
    const dy = pos.y - panSession.lastY;
    panSession.lastX = pos.x;
    panSession.lastY = pos.y;

    panView(viewName, -dx / panSession.scale, dy / panSession.scale);
  });

  container.addEventListener(
    "wheel",
    (evt) => {
      evt.preventDefault();
    },
    { passive: false },
  );
}

/**
 * @param {Record<ViewName, import("konva/lib/Stage").Stage | undefined>} getStageForView
 */
export function initViewZoomControls(getStageForView) {
  document.querySelectorAll("[data-zoom-view]").forEach((wrap) => {
    const viewName = /** @type {ViewName} */ (wrap.getAttribute("data-zoom-view"));
    if (!viewName) return;

    wrap.addEventListener("click", (e) => {
      const btn = /** @type {HTMLElement} */ (e.target).closest("[data-zoom-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-zoom-action");
      const project = getState().project;
      const bounds = getDefaultViewBounds(project, viewName);

      if (action === "reset") {
        resetViewCamera(viewName, bounds);
        return;
      }

      const stage = getStageForView[viewName];
      if (!stage) return;

      const factor = action === "in" ? 1.25 : 0.8;
      zoomViewAtStagePoint(
        viewName,
        stage.width() / 2,
        stage.height() / 2,
        bounds,
        stage.width(),
        stage.height(),
        factor,
      );
    });
  });

  for (const viewName of /** @type {ViewName[]} */ (["top", "front", "side"])) {
    updateZoomLabel(viewName);
  }
}
