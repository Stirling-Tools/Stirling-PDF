# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Taskfile (Recommended)

This project uses [Task](https://taskfile.dev/) as a unified command runner. All build, dev, test, lint, and docker commands can be run from the repo root via `task <command>`. Run `task --list` to see all available commands.

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

### Python Development
Development for the AI engine happens in the `engine/` folder. The frontend calls the Python via Java as a proxy.

- Follow the engine-specific guidance in [engine/AGENTS.md](engine/AGENTS.md) for Python architecture, code style, and AI usage.
- Use Task commands from the repo root:
  - `task engine:check` — lint, type-check, test
  - `task engine:fix` — auto-fix linting and formatting
  - `task engine:install` — install dependencies
- The project structure is defined in `engine/pyproject.toml`. Any new dependencies should be listed there, followed by running `task engine:install`.

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
- All `VITE_*` variables must be declared in the appropriate example file:
  - `frontend/config/.env.example` — core, proprietary, and shared vars
  - `frontend/config/.env.saas.example` — SaaS-only vars
  - `frontend/config/.env.desktop.example` — desktop (Tauri)-only vars
- Never use `|| 'hardcoded-fallback'` inline — put defaults in the example files
- `task frontend:prep` / `prep:saas` / `prep:desktop` auto-create the env files from examples on first run, and error if any required keys are missing
- Prep runs automatically as a dependency of all `dev*`, `build*`, and `desktop*` tasks
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
