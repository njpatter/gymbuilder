# Backyard Ninja Gym Planner — Implementation Plan

## 1. Project Goal

Create a browser-based DIY backyard ninja gym planner using plain HTML, CSS, and JavaScript. The app will use Konva.js for 2D interactive layout views.

The planner should allow users to place, move, edit, group, save, and reuse individual parts and larger subsystems such as monkey bars, climbing stations, posts, crossbars, and platforms.

The initial version will focus on synchronized 2D placement views. A future version may add a 3D preview using Three.js.

---

## 2. Core Design Philosophy

The app should be:

* Simple to run locally, no server needed
* No database
* No React or frontend framework
* Data-driven
* Usable for rough planning, layout, spacing, and subsystem reuse
* Easy to extend with new part types and templates

All project data should be stored in a single JavaScript object and saved to `localStorage` or exported as JSON.

---

## 3. Technology Stack

### Required

* HTML
* CSS
* JavaScript
* Konva.js

### Optional Later

* Three.js for 3D preview
* jsPDF or browser print for PDF export
* File import/export using JSON

---

## 4. Main User Interface

The screen should be divided into four main panels:

```text
+----------------------+----------------------+
| Top View: X-Y        | Front View: X-Z      |
| yard placement       | elevation placement  |
+----------------------+----------------------+
| Side View: Y-Z       | 3D View              |
| depth/elevation      | future preview       |
+----------------------+----------------------+
```

Additional UI areas:

```text
+------------------------------------------------+
| Toolbar: select, add, group, save, export      |
+----------+---------------------------+---------+
| Library  | Four-panel workspace      | Props   |
| Sidebar  |                           | Sidebar |
+----------+---------------------------+---------+
```

---

## 5. Coordinate System and Views

The planner uses a single shared 3D coordinate system.

### Global Axes

* `x`: left to right; **+X** points right
* `y`: front to back; **+Y** points toward the back of the yard
* `z`: vertical; **+Z** points up

### Origin and Ground

* World origin **`(0, 0, 0)`** is the **lower-left** corner of the plan at **grade** (ground level).
* **Ground is `z = 0`.** Positive `z` is above grade.
* Objects use the **same placement origin** everywhere: the **lower-left-bottom** corner of the object’s axis-aligned bounds (before applying `rotationZ`).
* Objects may be placed **anywhere** in world space; the yard size is a **guide only** (no clipping or placement restrictions).
* Each placed object may set **`buryDepth`** (inches below grade, default `0`). Used mainly for posts: the part is drawn and dimensioned as extending from `z - buryDepth` through `z + height` along the vertical extent (see §9).
* A **ground plane** at `z = 0` should be drawn in **front** and **side** views (and optionally referenced in the 3D panel later) so grade is obvious when posts are buried.

```text
        +Y (back)
         ^
         |
         +----> +X (right)
        /
       /
      +Z (up, out of page in top view)

  z=0  ~ ~ ~ ~ ~ ~ ~ ~  grade (ground plane in front/side views)
       |
       |  buryDepth (optional, below grade)
```

### Orthographic 2D Views

| View  | Horizontal Axis | Vertical Axis | Purpose                        |
| ----- | --------------- | ------------- | ------------------------------ |
| Top   | X               | Y             | Backyard footprint and spacing |
| Front | X               | Z             | Width and height layout        |
| Side  | Y               | Z             | Depth and height layout        |

Each view edits only the two visible axes.

Dragging an object in:

* Top view updates `x` and `y`
* Front view updates `x` and `z`
* Side view updates `y` and `z`

The hidden coordinate is preserved.

---

## 6. Suggested File Structure

```text
gymbuilder/
│
├── index.html
├── styles.css
├── app.js              # entry; type="module"
│
├── data/
│   ├── defaultParts.js
│   └── defaultSubsystems.js
│
├── src/
│   ├── state.js
│   ├── geometry.js
│   ├── rendering.js
│   ├── interactions.js
│   ├── storage.js
│   ├── templates.js
│   └── ui.js
│
└── README.md
```

### Runtime conventions

* **ES modules** in the browser (`<script type="module" src="app.js">`); `src/` and `data/` files use `import` / `export`.
* **Konva.js** loaded from a CDN in `index.html` (no bundler required for MVP).
* **IDs:** `crypto.randomUUID()` for new objects and groups; regenerate IDs on paste and import.
* **Visuals (MVP):** axis-aligned **bounding boxes** per view with **`rotationZ` applied** in projection—usability and layout accuracy over realistic part shapes. Type-specific icons can come later.

---

## 7. Core Data Model

### Project State

