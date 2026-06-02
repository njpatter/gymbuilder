import { initInteractions } from "./src/interactions.js";
import { waitForViewLayout } from "./src/layout.js";
import { initProjectActions, tryRestoreFromLocalStorage } from "./src/projectActions.js";
import { initPreview3d } from "./src/preview3d.js";
import { initHistoryUi } from "./src/history.js";
import { initViewZoomControls } from "./src/viewCamera.js";
import { getStage, initRenderer, renderAllViews, resizeStages } from "./src/rendering.js";
import { getState } from "./src/state.js";
import { initLibrary, refreshLibrary } from "./src/library.js";
import { initTemplates } from "./src/templates.js";
import { getViewContainers, initUi, updatePropertiesPanel } from "./src/ui.js";

function showBootError(err) {
  const el = document.getElementById("boot-error");
  if (!el) return;
  el.hidden = false;
  el.textContent = `Failed to start: ${err?.message ?? err}. Use a local server (see README), not file://.`;
  console.error(err);
}

async function bootstrap() {
  if (!tryRestoreFromLocalStorage()) {
    getState();
  }
  initUi();

  const containers = getViewContainers();
  if (!containers.top || !containers.front || !containers.side) {
    throw new Error("Missing view containers");
  }

  await waitForViewLayout(containers);
  initRenderer(containers);
  initViewZoomControls({
    top: getStage("top"),
    front: getStage("front"),
    side: getStage("side"),
  });

  initLibrary();
  initInteractions();
  initTemplates();
  initProjectActions();
  refreshLibrary();

  initHistoryUi(() => {
    renderAllViews();
    updatePropertiesPanel();
  });

  const previewMount = document.getElementById("view-3d");
  if (previewMount) {
    initPreview3d(previewMount).catch((err) => {
      console.error("3D preview failed to load:", err);
      previewMount.classList.add("view-3d-placeholder");
      previewMount.innerHTML = `
        <p class="placeholder-title">3D preview unavailable</p>
        <p class="placeholder-body">Could not load Three.js. 2D views still work.</p>
      `;
    });
  }

  requestAnimationFrame(() => {
    resizeStages();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch(showBootError);
  });
} else {
  bootstrap().catch(showBootError);
}
