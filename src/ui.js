import { snap } from "./geometry.js";
import {
  applyGroupPostBuryDepth,
  getMonkeyBarsGroupForParentId,
  updateMonkeyBarsConfig,
} from "./groups.js";
import { refreshLibrary } from "./library.js";
import { CROSS_BEAM_OPTIONS } from "./monkeyBars.js";
import { renderAllViews, resizeStages } from "./rendering.js";
import { pushUndoSnapshot } from "./history.js";
import { saveSelectionAsTemplate } from "./templates.js";
import { defaultParts } from "../data/defaultParts.js";
import {
  getObjectById,
  getState,
  getVerticalSpan,
  isPartiallyBuried,
  setActiveView,
  updatePlacedObject,
} from "./state.js";

/** @typedef {"top" | "front" | "side"} ViewName */

const BURY_PRESETS = [0, 12, 18, 24, 30, 36, 48];

export function getViewContainers() {
  return {
    top: /** @type {HTMLElement} */ (document.getElementById("view-top")),
    front: /** @type {HTMLElement} */ (document.getElementById("view-front")),
    side: /** @type {HTMLElement} */ (document.getElementById("view-side")),
  };
}

export function initUi() {
  wireViewPanelActivation();
  wireResize();
  updatePropertiesPanel();
  updateToolbarState();
}

function wireViewPanelActivation() {
  document.querySelectorAll(".view-panel[data-view]").forEach((panel) => {
    const view = panel.getAttribute("data-view");
    if (view === "3d") return;

    panel.addEventListener("pointerdown", () => {
      document
        .querySelectorAll(".view-panel[data-view]")
        .forEach((p) => p.classList.remove("view-panel-active"));
      panel.classList.add("view-panel-active");
      setActiveView(/** @type {ViewName} */ (view));
    });
  });

  document.querySelector('.view-panel[data-view="top"]')?.classList.add("view-panel-active");
}

function wireResize() {
  const ro = new ResizeObserver(() => {
    resizeStages();
    updatePropertiesPanel();
  });

  for (const el of Object.values(getViewContainers())) {
    if (el) ro.observe(el);
  }

  window.addEventListener("resize", () => resizeStages());
}

export function updateToolbarState() {
  const explodeBtn = document.getElementById("btn-explode");
  const deleteBtn = document.getElementById("btn-delete");
  const saveTplBtn = document.getElementById("btn-save-template");
  const state = getState();
  const n = state.selectedIds.length;
  const hasSelection = n > 0;
  const canExplode = state.selectedIds.some((id) => getObjectById(id)?.parentId);

  if (deleteBtn) deleteBtn.disabled = !hasSelection;
  if (explodeBtn) explodeBtn.disabled = !canExplode;
  if (saveTplBtn) saveTplBtn.disabled = n < 1;
}