```js
const appState = {
  project: {
    name: "Untitled Ninja Gym",
    units: "in",
    placementGrid: 1,       // snap increment in inches; user-configurable (min 1")
    yard: {
      width: 360,
      depth: 480
    },
    dimensionOrigin: {      // for export / dimension strings; user-set before export
      x: 0,
      y: 0,
      z: 0
    },
    objects: [],
    templates: []           // built-in + user subsystems; see §10
  },

  selectedIds: [],
  activeView: "top",
  mode: "select"
};
```

`dimensionOrigin` defaults to world `(0, 0, 0)`. When preparing export, the user picks or edits a **reference point**; all exported dimensions are relative to that point. Placement and editing always use world coordinates.

---

## 8. Primitive Part Model

Primitive parts are reusable components such as posts, bars, platforms, panels, ropes, rings, or walls.

```js
const part = {
  id: "post_4x4_8ft",
  kind: "part",
  type: "post",
  name: "4x4 Post, 8 ft",

  dimensions: {
    width: 3.5,
    depth: 3.5,
    height: 96
  },

  material: "wood",
  costEstimate: 18
};
```

Catalog parts use `dimensions: { width, depth, height }`. The **longest catalog dimension** is treated as the part’s primary length and aligns with **+X** when the part is first placed (see §14 Placement).

`connectionPoints` are out of scope for MVP; add later for snap-to-post behavior.

---

## 9. Placed Object Model

When a part is placed into the project, create a separate placed object.

```js
const placedObject = {
  id: "obj_001",
  kind: "part",
  sourceId: "post_4x4_8ft",
  name: "4x4 Post, 8 ft",

  x: 120,
  y: 84,
  z: 0,

  width: 3.5,
  depth: 3.5,
  height: 96,

  rotationZ: 0,           // degrees about +Z; integrated in MVP rendering and drag
  buryDepth: 0,           // inches below z=0 (posts); 0 = none below grade
  locked: false,
  parentId: null          // shared group id when placed from a subsystem; see §10
};
```

**`height`** is the extent **above grade only** (from the placement origin upward along +Z).

**`buryDepth`** is how far the object extends **below grade** (`z = 0`), tracked separately (default `0`).

**`z`** is the world elevation of the placement origin (lower-left-bottom at grade).

Vertical span for drawing and hit-testing: **`z - buryDepth`** through **`z + height`**. Total physical height along Z = **`height + buryDepth`**.

---

## 10. Subsystem Model

Subsystems are reusable groups of parts.

Example: a monkey bar bay.

```js
const subsystem = {
  id: "monkey_bars_basic",
  kind: "subsystem",
  source: "builtin",
  name: "Basic Monkey Bars",

  origin: {
    x: 0,
    y: 0,
    z: 0
  },

  parts: [
    {
      sourceId: "post_4x4_8ft",
      x: 0,
      y: 0,
      z: 0
    },
    {
      sourceId: "post_4x4_8ft",
      x: 96,
      y: 0,
      z: 0
    },
    {
      sourceId: "bar_48in",
      x: 48,
      y: 0,
      z: 90
    }
  ]
};
```

### MVP subsystem behavior

* Placing a subsystem **expands** it into individual placed objects that share a new **`parentId`** (group id).
* **Selecting any member** and dragging moves **all objects with the same `parentId`**.
* **Explode** clears `parentId` on the selected group’s members so they move independently.
* Built-in and user-saved templates share the **same schema**; distinguish with `source: "builtin" | "user"` on the template record.

Later: edit subsystem in place, lock/unlock group without exploding, subsystem-level selection in the library.

---

## 11. View Projection and Rotation

Each view uses the same render pipeline with different axis mappings. **Rotation about Z is part of MVP:** project the object’s footprint (width × depth in the XY plane), apply `rotationZ`, then map the rotated bounds into each 2D view.

Each view should use the same render function but different axis mappings.

```js
const viewAxes = {
  top: {
    h: "x",
    v: "y",
    hSize: "width",
    vSize: "depth"
  },

  front: {
    h: "x",
    v: "z",
    hSize: "width",
    vSize: "height"
  },

  side: {
    h: "y",
    v: "z",
    hSize: "depth",
    vSize: "height"
  }
};
```

Projection (conceptual; implement in `geometry.js`):

```js
function projectObjectToView(object, viewName) {
  const axes = viewAxes[viewName];
  const footprint = getRotatedFootprint(object); // width/depth, rotationZ
  const sizes = getViewSizes(object, viewName, footprint); // swap projected w/h per view

  return {
    x: object[axes.h],
    y: object[axes.v],
    width: sizes.width,
    height: sizes.height,
    rotation: viewUsesPlanRotation(viewName) ? object.rotationZ : 0
  };
}
```

