# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Taskfile (Recommended)

This project uses [Task](https://taskfile.dev/) as a unified command runner. All build, dev, test, lint, and docker commands can be run from the repo root via `task <command>`. Run `task --list` to see all available commands.

Task `desc:` fields should describe **what** the task does, not **how** it does it. Keep them generic and stable: don't reference implementation details like aliases, internal helpers, mode flags, or which other task delegates to which. The description is for users picking a command from `task --list`, not a changelog of refactors.

### Quick Reference
- `task install` — install all dependencies
- `task dev` — start backend + frontend concurrently
- `task dev:all` — start backend + frontend + engine concurrently
- `task build` — build all components
- `task test` — run all tests (backend + frontend + engine)
- `task lint` — run all linters
- `task format` — auto-fix formatting across all components
- `task check` — full quality gate (lint + typecheck + test)
- `task clean` — clean all build artifacts
- `task docker:build` — build standard Docker image
- `task docker:up` — start Docker compose stack

## Common Development Commands

### Build and Test
- **Build project**: `task build`
- **Run backend locally**: `task backend:dev`
- **Run all tests**: `task test` (or individually: `task backend:test`, `task frontend:test`, `task engine:test`)
- **Docker integration tests**: `./test.sh` (builds all Docker variants and runs comprehensive tests)
- **Code formatting**: `task format` (or `task backend:format` for Java only)
- **Full quality gate**: `task check` (runs lint + typecheck + test across all components)

After modifying any files in the project, you must run the relevant `task check` command that covers that area of the code. For example, when editing frontend files run `task frontend:check`; for Python engine files run `task engine:check`; for Java backend files run `task backend:check`.

### Docker Development
- **Build standard**: `task docker:build` (or `docker build -t stirling-pdf -f docker/embedded/Dockerfile .`)
- **Build fat version**: `task docker:build:fat`
- **Build ultra-lite**: `task docker:build:ultra-lite`
- **Start compose stack**: `task docker:up` (or `task docker:up:fat`, `task docker:up:ultra-lite`)
- **Stop compose stack**: `task docker:down`
- **View logs**: `task docker:logs`
- **Example compose files**: Located in `exampleYmlFiles/` directory

### Security Mode Development
Set `DOCKER_ENABLE_SECURITY=true` environment variable to enable security features during development. This is required for testing the full version locally.

### Python Development (AI Engine)

The engine is a Python reasoning service for Stirling: it plans and interprets work, but it does not own durable state, and it does not execute Stirling PDF operations directly. Keep the service narrow: typed contracts in, typed contracts out, with AI only where it adds reasoning value. The frontend calls the Python engine via Java as a proxy.

#### Python Commands
All engine commands run from the repo root using Task:
- `task engine:check` — run all checks (typecheck + lint + format-check + test)
- `task engine:fix` — auto-fix lint + formatting
- `task engine:install` — install Python dependencies via uv
- `task engine:dev` — start FastAPI with hot reload (localhost:5001)
- `task engine:test` — run pytest
- `task engine:lint` — run ruff linting
- `task engine:typecheck` — run pyright
- `task engine:format` — format code with ruff
- `task engine:tool-models` — generate `tool_models.py` from the Java OpenAPI spec

The project structure is defined in `engine/pyproject.toml`. Any new dependencies should be listed there, followed by running `task engine:install`.

#### Python Code Style
- Keep `task engine:check` passing.
- Use modern Python when it improves clarity.
- Prefer explicit names to cleverness.
- Avoid nested functions and nested classes unless the language construct requires them.
- Prefer composition to inheritance when combining concepts.
- Avoid speculative abstractions. Add a layer only when it removes real duplication or clarifies lifecycle.
- Add comments sparingly and only when they explain non-obvious intent.

#### Python Typing and Models
- Deserialize into Pydantic models as early as possible.
- Serialize from Pydantic models as late as possible.
- Do not pass raw `dict[str, Any]` or `dict[str, object]` across important boundaries when a typed model can exist instead.
- Avoid `Any` wherever possible.
- Avoid `cast()` wherever possible (reconsider the structure first).
- All shared models should subclass `stirling.models.ApiModel` so the service behaves consistently.
- Do not use string literals for any type annotations, including `cast()`.

#### Python Configuration
- Keep application-owned configuration in `stirling.config`.
- Only add `STIRLING_*` environment variables that the engine itself truly owns.
- Do not mirror third-party provider environment variables unless the engine is actually interpreting them.
- Let `pydantic-ai` own provider authentication configuration when possible.

#### Python Architecture

**Package roles:**
- `stirling.contracts`: request/response models and shared typed workflow contracts. If a shape crosses a module or service boundary, it probably belongs here.
- `stirling.models`: shared model primitives and generated tool models.
- `stirling.agents`: reasoning modules for individual capabilities.
- `stirling.api`: HTTP layer, dependency access, and app startup wiring.
- `stirling.services`: shared runtime and non-AI infrastructure.
- `stirling.config`: application-owned settings.

**Source of truth:**
- `stirling.models.tool_models` is the source of truth for operation IDs and parameter models.
- Do not duplicate operation lists if they can be derived from `tool_models.OPERATIONS`.
- Do not hand-maintain parallel parameter schemas when the generated tool models already define them.
- If a tool ID must match a parameter model, validate that relationship explicitly in code.

**Boundaries:**
- Keep the API layer thin. Route modules should bind requests, resolve dependencies, and call agents or services. They should not contain business logic.
- Keep agents focused on one reasoning domain. They should not own FastAPI routing, persistence, or execution of Stirling operations.
- Build long-lived runtime objects centrally at startup when possible rather than reconstructing heavy AI objects per request.
- If an agent delegates to another agent, the delegated agent should remain the source of truth for its own domain output.

#### Python AI Usage
- The system must work with any AI, including self-hosted models. We require that the models support structured outputs, but should minimise model-specific code beyond that.
- Use AI for reasoning-heavy outputs, not deterministic glue.
- Do not ask the model to invent data that Python can derive safely.
- Do not fabricate fallback user-facing copy in code to hide incomplete model output.
- AI output schemas should be impossible to instantiate incorrectly.
  - Do not require the model to keep separate structures in sync. For example, instead of generating two lists which must be the same length, generate one list of a model containing the same data.
  - Prefer Python to derive deterministic follow-up structure from a valid AI result.
- Use `NativeOutput(...)` for structured model outputs.
- Use `ToolOutput(...)` when the model should select and call delegate functions.

#### Python Testing
- Test contracts directly.
- Test agents directly where behaviour matters.
- Test API routes as thin integration points.
- Prefer dependency overrides or startup-state seams to monkeypatching random globals.

### Frontend Development
- **Frontend dev server**: `task frontend:dev` — requires backend on localhost:8080
- **Tech Stack**: Vite + React + TypeScript + Mantine UI + TailwindCSS
- **Proxy Configuration**: Vite proxies `/api/*` calls to backend (localhost:8080)
- **Build Process**: DO NOT run build scripts manually - builds are handled by CI/CD pipelines
- **Package Installation**: `task frontend:install`
- **Deployment Options**:
  - **Desktop App**: `task desktop:build`
  - **Web Server**: `task frontend:build` then serve dist/ folder
  - **Development**: `task desktop:dev` for desktop dev mode

#### Environment Variables
- All `VITE_*` variables must be declared in the appropriate committed env file:
  - `frontend/.env` — core, proprietary, and shared vars
  - `frontend/.env.saas` — SaaS-only vars (layered on top of `.env` in SaaS mode)
  - `frontend/.env.desktop` — desktop (Tauri)-only vars (layered on top of `.env` in desktop mode)
- These files are committed to Git and must not contain private keys
- Local overrides (API keys, machine-specific settings) go in uncommitted sibling `.env.local` / `.env.saas.local` / `.env.desktop.local` files — Vite automatically layers them on top
- Never use `|| 'hardcoded-fallback'` inline — put defaults in the committed env files
- `task frontend:prepare` creates empty `.local` override files on first run; pass `MODE=saas` or `MODE=desktop` to also create the mode-specific `.local` file
- Prepare runs automatically as a dependency of all `dev*`, `build*`, and `desktop*` tasks
- See `frontend/README.md#environment-variables` for full documentation

#### Import Paths - CRITICAL
**ALWAYS use `@app/*` for imports.** Do not use `@core/*` or `@proprietary/*` unless explicitly wrapping/extending a lower layer implementation.

For a broader explanation of the frontend layering and override architecture, see [frontend/DeveloperGuide.md](frontend/DeveloperGuide.md).

```typescript
// ✅ CORRECT - Use @app/* for all imports
import { AppLayout } from "@app/components/AppLayout";
import { useFileContext } from "@app/contexts/FileContext";
import { FileContext } from "@app/contexts/FileContext";

// ❌ WRONG - Do not use @core/* or @proprietary/* in normal code
import { AppLayout } from "@core/components/AppLayout";
import { useFileContext } from "@proprietary/contexts/FileContext";
```

**Only use explicit aliases when:**
- Building layer-specific override that wraps a lower layer's component
- Example: `import { AppProviders as CoreAppProviders } from "@core/components/AppProviders"` when creating proprietary/AppProviders.tsx that extends the core version

The `@app/*` alias automatically resolves to the correct layer based on build target (core/proprietary/desktop) and handles the fallback cascade.

#### Component Override Pattern (Stub/Shadow)
Use this pattern for desktop-specific or proprietary-specific features WITHOUT runtime checks or conditionals.

**How it works:**
1. Core defines stub component (returns null or no-op)
2. Desktop/proprietary overrides with same path/name
3. Core imports via `@app/*` - higher layer "shadows" core in those builds
4. No `@ts-ignore`, no `isTauri()` checks, no runtime conditionals!

**Example - Desktop-specific footer:**

```typescript
// core/components/rightRail/RightRailFooterExtensions.tsx (stub)
interface RightRailFooterExtensionsProps {
  className?: string;
}

export function RightRailFooterExtensions(_props: RightRailFooterExtensionsProps) {
  return null; // Stub - does nothing in web builds
}
```

```tsx
// desktop/components/rightRail/RightRailFooterExtensions.tsx (real implementation)
import { Box } from '@mantine/core';
import { BackendHealthIndicator } from '@app/components/BackendHealthIndicator';

interface RightRailFooterExtensionsProps {
  className?: string;
}

export function RightRailFooterExtensions({ className }: RightRailFooterExtensionsProps) {
  return (
    <Box className={className}>
      <BackendHealthIndicator />
    </Box>
  );
}
```

```tsx
// core/components/shared/RightRail.tsx (usage - works in ALL builds)
import { RightRailFooterExtensions } from '@app/components/rightRail/RightRailFooterExtensions';

export function RightRail() {
  return (
    <div>
      {/* In web builds: renders nothing (stub returns null) */}
      {/* In desktop builds: renders BackendHealthIndicator */}
      <RightRailFooterExtensions className="right-rail-footer" />
    </div>
  );
}
```

**Build resolution:**
- **Core build**: `@app/*` → `core/*` → Gets stub (returns null)
- **Desktop build**: `@app/*` → `desktop/*` → Gets real implementation (shadows core)

**Benefits:**
- No runtime checks or feature flags
- Type-safe across all builds
- Clean, readable code
- Build-time optimization (dead code elimination)

#### Multi-Tool Workflow Architecture
Frontend designed for **stateful document processing**:
- Users upload PDFs once, then chain tools (split → merge → compress → view)
- File state and processing results persist across tool switches
- No file reloading between tools - performance critical for large PDFs (up to 100GB+)

#### FileContext - Central State Management
**Location**: `frontend/src/core/contexts/FileContext.tsx`
- **Active files**: Currently loaded PDFs and their variants
- **Tool navigation**: Current mode (viewer/pageEditor/fileEditor/toolName)
- **Memory management**: PDF document cleanup, blob URL lifecycle, Web Worker management
- **IndexedDB persistence**: File storage with thumbnail caching
- **Preview system**: Tools can preview results (e.g., Split → Viewer → back to Split) without context pollution

**Critical**: All file operations go through FileContext. Don't bypass with direct file handling.

#### Processing Services
- **enhancedPDFProcessingService**: Background PDF parsing and manipulation
- **thumbnailGenerationService**: Web Worker-based with main-thread fallback
- **fileStorage**: IndexedDB with LRU cache management

#### Memory Management Strategy
**Why manual cleanup exists**: Large PDFs (up to 100GB+) through multiple tools accumulate:
- PDF.js documents that need explicit .destroy() calls
- Blob URLs from tool outputs that need revocation
- Web Workers that need termination
Without cleanup: browser crashes with memory leaks.

#### Tool Development

**Architecture**: Modular hook-based system with clear separation of concerns:

- **useToolOperation** (`frontend/src/core/hooks/tools/shared/useToolOperation.ts`): Main orchestrator hook
  - Coordinates all tool operations with consistent interface
  - Integrates with FileContext for operation tracking
  - Handles validation, error handling, and UI state management

- **Supporting Hooks**:
  - **useToolState**: UI state management (loading, progress, error, files)
  - **useToolApiCalls**: HTTP requests and file processing
  - **useToolResources**: Blob URLs, thumbnails, ZIP downloads

- **Utilities**:
  - **toolErrorHandler**: Standardized error extraction and i18n support
  - **toolResponseProcessor**: API response handling (single/zip/custom)
  - **toolOperationTracker**: FileContext integration utilities

**Three Tool Patterns**:

**Pattern 1: Single-File Tools** (Individual processing)
- Backend processes one file per API call
- Set `multiFileEndpoint: false`
- Examples: Compress, Rotate
```typescript
return useToolOperation({
  operationType: 'compress',
  endpoint: '/api/v1/misc/compress-pdf',
  buildFormData: (params, file: File) => { /* single file */ },
  multiFileEndpoint: false,
});
```

**Pattern 2: Multi-File Tools** (Batch processing)
- Backend accepts `MultipartFile[]` arrays in single API call
- Set `multiFileEndpoint: true`
- Examples: Split, Merge, Overlay
```typescript
return useToolOperation({
  operationType: 'split',
  endpoint: '/api/v1/general/split-pages',
  buildFormData: (params, files: File[]) => { /* all files */ },
  multiFileEndpoint: true,
  filePrefix: 'split_',
});
```

**Pattern 3: Complex Tools** (Custom processing)
- Tools with complex routing logic or non-standard processing
- Provide `customProcessor` for full control
- Examples: Convert, OCR
```typescript
return useToolOperation({
  operationType: 'convert',
  customProcessor: async (params, files) => { /* custom logic */ },
});
```

**Benefits**:
- **No Timeouts**: Operations run until completion (supports 100GB+ files)
- **Consistent**: All tools follow same pattern and interface
- **Maintainable**: Single responsibility hooks, easy to test and modify
- **i18n Ready**: Built-in internationalization support
- **Type Safe**: Full TypeScript support with generic interfaces
- **Memory Safe**: Automatic resource cleanup and blob URL management

## Architecture Overview

### Project Structure
- **Backend**: Spring Boot application
- **Frontend**: React-based SPA in `/frontend` directory
  - **File Storage**: IndexedDB for client-side file persistence and thumbnails
  - **Internationalization**: JSON-based translations (converted from backend .properties)
- **PDF Processing**: PDFBox for core PDF operations, LibreOffice for conversions, PDF.js for client-side rendering
- **Security**: Spring Security with optional authentication (controlled by `DOCKER_ENABLE_SECURITY`)
- **Configuration**: YAML-based configuration with environment variable overrides

### Controller Architecture
- **API Controllers** (`src/main/java/.../controller/api/`): REST endpoints for PDF operations
  - Organized by function: converters, security, misc, pipeline
  - Follow pattern: `@RestController` + `@RequestMapping("/api/v1/...")`

### Key Components
- **SPDFApplication.java**: Main application class with desktop UI and browser launching logic
- **ConfigInitializer**: Handles runtime configuration and settings files
- **Pipeline System**: Automated PDF processing workflows via `PipelineController`
- **Security Layer**: Authentication, authorization, and user management (when enabled)

### Frontend Directory Structure
The frontend is organized with a clear separation of concerns:

- **`frontend/src/core/`**: Main application code (shared, production-ready components)
  - **`core/components/`**: React components organized by feature
    - `core/components/tools/`: Individual PDF tool implementations
    - `core/components/viewer/`: PDF viewer components
    - `core/components/pageEditor/`: Page manipulation UI
    - `core/components/tooltips/`: Help tooltips for tools
    - `core/components/shared/`: Reusable UI components
  - **`core/contexts/`**: React Context providers
    - `FileContext.tsx`: Central file state management
    - `file/`: File reducer and selectors
    - `toolWorkflow/`: Tool workflow state
  - **`core/hooks/`**: Custom React hooks
    - `hooks/tools/`: Tool-specific operation hooks (one directory per tool)
    - `hooks/tools/shared/`: Shared hook utilities (useToolOperation, etc.)
  - **`core/constants/`**: Application constants and configuration
  - **`core/data/`**: Static data (tool taxonomy, etc.)
  - **`core/services/`**: Business logic services (PDF processing, storage, etc.)

- **`frontend/src/desktop/`**: Desktop-specific (Tauri) code
- **`frontend/src/proprietary/`**: Proprietary/licensed features
- **`frontend/src-tauri/`**: Tauri (Rust) native desktop application code
- **`frontend/public/`**: Static assets served directly
  - `public/locales/`: Translation JSON files

### Component Architecture
- **Static Assets**: CSS, JS, and resources in `src/main/resources/static/` (legacy) + `frontend/public/` (modern)
- **Internationalization**:
  - Backend: `messages_*.properties` files
  - Frontend: JSON files in `frontend/public/locales/` (converted from .properties)
  - Conversion Script: `scripts/convert_properties_to_json.py`

### Configuration Modes
- **Ultra-lite**: Basic PDF operations only
- **Standard**: Full feature set
- **Fat**: Pre-downloaded dependencies for air-gapped environments
- **Security Mode**: Adds authentication, user management, and enterprise features

### Testing Strategy
- **Integration Tests**: Cucumber tests in `testing/cucumber/`
- **Docker Testing**: `test.sh` validates all Docker variants
- **Manual Testing**: No unit tests currently - relies on UI and API testing

## Development Workflow

1. **Local Development** (using Taskfile):
   - Backend + frontend: `task dev`
   - All services (including AI engine): `task dev:all`
   - Or individually: `task backend:dev` (localhost:8080), `task frontend:dev` (localhost:5173), `task engine:dev` (localhost:5001)
2. **Quality Gate**: Run `task check` before submitting PRs
3. **Docker Testing**: Use `./test.sh` for full Docker integration tests
4. **Code Style**: Spotless enforces Google Java Format automatically (`task backend:format`)
5. **Translations**:
   - Backend: Use helper scripts in `/scripts` for multi-language updates
   - Frontend: Update JSON files in `frontend/public/locales/` or use conversion script
6. **Documentation**: API docs auto-generated and available at `/swagger-ui/index.html`

## Frontend Architecture Status

- **Core Status**: React SPA architecture complete with multi-tool workflow support
- **State Management**: FileContext handles all file operations and tool navigation
- **File Processing**: Production-ready with memory management for large PDF workflows (up to 100GB+)
- **Tool Integration**: Modular hook architecture with `useToolOperation` orchestrator
  - Individual hooks: `useToolState`, `useToolApiCalls`, `useToolResources`
  - Utilities: `toolErrorHandler`, `toolResponseProcessor`, `toolOperationTracker`
  - Pattern: Each tool creates focused operation hook, UI consumes state/actions
- **Preview System**: Tool results can be previewed without polluting file context (Split tool example)
- **Performance**: Web Worker thumbnails, IndexedDB persistence, background processing

## Translation Rules

- **CRITICAL**: Always update translations in `en-GB` only, never `en-US`
- Translation files are located in `frontend/public/locales/`

## Important Notes

- **Java Version**: Minimum JDK 21, supports and recommends JDK 25
- **Lombok**: Used extensively - ensure IDE plugin is installed
- **File Persistence**:
  - **Backend**: Designed to be stateless - files are processed in memory/temp locations only
  - **Frontend**: Uses IndexedDB for client-side file storage and caching (with thumbnails)
- **Security**: When `DOCKER_ENABLE_SECURITY=false`, security-related classes are excluded from compilation
- **Import Paths**: ALWAYS use `@app/*` for imports - never use `@core/*` or `@proprietary/*` unless explicitly wrapping/extending a lower layer
- **FileContext**: All file operations MUST go through FileContext - never bypass with direct File handling
- **Memory Management**: Manual cleanup required for PDF.js documents and blob URLs - don't remove cleanup code
- **Tool Development**: New tools should follow `useToolOperation` hook pattern (see `useCompressOperation.ts`)
- **Performance Target**: Must handle PDFs up to 100GB+ without browser crashes
- **Preview System**: Tools can preview results without polluting main file context (see Split tool implementation)
- **Adding Tools**: See `ADDING_TOOLS.md` for complete guide to creating new PDF tools

## Communication Style
- Be direct and to the point
- No apologies or conversational filler
- Answer questions directly without preamble
- Explain reasoning concisely when asked
- Avoid unnecessary elaboration

## Decision Making
- Ask clarifying questions before making assumptions
- Stop and ask when uncertain about project-specific details
- Confirm approach before making structural changes
- Request guidance on preferences (cross-platform vs specific tools, etc.)
- Verify understanding of requirements before proceeding
