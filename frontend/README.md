# Frontend

All frontend commands are run from the repository root using [Task](https://taskfile.dev/):

- `task frontend:dev` — start Vite dev server (localhost:5173)
- `task frontend:build` — production build
- `task frontend:test` — run tests
- `task frontend:test:watch` — run tests in watch mode
- `task frontend:lint` — run ESLint + cycle detection
- `task frontend:typecheck` — run TypeScript type checking
- `task frontend:check` — run typecheck + lint + test
- `task frontend:install` — install npm dependencies

For desktop app development, see the [Tauri](#tauri) section below.

## Environment Variables

Environment variables live in committed `.env` files at the frontend root:

- `.env` — used by all builds (core, proprietary, and as the base for desktop/SaaS)
- `.env.desktop` — additional vars loaded in desktop (Tauri) mode
- `.env.saas` — additional vars loaded in SaaS mode

These files contain non-secret defaults and are checked into Git, so most dev work needs no further setup.

To override values locally (API keys, machine-specific settings), create an uncommitted sibling `.env.local` / `.env.desktop.local` / `.env.saas.local`. Vite automatically layers these on top of the committed files.

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