export function updatePropertiesPanel() {
  updateToolbarState();

  const panel = document.querySelector(".sidebar-props");
  if (!panel) return;

  const state = getState();

  let body = panel.querySelector(".props-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "props-body";
    panel.querySelectorAll(".sidebar-placeholder").forEach((el) => el.remove());
    panel.appendChild(body);
  }

  if (state.selectedIds.length === 0) {
    renderProjectProperties(body, state);
    return;
  }

  if (state.selectedIds.length > 1) {
    renderMultiSelectProperties(body, state);
    return;
  }

  const obj = getObjectById(state.selectedIds[0]);
  if (!obj) {
    body.innerHTML = `<p class="sidebar-placeholder">Select an object to edit</p>`;
    return;
  }

  const monkeyGroup = getMonkeyBarsGroupForParentId(obj.parentId);
  if (monkeyGroup) {
    renderMonkeyBarsProperties(body, obj, monkeyGroup);
    return;
  }

  const span = getVerticalSpan(obj);
  const bury = obj.buryDepth ?? 0;
  const presetValue = BURY_PRESETS.includes(bury) ? String(bury) : "custom";
  const buried = isPartiallyBuried(obj);
  const isPost = defaultParts.find((p) => p.id === obj.sourceId)?.type === "post";

  body.innerHTML = `
    <div class="prop-field">
      <label class="prop-label" for="prop-name">Name</label>
      <input id="prop-name" class="prop-input" type="text" value="${escapeAttr(obj.name)}" data-prop="name" />
    </div>

    <div class="prop-row-3">
      ${numField("X", "x", obj.x)}
      ${numField("Y", "y", obj.y)}
      ${numField("Z (grade)", "z", obj.z, buried || isPost, "Buried posts stay at grade (z=0)")}
    </div>

    <div class="prop-row-3">
      ${numField("Width", "width", obj.width)}
      ${numField("Depth", "depth", obj.depth)}
      ${numField("Height ↑", "height", obj.height, false, "Above grade only")}
    </div>

    <div class="prop-field">
      <label class="prop-label" for="prop-rotation">Rotation Z</label>
      <input id="prop-rotation" class="prop-input" type="number" step="1" value="${obj.rotationZ}" data-prop="rotationZ" />
      <span class="prop-unit">degrees</span>
    </div>

    <div class="prop-field">
      <label class="prop-label" for="bury-preset">Below grade (bury)</label>
      <select id="bury-preset" class="prop-select" data-action="bury-preset">
        ${buildBuryPresetOptions(bury, presetValue)}
      </select>
    </div>

    <div class="prop-field prop-field-inline">
      <label class="prop-label" for="bury-custom">Custom bury</label>
      <div class="prop-input-row">
        <input id="bury-custom" class="prop-input" type="number" min="0" step="1" value="${bury}" data-action="bury-custom" />
        <span class="prop-unit">in</span>
      </div>
      <p class="prop-help">${
        buried ? "Buried: front/side drag is horizontal only." : "Set bury &gt; 0 for in-ground posts."
      }</p>
    </div>

    <div class="prop-field prop-check">
      <label><input type="checkbox" data-prop="locked" ${obj.locked ? "checked" : ""} /> Locked</label>
    </div>

    <p class="props-meta">Total Z: <span class="props-z-span">${fmt(span.bottom)}" – ${fmt(span.top)}"</span></p>
    <p class="props-hint">⌫ delete · ⌘C/V copy/paste · ⌘Z undo · shift-click multi-select</p>
  `;

  wirePropertiesForm(body, obj.id);
}

/**
 * @param {HTMLElement} body
 * @param {import("./state.js").PlacedObject} obj
 * @param {{ parentId: string, meta: import("./groups.js").MonkeyBarsGroupMeta }} monkeyGroup
 */
/**
 * @param {HTMLElement} body
 * @param {import("./state.js").AppState} state
 */
function renderProjectProperties(body, state) {
  const p = state.project;
  const o = p.dimensionOrigin;
  body.innerHTML = `
    <div class="prop-section">
      <h3 class="prop-section-title">Project</h3>
      <div class="prop-field">
        <label class="prop-label" for="project-name">Name</label>
        <input id="project-name" class="prop-input" type="text" value="${escapeAttr(p.name)}" data-project-field="name" />
      </div>
      <p class="prop-help">Dimension origin for export (inches from world 0,0,0).</p>
      <div class="prop-row-3">
        <div class="prop-field prop-field-tight">
          <label class="prop-label" for="dim-x">Origin X</label>
          <input id="dim-x" class="prop-input" type="number" step="1" value="${o.x}" data-project-field="dimensionOrigin.x" />
        </div>
        <div class="prop-field prop-field-tight">
          <label class="prop-label" for="dim-y">Origin Y</label>
          <input id="dim-y" class="prop-input" type="number" step="1" value="${o.y}" data-project-field="dimensionOrigin.y" />
        </div>
        <div class="prop-field prop-field-tight">
          <label class="prop-label" for="dim-z">Origin Z</label>
          <input id="dim-z" class="prop-input" type="number" step="1" value="${o.z}" data-project-field="dimensionOrigin.z" />
        </div>
      </div>
    </div>
    <p class="props-hint">Save / Export in toolbar · shift-click to multi-select</p>
  `;
  wireProjectFields(body);
}

