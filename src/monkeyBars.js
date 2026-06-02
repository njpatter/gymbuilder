import { defaultParts } from "../data/defaultParts.js";
import { snap } from "./geometry.js";

/** @typedef {import("./state.js").PlacedObject} PlacedObject */

/**
 * @typedef {Object} MonkeyBarsConfig
 * @property {number} spanX
 * @property {number} spanY
 * @property {number} rungCount
 * @property {number} rungSpacing
 * @property {number} rungStartX
 * @property {number} crossBeamZ
 * @property {number} rungZ
 * @property {number} postBuryDepth
 * @property {string} crossBeamSourceId
 */

export const DEFAULT_MONKEY_BARS_CONFIG = {
  spanX: 96,
  spanY: 48,
  rungCount: 5,
  rungSpacing: 12,
  rungStartX: 12,
  crossBeamZ: 84,
  rungZ: 90,
  postBuryDepth: 24,
  crossBeamSourceId: "beam_4x4_96",
};

const POST_ID = "post_4x4_8ft";
const RUNG_ID = "bar_48in";

/** @type {{ id: string, label: string }[]} */
export const CROSS_BEAM_OPTIONS = [
  { id: "beam_4x4_96", label: '4×4 (3.5" × 3.5")' },
  { id: "beam_4x6_96", label: '4×6 (3.5" × 5.5")' },
];

/**
 * @param {MonkeyBarsConfig} config
 */
export function getCrossBeamCatalog(config) {
  const id = config.crossBeamSourceId ?? "beam_4x4_96";
  return defaultParts.find((p) => p.id === id) ?? defaultParts.find((p) => p.id === "beam_4x4_96");
}

/**
 * @param {MonkeyBarsConfig} config
 */
export function getRungSpanY(config) {
  const beam = getCrossBeamCatalog(config);
  return config.spanY - (beam?.dimensions.depth ?? 3.5);
}

/**
 * @param {{ x: number, y: number, z: number }} origin
 * @param {MonkeyBarsConfig} config
 * @param {number} grid
 */
export function buildCrossBeamDefs(origin, config, grid) {
  const beam = getCrossBeamCatalog(config);
  if (!beam) return [];

  const { spanX, spanY, crossBeamZ } = config;
  const beamD = beam.dimensions.depth;

  return [
    {
      partRole: "crossBeam",
      sourceId: beam.id,
      name: `Cross beam (front) · ${beam.lumber ?? "beam"}`,
      x: snap(origin.x, grid),
      y: snap(origin.y, grid),
      z: snap(crossBeamZ, grid),
      width: beam.dimensions.width,
      depth: beam.dimensions.depth,
      height: beam.dimensions.height,
      buryDepth: 0,
      rotationZ: 0,
    },
    {
      partRole: "crossBeam",
      sourceId: beam.id,
      name: `Cross beam (back) · ${beam.lumber ?? "beam"}`,
      x: snap(origin.x, grid),
      y: snap(origin.y + spanY - beamD, grid),
      z: snap(crossBeamZ, grid),
      width: beam.dimensions.width,
      depth: beam.dimensions.depth,
      height: beam.dimensions.height,
      buryDepth: 0,
      rotationZ: 0,
    },
  ];
}

/**
 * @param {{ x: number, y: number, z: number }} origin
 * @param {MonkeyBarsConfig} config
 * @param {number} grid
 * @returns {Array<Partial<PlacedObject> & { partRole: string }>}
 */
export function buildMonkeyBarsPartDefs(origin, config, grid) {
  const post = defaultParts.find((p) => p.id === POST_ID);
  if (!post) return [];

  const { spanX, spanY, postBuryDepth } = config;
  const postW = post.dimensions.width;
  const postD = post.dimensions.depth;
  const rungSpanY = getRungSpanY(config);

  /** @type {Array<Partial<PlacedObject> & { partRole: string }>} */
  const defs = [];

  const corners = [
    [0, 0],
    [spanX - postW, 0],
    [0, spanY - postD],
    [spanX - postW, spanY - postD],
  ];

  for (const [px, py] of corners) {
    defs.push({
      partRole: "post",
      sourceId: POST_ID,
      name: post.name,
      x: snap(origin.x + px, grid),
      y: snap(origin.y + py, grid),
      z: 0,
      width: post.dimensions.width,
      depth: post.dimensions.depth,
      height: post.dimensions.height,
      buryDepth: postBuryDepth,
      rotationZ: 0,
    });
  }

  defs.push(...buildCrossBeamDefs(origin, config, grid));
  defs.push(...buildRungDefs(origin, config, grid, rungSpanY));

  return defs;
}

/**
 * @param {{ x: number, y: number, z: number }} origin
 * @param {MonkeyBarsConfig} config
 * @param {number} grid
 * @param {number} rungSpanY
 */
export function buildRungDefs(origin, config, grid, rungSpanY) {
  const rungCatalog = defaultParts.find((p) => p.id === RUNG_ID);
  if (!rungCatalog) return [];

  const beam = getCrossBeamCatalog(config);
  const beamD = beam?.dimensions.depth ?? 3.5;
  const rungY = origin.y + beamD;
  const defs = [];

  for (let i = 0; i < config.rungCount; i++) {
    const x = origin.x + config.rungStartX + i * config.rungSpacing;
    defs.push({
      partRole: "rung",
      sourceId: RUNG_ID,
      name: `Rung ${i + 1}`,
      x: snap(x, grid),
      y: snap(rungY, grid),
      z: snap(config.rungZ, grid),
      width: 1.25,
      depth: snap(rungSpanY, grid),
      height: 1.25,
      buryDepth: 0,
      rotationZ: 0,
    });
  }

  return defs;
}

/**
 * @param {MonkeyBarsConfig} config
 */
export function getMonkeyBarsTemplateBounds(config) {
  return {
    width: config.spanX,
    depth: config.spanY,
    height: config.rungZ + 6,
  };
}
