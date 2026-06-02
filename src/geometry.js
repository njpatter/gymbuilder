/** @typedef {"top" | "front" | "side"} ViewName */

export const STAGE_PADDING = 48;
export const MAJOR_GRID_INCHES = 12;

/** @type {Record<ViewName, { h: string, v: string, hLabel: string, vLabel: string }>} */
export const VIEW_AXES = {
  top: { h: "x", v: "y", hLabel: "+X", vLabel: "+Y" },
  front: { h: "x", v: "z", hLabel: "+X", vLabel: "+Z" },
  side: { h: "y", v: "z", hLabel: "+Y", vLabel: "+Z" },
};

/** @type {Record<ViewName, { h: string, v: string }>} */
export const VIEW_AXIS_KEYS = {
  top: { h: "x", v: "y" },
  front: { h: "x", v: "z" },
  side: { h: "y", v: "z" },
};

/**
 * @param {import("./state.js").AppState["project"]} project
 * @param {ViewName} viewName
 */
export function getDefaultViewBounds(project, viewName) {
  const { width, depth } = project.yard;
  const zTop = 144;
  const zBottom = -48;

  switch (viewName) {
    case "top":
      return { minH: 0, maxH: width, minV: 0, maxV: depth };
    case "front":
      return { minH: 0, maxH: width, minV: zBottom, maxV: zTop };
    case "side":
      return { minH: 0, maxH: depth, minV: zBottom, maxV: zTop };
    default:
      return { minH: 0, maxH: width, minV: 0, maxV: depth };
  }
}

/**
 * @param {number} stageWidth
 * @param {number} stageHeight
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 */
export function computeScale(stageWidth, stageHeight, bounds) {
  const worldW = bounds.maxH - bounds.minH || 1;
  const worldV = bounds.maxV - bounds.minV || 1;
  const availW = stageWidth - STAGE_PADDING * 2;
  const availH = stageHeight - STAGE_PADDING * 2;
  return Math.min(availW / worldW, availH / worldV);
}

/**
 * @typedef {Object} ViewCamera
 * @property {number} zoom
 * @property {number} centerH
 * @property {number} centerV
 */

/**
 * @param {number} stageWidth
 * @param {number} stageHeight
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 * @param {ViewCamera | null | undefined} camera
 */
export function getEffectiveScale(stageWidth, stageHeight, bounds, camera) {
  const base = computeScale(stageWidth, stageHeight, bounds);
  return base * (camera?.zoom ?? 1);
}

/**
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} bounds
 * @param {ViewCamera | null | undefined} camera
 */
export function getCameraCenter(bounds, camera) {
  return {
    centerH: camera?.centerH ?? (bounds.minH + bounds.maxH) / 2,
    centerV: camera?.centerV ?? (bounds.minV + bounds.maxV) / 2,
  };
}

/**
 * @param {ViewName} viewName
 */
export function worldToStage(
  viewName,
  h,
  v,
  bounds,
  stageWidth,
  stageHeight,
  camera,
) {
  const scale = getEffectiveScale(stageWidth, stageHeight, bounds, camera);
  const { centerH, centerV } = getCameraCenter(bounds, camera);
  const x = stageWidth / 2 + (h - centerH) * scale;
  const y = stageHeight / 2 - (v - centerV) * scale;
  return { x, y, scale };
}

/**
 * @param {ViewName} viewName
 */
export function stageToWorld(
  viewName,
  sx,
  sy,
  bounds,
  stageWidth,
  stageHeight,
  camera,
) {
  const { h, v } = stageToWorldHV(
    viewName,
    sx,
    sy,
    bounds,
    stageWidth,
    stageHeight,
    camera,
  );
  return { h, v };
}

/**
 * @param {ViewName} viewName
 */
export function stageToWorldHV(
  viewName,
  sx,
  sy,
  bounds,
  stageWidth,
  stageHeight,
  camera,
) {
  const scale = getEffectiveScale(stageWidth, stageHeight, bounds, camera);
  const { centerH, centerV } = getCameraCenter(bounds, camera);
  const h = centerH + (sx - stageWidth / 2) / scale;
  const v = centerV - (sy - stageHeight / 2) / scale;
  return { h, v };
}