/**
 * @param {HTMLElement} body
 */
function wireProjectFields(body) {
  body.querySelectorAll("[data-project-field]").forEach((el) => {
    el.addEventListener("change", () => {
      const field = el.getAttribute("data-project-field");
      const state = getState();
      if (field === "name" && el instanceof HTMLInputElement) {
        state.project.name = el.value.trim() || "Untitled Ninja Gym";
        return;
      }
      if (field?.startsWith("dimensionOrigin.") && el instanceof HTMLInputElement) {
        const key = /** @type {"x"|"y"|"z"} */ (field.split(".")[1]);
        const num = Number(el.value);
        if (!Number.isNaN(num) && key in state.project.dimensionOrigin) {
          state.project.dimensionOrigin[key] = num;
        }
      }
    });
  });
}

/**
 * @param {HTMLElement} body
 * @param {import("./state.js").AppState} state
 */
function renderMultiSelectProperties(body, state) {
  const n = state.selectedIds.length;
  body.innerHTML = `
    <div class="prop-section">
      <h3 class="prop-section-title">Selection</h3>
      <p class="prop-help">${n} objects selected · shift-click to add or remove.</p>
      <button type="button" class="toolbar-btn props-action-btn" id="btn-save-template-panel">
        Save as template…
      </button>
    </div>
    <p class="props-hint">⌫ delete · ⌘C/V copy/paste</p>
  `;
  body.querySelector("#btn-save-template-panel")?.addEventListener("click", () => {
    promptSaveTemplate();
  });
}

export function promptSaveTemplate() {
  const state = getState();
  if (!state.selectedIds.length) return;

  const name = prompt("Template name:", "My subsystem");
  if (name === null) return;

  const template = saveSelectionAsTemplate(name);
  if (!template) {
    alert("Could not save template (need a non-empty name).");
    return;
  }

  refreshLibrary();
  updatePropertiesPanel();
  const toast = document.getElementById("status-toast");
  if (toast) {
    toast.textContent = `Saved template “${template.name}”.`;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }
}

