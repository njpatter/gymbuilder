import { defaultParts } from "../data/defaultParts.js";
import { defaultSubsystems } from "../data/defaultSubsystems.js";
import { renderAllViews } from "./rendering.js";
import { placePart } from "./placement.js";
import { getState, setSelection } from "./state.js";
import { deleteUserTemplate, placeSubsystemById } from "./templates.js";
import { updatePropertiesPanel } from "./ui.js";

/** @type {HTMLElement | null} */
let libraryRoot = null;

export function initLibrary() {
  libraryRoot = document.querySelector(".sidebar-library");
  if (!libraryRoot) return;
  renderLibrary();
  libraryRoot.addEventListener("click", onLibraryClick);
}

export function refreshLibrary() {
  renderLibrary();
}

function renderLibrary() {
  const root = libraryRoot ?? document.querySelector(".sidebar-library");
  if (!root) return;

  const userTemplates = getState().project.templates.filter(
    (t) => t.source === "user",
  );

  root.innerHTML = `
    <h2>Library</h2>
    <p class="library-hint">Click to place at the center of the active view.</p>
    <section class="library-section">
      <h3 class="library-heading">Parts</h3>
      <ul class="library-list" id="library-parts"></ul>
    </section>
    <section class="library-section">
      <h3 class="library-heading">Subsystems</h3>
      <ul class="library-list" id="library-subsystems"></ul>
    </section>
    <section class="library-section" id="library-custom-section" ${
      userTemplates.length ? "" : 'hidden'
    }>
      <h3 class="library-heading">My templates</h3>
      <ul class="library-list" id="library-custom"></ul>
    </section>
  `;

  const partsEl = root.querySelector("#library-parts");
  const subEl = root.querySelector("#library-subsystems");
  const customEl = root.querySelector("#library-custom");

  for (const part of defaultParts) {
    partsEl?.appendChild(createLibraryButton(part.name, part.id, "part"));
  }

  for (const sub of defaultSubsystems) {
    subEl?.appendChild(createLibraryButton(sub.name, sub.id, "subsystem"));
  }

  for (const tmpl of userTemplates) {
    customEl?.appendChild(createCustomTemplateRow(tmpl.name, tmpl.id));
  }
}

/**
 * @param {MouseEvent} e
 */
function onLibraryClick(e) {
  const target = /** @type {HTMLElement} */ (e.target);

  const deleteBtn = target.closest("[data-delete-template]");
  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-template");
    if (id && confirm("Delete this saved template?")) {
      deleteUserTemplate(id);
      refreshLibrary();
      updatePropertiesPanel();
    }
    return;
  }

  const btn = target.closest("[data-library-id]");
  if (!btn) return;

  const id = btn.getAttribute("data-library-id");
  const kind = btn.getAttribute("data-library-kind");

  if (kind === "part") {
    const part = defaultParts.find((p) => p.id === id);
    if (!part) return;
    const placed = placePart(part);
    setSelection(placed.id);
  } else if (kind === "subsystem" || kind === "template") {
    placeSubsystemById(id);
  }

  renderAllViews();
  updatePropertiesPanel();
}

/**
 * @param {string} label
 * @param {string} id
 * @param {"part" | "subsystem"} kind
 */
function createLibraryButton(label, id, kind) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "library-btn";
  btn.textContent = label;
  btn.setAttribute("data-library-id", id);
  btn.setAttribute("data-library-kind", kind);
  li.appendChild(btn);
  return li;
}

/**
 * @param {string} label
 * @param {string} id
 */
function createCustomTemplateRow(label, id) {
  const li = document.createElement("li");
  li.className = "library-row-custom";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "library-btn library-btn-grow";
  btn.textContent = label;
  btn.setAttribute("data-library-id", id);
  btn.setAttribute("data-library-kind", "template");

  const del = document.createElement("button");
  del.type = "button";
  del.className = "library-btn-delete";
  del.title = "Delete template";
  del.textContent = "×";
  del.setAttribute("data-delete-template", id);

  li.appendChild(btn);
  li.appendChild(del);
  return li;
}
