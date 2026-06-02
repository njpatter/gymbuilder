import { refreshLibrary } from "./library.js";
import { renderAllViews } from "./rendering.js";
import { clearHistory } from "./history.js";
import { resetAllViewCameras } from "./viewCamera.js";
import {
  downloadProjectJson,
  projectDataToAppState,
  readLocalStorageProject,
  saveToLocalStorage,
  validateProjectData,
} from "./storage.js";
import { getState, setAppState } from "./state.js";
import { updatePropertiesPanel } from "./ui.js";

export function initProjectActions() {
  document.getElementById("btn-save")?.addEventListener("click", () => {
    saveToLocalStorage(getState());
    showStatus("Project saved to browser storage.");
  });

  document.getElementById("btn-export")?.addEventListener("click", () => {
    downloadProjectJson(getState());
    showStatus("Project exported as JSON.");
  });

  const importInput = /** @type {HTMLInputElement} */ (
    document.getElementById("import-file")
  );
  document.getElementById("btn-import")?.addEventListener("click", () => {
    importInput?.click();
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!validateProjectData(data)) {
        throw new Error("Unrecognized project file.");
      }
      setAppState(projectDataToAppState(data, { regenerateIds: true }));
      clearHistory();
      resetAllViewCameras();
      renderAllViews();
      refreshLibrary();
      updatePropertiesPanel();
      showStatus(`Imported “${file.name}”.`);
    } catch (err) {
      showStatus(err?.message ?? "Import failed.", true);
    }
    importInput.value = "";
  });

  document.getElementById("btn-new")?.addEventListener("click", () => {
    if (
      !confirm(
        "Start a new project? Unsaved changes in this browser tab will be lost.",
      )
    ) {
      return;
    }
    setAppState(projectDataToAppState({
      schemaVersion: 1,
      project: {
        name: "Untitled Ninja Gym",
        units: "in",
        placementGrid: 1,
        yard: { width: 360, depth: 480 },
        dimensionOrigin: { x: 0, y: 0, z: 0 },
        objects: [],
        templates: [],
        groups: {},
      },
      activeView: "top",
    }));
    clearHistory();
    resetAllViewCameras();
    renderAllViews();
    refreshLibrary();
    updatePropertiesPanel();
    showStatus("New project started.");
  });
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function showStatus(message, isError = false) {
  const el = document.getElementById("status-toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("status-toast-error", isError);
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

showStatus._timer = 0;

/**
 * @returns {boolean}
 */
export function tryRestoreFromLocalStorage() {
  const data = readLocalStorageProject();
  if (!data || !validateProjectData(data)) return false;
  setAppState(projectDataToAppState(data));
  return true;
}