Front/side views use projected vertical span from `z - buryDepth` through `z + height`.

Dragging function:

```js
function updateObjectFromDrag(object, viewName, canvasX, canvasY) {
  const axes = viewAxes[viewName];

  object[axes.h] = canvasToWorld(canvasX);
  object[axes.h] = snap(canvasToWorld(canvasX), project.placementGrid);
  object[axes.v] = snap(canvasToWorld(canvasY), project.placementGrid);
}
```

### Canvas scale (MVP)

* Fixed **pixels per inch** per stage (e.g. 2 px/in), same across top/front/side.
* **Pan** and **zoom** per view are nice-to-have after the core drag loop; not required for Milestone 3.
* **Spawn position:** new parts appear at the **center of the active 2D view** in world coordinates for that view’s visible axes; use the object’s current `z` (or `0`) and preserve other axes from defaults.

---

## 12. Rendering Strategy

Each Konva stage should be responsible only for displaying the shared model.

Recommended stages:

```js
const stages = {
  top: new Konva.Stage(...),
  front: new Konva.Stage(...),
  side: new Konva.Stage(...)
};
```

Each stage should have:

* Grid layer (spacing = `project.placementGrid` in world inches)
* Ground layer (front/side: line or band at **z = 0**)
* Object layer
* Selection layer
* Label layer (optional in early milestones)

```js
const layers = {
  top: {
    grid: new Konva.Layer(),
    objects: new Konva.Layer(),
    selection: new Konva.Layer()
  }
};
```

Render all views after any state change:

```js
function renderAllViews() {
  renderView("top");
  renderView("front");
  renderView("side");
  render3DPlaceholder();
  updatePropertiesPanel();
}
```

---

## 13. MVP Features

### Phase 1: Basic Layout

