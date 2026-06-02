import { defaultParts } from "../data/defaultParts.js";
import { getState, getVerticalSpan } from "./state.js";

/** @type {typeof import("three") | null} */
let THREE = null;

/** @type {import("three").WebGLRenderer | null} */
let renderer = null;

/** @type {import("three").PerspectiveCamera | null} */
let camera = null;

/** @type {import("three").Scene | null} */
let scene = null;

/** @type {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null} */
let controls = null;

/** @type {import("three").Group | null} */
let objectsGroup = null;

/** @type {HTMLElement | null} */
let container = null;

/** @type {ResizeObserver | null} */
let resizeObserver = null;

/**
 * @param {HTMLElement} mount
 */
export async function initPreview3d(mount) {
  const [threeModule, controlsModule] = await Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js"),
  ]);
  THREE = threeModule;
  const { OrbitControls } = controlsModule;

  container = mount;
  container.innerHTML = "";
  container.classList.remove("view-3d-placeholder");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e232b);

  const w = Math.max(container.clientWidth, 1);
  const h = Math.max(container.clientHeight, 1);

  camera = new THREE.PerspectiveCamera(50, w / h, 1, 20000);
  camera.position.set(420, 260, 520);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(180, 48, 240);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x9eb4ff, 0.25);
  fill.position.set(-200, 120, -300);
  scene.add(fill);

  objectsGroup = new THREE.Group();
  scene.add(objectsGroup);

  resizeObserver = new ResizeObserver(() => resizePreview3d());
  resizeObserver.observe(container);

  renderPreview3d();
  animate();
}

function resizePreview3d() {
  if (!container || !renderer || !camera) return;
  const w = Math.max(container.clientWidth, 1);
  const h = Math.max(container.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/**
 * @param {import("./state.js").PlacedObject} obj
 */
function colorForObject(obj) {
  const part = defaultParts.find((p) => p.id === obj.sourceId);
  if (part?.type === "bar") return 0x8899aa;
  if (part?.type === "panel") return 0x64748b;
  if (part?.material === "steel") return 0x8a9199;
  if (obj.partRole === "post") return 0xb8895a;
  return 0xc4956a;
}

export function renderPreview3d() {
  if (!THREE || !scene || !objectsGroup) return;

  for (const child of objectsGroup.children) {
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach((m) => m.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  }
  objectsGroup.clear();

  const project = getState().project;
  const { width: yardW, depth: yardD } = project.yard;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(yardW, 120), Math.max(yardD, 120)),
    new THREE.MeshStandardMaterial({
      color: 0x2a3340,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(yardW / 2, 0, yardD / 2);
  objectsGroup.add(ground);

  const yardLine = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(yardW, yardD)),
    new THREE.LineBasicMaterial({ color: 0xc9a227 }),
  );
  yardLine.rotation.x = -Math.PI / 2;
  yardLine.position.set(yardW / 2, 0.05, yardD / 2);
  objectsGroup.add(yardLine);

  const gradeMat = new THREE.LineBasicMaterial({ color: 0x6bcf7f });
  const gradeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(yardW, 0, 0),
  ]);
  objectsGroup.add(new THREE.Line(gradeGeo, gradeMat));

  for (const obj of project.objects) {
    const span = getVerticalSpan(obj);
    const totalHeight = Math.max(span.top - span.bottom, 0.5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(obj.width, 0.5),
        totalHeight,
        Math.max(obj.depth, 0.5),
      ),
      new THREE.MeshStandardMaterial({
        color: colorForObject(obj),
        roughness: 0.72,
        metalness: obj.partRole === "bar" ? 0.35 : 0.05,
      }),
    );

    const cx = obj.x + obj.width / 2;
    const cy = (span.bottom + span.top) / 2;
    const cz = obj.y + obj.depth / 2;
    mesh.position.set(cx, cy, cz);
    mesh.rotation.y = (-obj.rotationZ * Math.PI) / 180;

    if (obj.partRole === "panel") {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.85,
        metalness: 0.05,
      });
    }

    objectsGroup.add(mesh);
  }
}