function renderMonkeyBarsProperties(body, obj, monkeyGroup) {
  const { parentId, meta } = monkeyGroup;
  const c = meta.config;
  const bury = c.postBuryDepth ?? 0;
  const presetValue = BURY_PRESETS.includes(bury) ? String(bury) : "custom";
  const partLabel =
    obj.partRole === "post"
      ? "Vertical post"
      : obj.partRole === "crossBeam"
        ? "Cross beam"
        : obj.partRole === "rung"
          ? "Metal rung"
          : "Part";

  const beamOptions = CROSS_BEAM_OPTIONS.map(
    (opt) =>
      `<option value="${opt.id}"${opt.id === (c.crossBeamSourceId ?? "beam_4x4_96") ? " selected" : ""}>${opt.label}</option>`,
  ).join("");

  body.innerHTML = `
    <div class="prop-section">
      <h3 class="prop-section-title">Monkey bars</h3>
      <p class="prop-help">Editing: ${escapeHtml(partLabel)} · group settings apply to all matching parts.</p>

      <div class="prop-field">
        <label class="prop-label" for="monkey-bury-preset">All posts — below grade</label>
        <select id="monkey-bury-preset" class="prop-select" data-monkey-bury="${parentId}">
          ${buildBuryPresetOptions(bury, presetValue)}
        </select>
      </div>
      <div class="prop-field prop-field-inline">
        <label class="prop-label" for="monkey-bury-custom">Custom bury (all posts)</label>
        <div class="prop-input-row">
          <input id="monkey-bury-custom" class="prop-input" type="number" min="0" step="1" value="${bury}" data-monkey-bury-custom="${parentId}" />
          <span class="prop-unit">in below z=0</span>
        </div>
        <p class="prop-help">One value for every vertical post; transition stays on the green grade line.</p>
      </div>

      <div class="prop-field">
        <label class="prop-label" for="monkey-cross-beam">Cross beams (horizontal)</label>
        <select id="monkey-cross-beam" class="prop-select" data-monkey-beam="${parentId}">
          ${beamOptions}
        </select>
        <p class="prop-help">Runs along X between posts; rung length updates when size changes.</p>
      </div>

      <div class="prop-row-3">
        <div class="prop-field prop-field-tight">
          <label class="prop-label" for="prop-rungCount">Rung count</label>
          <input id="prop-rungCount" class="prop-input" type="number" min="1" step="1" value="${c.rungCount}" data-prop="rungCount" data-monkey-parent="${parentId}" />
        </div>
        ${numField("Spacing", "rungSpacing", c.rungSpacing, false, "in on center", `data-monkey-parent="${parentId}"`)}
        ${numField("Start X", "rungStartX", c.rungStartX, false, "from left post", `data-monkey-parent="${parentId}"`)}
      </div>
    </div>
    <p class="props-hint">Drag group to move · Explode to edit parts separately</p>
  `;

  wireMonkeyBarsControls(body, parentId);
  wireMonkeyGroupBuryControls(body, parentId);
}

/**
 * @param {HTMLElement} body
 * @param {string} parentId
 */
function wireMonkeyBarsControls(body, parentId) {
  body.querySelectorAll("[data-monkey-parent]").forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    const key = el.getAttribute("data-prop");
    if (!key) return;

    const apply = () => {
      pushUndoSnapshot();
      const num = Number(el.value);
      if (Number.isNaN(num)) return;
      updateMonkeyBarsConfig(parentId, { [key]: num });
      renderAllViews();
      updatePropertiesPanel();
    };

    el.addEventListener("change", apply);
  });

  const beamSelect = body.querySelector(`[data-monkey-beam="${parentId}"]`);
  beamSelect?.addEventListener("change", () => {
    if (!(beamSelect instanceof HTMLSelectElement)) return;
    pushUndoSnapshot();
    updateMonkeyBarsConfig(parentId, {
      crossBeamSourceId: beamSelect.value,
    });
    renderAllViews();
    updatePropertiesPanel();
  });
}

/**
 * @param {HTMLElement} body
 * @param {string} parentId
 */
function wireMonkeyGroupBuryControls(body, parentId) {
  const preset = body.querySelector(`[data-monkey-bury="${parentId}"]`);
  const custom = body.querySelector(`[data-monkey-bury-custom="${parentId}"]`);

  preset?.addEventListener("change", () => {
    if (!(preset instanceof HTMLSelectElement)) return;
    if (preset.value === "custom") {
      custom?.focus();
      custom?.select();
      return;
    }
    pushUndoSnapshot();
    applyGroupPostBuryDepth(parentId, Number(preset.value));
    renderAllViews();
    updatePropertiesPanel();
  });

  custom?.addEventListener("change", () => {
    if (!(custom instanceof HTMLInputElement)) return;
    pushUndoSnapshot();
    applyGroupPostBuryDepth(parentId, Number(custom.value));
    renderAllViews();
    updatePropertiesPanel();
  });
}

/**
 * @param {string} label
 * @param {string} key
 * @param {number} value
 * @param {boolean} [disabled]
 * @param {string} [title]
 */
