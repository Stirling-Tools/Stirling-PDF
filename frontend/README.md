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

## Layout

`frontend/` is a workspace containing one or more apps. Today it holds the
PDF editor under `frontend/editor/`; new apps (the developer portal, etc.)
will sit alongside it as siblings. Shared tooling — `package.json`, `node_modules`,
`.storybook/`, ESLint, Prettier — lives at `frontend/` so every app installs
once and lints with the same config.

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

For local login testing, use the login-enabled variant:

```bash
task desktop:dev:login
```

That task reuses the same desktop launcher, but it keeps the backend cache and enables the login flow through the desktop taskfile defaults.

You can override the desktop task defaults inline:

- `JLINK_REUSE_CACHE=false` - force a clean backend JAR/JRE rebuild before launch
- `DISABLE_ADDITIONAL_FEATURES=false` - keep the full backend feature set for the bundled desktop run
- `SECURITY_ENABLELOGIN=true` - enable the normal login flow in desktop mode

Example:

```bash
task desktop:dev:login JLINK_REUSE_CACHE=false DISABLE_ADDITIONAL_FEATURES=false SECURITY_ENABLELOGIN=true
```

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

`task desktop:jlink` verifies the bundled runtime after it is built. If the
runtime release file is missing or too old, the verification script will
rebuild `desktop:jlink:runtime` automatically and re-check the version.

### Clean

```bash
task desktop:clean
```

Removes all desktop build artifacts including JLink runtime, bundled JARs, Cargo build, and dist/build directories.
