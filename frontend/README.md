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

The frontend requires environment variables to be set before running. `task frontend:dev` will create a `.env` file for you automatically on first run using the defaults from `config/.env.example` - for most development work this is all you need.

If you need to configure specific services (Google Drive, Supabase, Stripe, PostHog), edit your local `.env` file. The values in `config/.env.example` show what each variable does and provides sensible defaults where applicable.

For desktop (Tauri) development, `task desktop:dev` will additionally create a `.env.desktop` file from `config/.env.desktop.example`.

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

> [!NOTE]
>
> Desktop builds require additional environment variables. See [Environment Variables](#environment-variables)
> above - `task desktop:dev` will set these up automatically from `config/.env.desktop.example` on first run.