function numField(label, key, value, disabled = false, title = "", extraAttrs = "") {
  return `
    <div class="prop-field prop-field-tight">
      <label class="prop-label" for="prop-${key}">${label}</label>
      <input
        id="prop-${key}"
        class="prop-input"
        type="number"
        step="1"
        min="0"
        value="${value}"
        data-prop="${key}"
        ${disabled ? "disabled" : ""}
        ${title ? `title="${escapeAttr(title)}"` : ""}
        ${extraAttrs}
      />
    </div>
  `;
}

/**
 * @param {HTMLElement} body
 * @param {string} objectId
 */
function wirePropertiesForm(body, objectId) {
  body.querySelectorAll("[data-prop]").forEach((el) => {
    const key = el.getAttribute("data-prop");
    if (!key) return;

    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.addEventListener("change", () => {
        pushUndoSnapshot();
        applyProp(objectId, { locked: el.checked }, { skipUndo: true });
      });
      return;
    }

    const apply = () => {
      const raw = el.value;
      if (key === "name") {
        applyProp(objectId, { name: raw });
        return;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      applyProp(objectId, { [key]: num }, { skipUndo: true });
    };

    el.addEventListener("change", apply);
    if (el instanceof HTMLInputElement && el.type === "number") {
      el.addEventListener("focus", () => {
        pushUndoSnapshot();
      });
      el.addEventListener("input", () => {
        const num = Number(el.value);
        if (Number.isNaN(num)) return;
        const grid = getState().project.placementGrid;
        const patch =
          key === "rotationZ"
            ? { rotationZ: num }
            : { [key]: Math.max(0, snap(num, grid)) };
        updatePlacedObject(objectId, patch);
        renderAllViews();
        const span = getVerticalSpan(getObjectById(objectId));
        const spanEl = body.querySelector(".props-z-span");
        if (spanEl && span) {
          spanEl.textContent = `${fmt(span.bottom)}" – ${fmt(span.top)}"`;
        }
      });
    }
  });

  wireBuryControls(body, objectId);
}

/**
 * @param {string} objectId
 * @param {Partial<import("./state.js").PlacedObject>} patch
 * @param {{ skipUndo?: boolean }} [opts]
 */
function applyProp(objectId, patch, opts = {}) {
  if (!opts.skipUndo) {
    pushUndoSnapshot();
  }
  const grid = getState().project.placementGrid;
  const normalized = { ...patch };

  for (const key of ["x", "y", "z", "width", "depth", "height", "buryDepth"]) {
    if (key in normalized && typeof normalized[key] === "number") {
      normalized[key] = snap(Math.max(0, normalized[key]), grid);
    }
  }

  updatePlacedObject(objectId, normalized);
  renderAllViews();
  updatePropertiesPanel();
}

function buildBuryPresetOptions(bury, selectedValue) {
  const options = BURY_PRESETS.map((inches) => {
    const label = inches === 0 ? 'None (0")' : `${inches}"`;
    const selected = selectedValue === String(inches) ? " selected" : "";
    return `<option value="${inches}"${selected}>${label}</option>`;
  });
  const customSelected = selectedValue === "custom" ? " selected" : "";
  const customLabel =
    selectedValue === "custom" ? `Custom (${fmt(bury)}")` : "Custom…";
  options.push(
    `<option value="custom"${customSelected}>${customLabel}</option>`,
  );
  return options.join("");
}

function wireBuryControls(body, objectId) {
  const preset = body.querySelector('[data-action="bury-preset"]');
  const custom = body.querySelector('[data-action="bury-custom"]');

  preset?.addEventListener("change", () => {
    if (preset.value === "custom") {
      custom?.focus();
      custom?.select();
      return;
    }
    applyProp(objectId, { buryDepth: Number(preset.value) });
  });

  custom?.addEventListener("focus", () => {
    pushUndoSnapshot();
  });

  custom?.addEventListener("change", () => {
    applyProp(objectId, { buryDepth: Number(custom.value) }, { skipUndo: true });
  });
}

function fmt(n) {
  return Number(n).toFixed(1).replace(/\.0$/, "");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
