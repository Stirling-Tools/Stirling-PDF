# Frontend

All frontend commands are run from the repository root using [Task](https://taskfile.dev/):

- `task frontend:dev` — start Vite dev server (localhost:5173)
- `task frontend:build` — production build
- `task frontend:test` — run tests
- `task frontend:test:watch` — run tests in watch mode
- `task frontend:lint` — run linting
- `task frontend:typecheck` — run TypeScript type checking
- `task frontend:check` — run typecheck + lint + test
- `task frontend:install` — install npm dependencies

For desktop app development, see the [Tauri](#tauri) section below.

## Layout

`frontend/` is a workspace containing one or more apps. Today it holds the
PDF editor under `frontend/editor/`; new apps (the developer portal, etc.)
will sit alongside it as siblings. Shared tooling — `package.json`, `node_modules`,
`.storybook/`, oxlint, oxfmt — lives at `frontend/` so every app installs
once and lints with the same config.

## Local `@embedpdf` patches

`@embedpdf/engines` and the `@embedpdf` plugins are pinned and patched locally
while upstream prepares 3.0. `scripts/ensure-embedpdf-patches.mjs` applies the
patches from `postinstall`, so a normal install leaves `node_modules` patched.
The Vite build runs the same script first, so an install that skipped lifecycle
scripts (`npm ci --ignore-scripts`, packagers) patches or fails loudly instead of
shipping an unpatched engine. `task frontend:check` (and
`npm run check:embedpdf-patch`) verifies that every patched anchor is present;
the scripts are version-anchored and fail loudly on a version bump instead of
silently skipping a patch.

What the patches change:

- **Engine, worker handoff**: accept a precompiled `WebAssembly.Module` from the
  main thread instead of re-fetching and recompiling `pdfium.wasm`, transfer
  whole-buffer render results instead of copying them, and revoke the worker
  blob URLs the package leaks.
- **Engine, worker memory**: one pooled bitmap buffer per worker for page
  renders (`__stirlingScratchStats` on the worker global reports
  renders/allocs/reuses/bytes), and documents open through `FPDF_FILEACCESS`
  (`FPDF_LoadCustomDocument`) so PDFium reads 64 KB blocks from the cloned
  `ArrayBuffer` instead of copying the file into the WASM heap
  (`__stirlingWorkerHeapBytes()` reports the worker heap and
  `__stirlingWorkerDocBytes` the document bytes the worker materialized, which
  is 0 while it streams a Blob).
- **Plugins**: batched interaction-manager dispatch and cancellation of stale
  tile renders.

The patch scripts keep their patterns as literal `\n`-escaped anchors because
the worker source lives inside an escaped string in the bundle; every anchor is
asserted before a replacement is applied.

## Environment Variables

The editor's environment variables live in committed `.env` files at
`frontend/editor/`:

- `.env` — used by all builds (core, proprietary, and as the base for desktop/SaaS)
- `.env.desktop` — additional vars loaded in desktop (Tauri) mode
- `.env.saas` — additional vars loaded in SaaS mode

These files contain non-secret defaults and are checked into Git, so most dev work needs no further setup.

To override values locally (API keys, machine-specific settings), create an uncommitted sibling `editor/.env.local` / `editor/.env.desktop.local` / `editor/.env.saas.local`. Vite automatically layers these on top of the committed files.

## Docker Setup

For Docker deployments and configuration, see the [Docker README](../docker/README.md).

## Tauri

All desktop tasks are available via [Task](https://taskfile.dev). From the root of the repo:

### Dev

```bash
task desktop:dev
```

This ensures the JLink runtime and backend JAR exist (skipping if already built), then starts Tauri in dev mode.

### Build

```bash
task desktop:build
```

This does a full clean rebuild of the backend JAR and JLink runtime, then builds the Tauri app for production.

Platform-specific dev builds are also available:

```bash
task desktop:build:dev           # No bundling
task desktop:build:dev:mac       # macOS .app bundle
task desktop:build:dev:windows   # Windows NSIS installer
task desktop:build:dev:linux     # Linux AppImage
```

### JLink Tasks

You can also run JLink steps individually:

```bash
task desktop:jlink          # Build JAR + create JLink runtime
task desktop:jlink:jar      # Build backend JAR only
task desktop:jlink:runtime  # Create JLink custom JRE only
task desktop:jlink:clean    # Remove JLink artifacts
```

### Clean

```bash
task desktop:clean
```

Removes all desktop build artifacts including JLink runtime, bundled JARs, Cargo build, and dist/build directories.
