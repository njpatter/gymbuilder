# Backyard Ninja Gym Planner

Browser-based DIY backyard ninja gym layout tool. Plain HTML, CSS, and JavaScript with [Konva.js](https://konvajs.org/) for 2D orthographic views.

See [PLAN.md](./PLAN.md) for the full implementation plan.

## Run locally

**You must use a local HTTP server** — opening `index.html` directly (`file://`) will not load modules or Konva.

### Dev server (recommended)

One-time install, then leave the server running in a terminal tab:

```bash
npm install   # includes Konva (CDN) + Three.js (local, for 3D preview)
npm run dev
```

Open **http://127.0.0.1:8080** in Cursor’s preview (Command Palette → **Simple Browser: Show**, paste the URL). The page **auto-refreshes when you save** files.

In Cursor/VS Code, a background task can start the server when you open the project folder (`Tasks: Run Task` → **Dev server (gymbuilder)**, or it may start automatically via `.vscode/tasks.json`). Use the same URL in the preview window and reload only when you want a manual refresh.

### One-off (no Node)

```bash
python3 -m http.server 8080
```

Open http://127.0.0.1:8080

## Status

- **Milestone 1:** Four-panel layout, Konva grids, yard guide, grade line, axis labels, 3D placeholder.
- **Milestone 2–3:** Place parts, select/drag with 1″ snap, copy/paste, delete.
- **Milestone 4:** Part library (posts, bar, platform).
- **Milestone 5:** Basic monkey bars subsystem, group drag, explode.
- **Properties:** Name, position, size, rotation, bury depth, lock.
- **Milestone 6–7:** Save selection as custom template; Save/Export/Import project JSON; auto-restore from browser storage.
- **Subsystems:** Monkey bars, pull-up station, extended dip bars, climbing wall.
- **Undo/redo:** Toolbar buttons and ⌘Z / ⌘⇧Z (Ctrl on Windows).
- **3D preview:** Three.js box model in the fourth panel (orbit + scroll).