* Create four-panel HTML layout
* Add Konva stages for top, front, and side views
* Add placeholder 3D panel
* Add grid to each 2D view (`placementGrid`, default 1")
* Draw yard footprint as a **guide** in top view (no clipping)
* Add axis labels and ground line at z = 0 in front/side

### Phase 2: Object Placement

* Add library sidebar
* Add 4x4 post
* Add 6x6 post
* Add metal crossbar
* Add platform
* Click a part to place it at the **active view center** with longest dimension along **+X** and `rotationZ = 0`
* Render it in all three views (rotated bounds)

### Phase 3: Selection and Movement

* Select object in any view
* Highlight selected object in all views
* Drag object in any view
* Update shared 3D coordinates
* Re-render all views immediately
* Delete selected object
* Copy/paste selected object (paste offsets by one `placementGrid` step; new IDs)

### Phase 4: Properties Panel

Shown only when **exactly one** object is selected. **Multi-select: show nothing** in the panel.

Edit:

* Name
* X, Y, Z
* Width, Depth, Height
* Rotation (`rotationZ`)
* Bury depth (`buryDepth`)
* Locked status

Changing a property updates all views.

### Phase 5: Subsystems

* Add built-in monkey bar subsystem (and others per §16)
* Place subsystem → expanded objects with shared `parentId`
* Drag any member → moves all with same `parentId`
* **Explode** → clears `parentId` on those objects

### Phase 6: Custom Templates

* Multi-select objects
* Save selected objects as custom subsystem
* Name the subsystem
* Store user templates in `project.templates` with `source: "user"`
* Show in library alongside built-ins
* Place saved templates like built-in subsystems

### Phase 7: Persistence

* Save project to `localStorage`
* Load project from `localStorage`
* Export project as `.json` (include `schemaVersion: 1`)
* Import project from `.json` (validate; regenerate IDs if needed)
* UI to set **`dimensionOrigin`** before export (world pick or numeric entry)

---

## 14. Interaction Behavior

### Selecting

Clicking an object selects it.

Shift-click should add or remove from selection.

Clicking empty space clears selection.

### Dragging

Dragging updates the visible axes for that view.

Example:

```js
// Top view
x changes
y changes
z stays unchanged
```

### Snapping

All placement and drag coordinates snap to **`project.placementGrid`** (default **1"**; user can increase, not below 1").

```js
function snap(value, placementGrid) {
  return Math.round(value / placementGrid) * placementGrid;
}
```

### Placement defaults

* **Spawn:** center of the **active** top/front/side view in world space.
* **Orientation:** longest catalog dimension along **+X**; `rotationZ = 0` until the user changes it.
* **Origin:** lower-left-bottom of bounds at the spawn `(x, y, z)`; `z` defaults to `0` unless the view supplies a sensible default for the hidden axis.

### Group movement (MVP)

If the selected object has a **`parentId`**, dragging it moves **every object** with that same `parentId`. Objects without `parentId` move alone.

### Multi-select

Shift-click adds/removes from `selectedIds`. Properties panel stays **empty** unless exactly one object is selected. Multi-select is used for save-as-template and bulk delete, not bulk property edit in MVP.

---

## 15. Initial Default Part Library

Start with these parts:

```js
const defaultParts = [
  {
    id: "post_4x4_8ft",
    kind: "part",
    type: "post",
    name: "4x4 Post, 8 ft",
    dimensions: { width: 3.5, depth: 3.5, height: 96 },
    material: "wood"
  },
  {
    id: "post_6x6_10ft",
    kind: "part",
    type: "post",
    name: "6x6 Post, 10 ft",
    dimensions: { width: 5.5, depth: 5.5, height: 120 },
    material: "wood"
  },
  {
    id: "bar_48in",
    kind: "part",
    type: "bar",
    name: "Metal Bar, 48 in",
    dimensions: { width: 48, depth: 1.25, height: 1.25 },
    material: "steel"
  },
  {
    id: "platform_24x24",
    kind: "part",
    type: "platform",
    name: "Platform, 24 x 24 in",
    dimensions: { width: 24, depth: 24, height: 3 },
    material: "wood"
  }
];
```

On place, copy `dimensions` onto the placed object as `width`, `depth`, `height`. Default **`buryDepth`** for `type: "post"` can be offered in the properties panel (e.g. 24") but starts at `0`.

---

## 16. Initial Built-In Subsystems

Start with:

1. Basic monkey bars
2. Single pull-up station
3. Two-post crossbar
4. Platform tower
5. Climbing wall panel

MVP example:

```js
const defaultSubsystems = [
  {
    id: "sub_monkey_bars_basic",
    kind: "subsystem",
    source: "builtin",
    name: "Basic Monkey Bars",
    width: 96,
    depth: 48,
    height: 96,
    parts: [
      { sourceId: "post_4x4_8ft", x: 0, y: 0, z: 0 },
      { sourceId: "post_4x4_8ft", x: 96, y: 0, z: 0 },
      { sourceId: "post_4x4_8ft", x: 0, y: 48, z: 0 },
      { sourceId: "post_4x4_8ft", x: 96, y: 48, z: 0 },
      { sourceId: "bar_48in", x: 12, y: 24, z: 90 },
      { sourceId: "bar_48in", x: 30, y: 24, z: 90 },
      { sourceId: "bar_48in", x: 48, y: 24, z: 90 },
      { sourceId: "bar_48in", x: 66, y: 24, z: 90 },
      { sourceId: "bar_48in", x: 84, y: 24, z: 90 }
    ]
  }
];
```

---

## 17. 3D View Placeholder

For now, the 3D panel should display:

```text
3D View Coming Soon
The current 2D model will later be rendered here using Three.js.
```

Later this panel can use the same project data to create a 3D scene.

---

## 18. Development Milestones

### Milestone 1

A page loads with four panels and three visible Konva grids.

### Milestone 2

A default 4x4 post appears correctly in top, front, and side views.

### Milestone 3

The user can drag the post in each view (1" snap) and see all other views update; rotation and bury depth render correctly in all views.

### Milestone 4

The user can add parts from a sidebar.

### Milestone 5

The user can edit selected object properties.

### Milestone 6

The user can place a built-in subsystem.

### Milestone 7

The user can select multiple objects and save them as a reusable custom subsystem.

### Milestone 8

The user can save, load, import, and export projects.

---

## 19. Future Feature Ideas

* Three.js 3D preview
* Safety clearance zones
* Fall zone visualization
* Bill of materials
* Estimated cost
* Post-hole location list
* Export to image
* Export to PDF
* Print-friendly plans
* Simple structural warning labels
* Child height/age configuration
* Obstacle spacing suggestions
* Unit toggle between inches and feet
* Shareable project files
* Undo/redo

---

## 20. Non-goals (MVP)

* Structural engineering sign-off or load calculations
* Permit-ready drawings
* Photorealistic 3D or custom part meshes
* Server, accounts, or cloud sync

---

## 21. Implementation Priority

The first coding target should be:

1. Create the four-panel layout.
2. Add Konva to the top, front, and side panels; draw **ground at z = 0** in front/side.
3. Create one shared object in state (include `rotationZ`, `buryDepth`).
4. Render that object in all three views with rotation-aware projection.
5. Drag it in one view (snapped to `placementGrid`) and update all three views.

**Acceptance check:** drag +6" in top view → `x`/`y` change, `z` unchanged; same object highlights in all views; front/side show bury below grade when `buryDepth > 0`.

Once that loop works, build library placement, properties, subsystems, templates, and persistence in phase order (§13).