/**
 * @param {number} value
 * @param {number} placementGrid
 */
export function snap(value, placementGrid) {
  const g = Math.max(placementGrid, 1);
  return Math.round(value / g) * g;
}

/**
 * Footprint corners relative to placement origin (lower-left-bottom).
 * @param {number} width
 * @param {number} depth
 * @param {number} rotationZ degrees
 */
export function getFootprintCorners(width, depth, rotationZ) {
  const rad = (rotationZ * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
  return local.map(([px, py]) => ({
    x: px * cos - py * sin,
    y: px * sin + py * cos,
  }));
}

/**
 * @param {number} width
 * @param {number} depth
 * @param {number} rotationZ
 */
export function getFootprintExtents(width, depth, rotationZ) {
  const corners = getFootprintCorners(width, depth, rotationZ);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * @typedef {Object} ViewRect
 * @property {number} h - world horizontal axis value at rect origin (min corner)
 * @property {number} v - world vertical axis value at rect origin (min corner)
 * @property {number} width - size along horizontal view axis
 * @property {number} height - size along vertical view axis
 * @property {number} rotation - degrees for Konva (top view only)
 * @property {number} [offsetH] - stage offset from h for rotated top rect
 * @property {number} [offsetV]
 */

/**
 * Axis-aligned bounds of a placed object in a given orthographic view.
 * @param {import("./state.js").PlacedObject} object
 * @param {ViewName} viewName
 * @returns {ViewRect}
 */
export function getObjectViewRect(object, viewName) {
  const fp = getFootprintExtents(object.width, object.depth, object.rotationZ);
  const bury = object.buryDepth ?? 0;
  const zBottom = object.z - bury;
  const zTop = object.z + object.height;
  const vertSpan = zTop - zBottom;

  switch (viewName) {
    case "top":
      return {
        h: object.x,
        v: object.y,
        width: object.width,
        height: object.depth,
        rotation: object.rotationZ,
        offsetH: 0,
        offsetV: 0,
      };
    case "front":
      return {
        h: object.x + fp.minX,
        v: zBottom,
        width: fp.maxX - fp.minX,
        height: vertSpan,
        rotation: 0,
      };
    case "side":
      return {
        h: object.y + fp.minY,
        v: zBottom,
        width: fp.maxY - fp.minY,
        height: vertSpan,
        rotation: 0,
      };
    default:
      return { h: object.x, v: object.y, width: object.width, height: object.depth, rotation: 0 };
  }
}

/**
 * @param {import("./state.js").PlacedObject} object
 * @param {ViewName} viewName
 * @param {number} worldH
 * @param {number} worldV
 * @param {number} placementGrid
 */
export function updateObjectFromDrag(object, viewName, worldH, worldV, placementGrid) {
  const keys = VIEW_AXIS_KEYS[viewName];
  const hKey = keys.h;
  const vKey = keys.v;

  if (viewName === "top") {
    object[hKey] = snap(worldH, placementGrid);
    object[vKey] = snap(worldV, placementGrid);
    return;
  }

  if (viewName === "front") {
    const fp = getFootprintExtents(object.width, object.depth, object.rotationZ);
    object.x = snap(worldH - fp.minX, placementGrid);
    object[vKey] = snap(worldV, placementGrid);
    return;
  }

  if (viewName === "side") {
    const fp = getFootprintExtents(object.width, object.depth, object.rotationZ);
    object.y = snap(worldH - fp.minY, placementGrid);
    object[vKey] = snap(worldV, placementGrid);
  }
}

/**
 * World (h, v) at stage pixel for a view.
 * @param {ViewName} viewName
 */
export function getWorldAtStage(
  viewName,
  sx,
  sy,
  bounds,
  stageWidth,
  stageHeight,
  camera,
) {
  return stageToWorldHV(
    viewName,
    sx,
    sy,
    bounds,
    stageWidth,
    stageHeight,
    camera,
  );
}
