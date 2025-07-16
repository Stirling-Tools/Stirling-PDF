# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Test
- **Build project**: `./gradlew clean build`
- **Run locally**: `./gradlew bootRun`
- **Full test suite**: `./test.sh` (builds all Docker variants and runs comprehensive tests)
- **Code formatting**: `./gradlew spotlessApply` (runs automatically before compilation)

### Docker Development
- **Build ultra-lite**: `docker build -t stirlingtools/stirling-pdf:latest-ultra-lite -f ./Dockerfile.ultra-lite .`
- **Build standard**: `docker build -t stirlingtools/stirling-pdf:latest -f ./Dockerfile .`
- **Build fat version**: `docker build -t stirlingtools/stirling-pdf:latest-fat -f ./Dockerfile.fat .`
- **Example compose files**: Located in `exampleYmlFiles/` directory

### Security Mode Development
Set `DOCKER_ENABLE_SECURITY=true` environment variable to enable security features during development. This is required for testing the full version locally.

### Frontend Development
- **Frontend dev server**: `cd frontend && npm run dev` (requires backend on localhost:8080)
- **Tech Stack**: Vite + React + TypeScript + Mantine UI + TailwindCSS
- **Proxy Configuration**: Vite proxies `/api/*` calls to backend (localhost:8080)
- **Build Process**: DO NOT run build scripts manually - builds are handled by CI/CD pipelines
- **Package Installation**: DO NOT run npm install commands - package management handled separately
- **Deployment Options**:
  - **Desktop App**: `npm run tauri-build` (native desktop application)
  - **Web Server**: `npm run build` then serve dist/ folder
  - **Development**: `npm run tauri-dev` for desktop dev mode

#### Multi-Tool Workflow Architecture
Frontend designed for **stateful document processing**:
- Users upload PDFs once, then chain tools (split → merge → compress → view)
- File state and processing results persist across tool switches
- No file reloading between tools - performance critical for large PDFs (up to 100GB+)

#### FileContext - Central State Management
**Location**: `src/contexts/FileContext.tsx`
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
- **Pattern**: Follow `src/tools/Split.tsx` as reference implementation
- **File Access**: Tools receive `selectedFiles` prop (computed from activeFiles based on user selection)
- **File Selection**: Users select files in FileEditor (tool mode) → stored as IDs → computed to File objects for tools
- **Integration**: All files are part of FileContext ecosystem - automatic memory management and operation tracking
- **Parameters**: Tool parameter handling patterns still being standardized
- **Preview Integration**: Tools can implement preview functionality (see Split tool's thumbnail preview)

## Architecture Overview

### Project Structure
- **Backend**: Spring Boot application with Thymeleaf templating
- **Frontend**: React-based SPA in `/frontend` directory (Thymeleaf templates fully replaced)
  - **File Storage**: IndexedDB for client-side file persistence and thumbnails
  - **Internationalization**: JSON-based translations (converted from backend .properties)
- **PDF Processing**: PDFBox for core PDF operations, LibreOffice for conversions, PDF.js for client-side rendering
- **Security**: Spring Security with optional authentication (controlled by `DOCKER_ENABLE_SECURITY`)
- **Configuration**: YAML-based configuration with environment variable overrides

### Controller Architecture
- **API Controllers** (`src/main/java/.../controller/api/`): REST endpoints for PDF operations
  - Organized by function: converters, security, misc, pipeline
  - Follow pattern: `@RestController` + `@RequestMapping("/api/v1/...")`
- **Web Controllers** (`src/main/java/.../controller/web/`): Serve Thymeleaf templates
  - Pattern: `@Controller` + return template names

### Key Components
- **SPDFApplication.java**: Main application class with desktop UI and browser launching logic
- **ConfigInitializer**: Handles runtime configuration and settings files
- **Pipeline System**: Automated PDF processing workflows via `PipelineController`
- **Security Layer**: Authentication, authorization, and user management (when enabled)

### Component Architecture
- **React Components**: Located in `frontend/src/components/` and `frontend/src/tools/`
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

1. **Local Development**:
   - Backend: `./gradlew bootRun` (runs on localhost:8080)
   - Frontend: `cd frontend && npm run dev` (runs on localhost:5173, proxies to backend)
2. **Docker Testing**: Use `./test.sh` before submitting PRs
3. **Code Style**: Spotless enforces Google Java Format automatically
4. **Translations**:
   - Backend: Use helper scripts in `/scripts` for multi-language updates
   - Frontend: Update JSON files in `frontend/public/locales/` or use conversion script
5. **Documentation**: API docs auto-generated and available at `/swagger-ui/index.html`

## Frontend Architecture Status

- **Core Status**: React SPA architecture complete with multi-tool workflow support
- **State Management**: FileContext handles all file operations and tool navigation  
- **File Processing**: Production-ready with memory management for large PDF workflows (up to 100GB+)
- **Tool Integration**: Standardized tool interface - see `src/tools/Split.tsx` as reference
- **Preview System**: Tool results can be previewed without polluting file context (Split tool example)
- **Performance**: Web Worker thumbnails, IndexedDB persistence, background processing

## Important Notes

- **Java Version**: Minimum JDK 17, supports and recommends JDK 21
- **Lombok**: Used extensively - ensure IDE plugin is installed
- **Desktop Mode**: Set `STIRLING_PDF_DESKTOP_UI=true` for desktop application mode
- **File Persistence**:
  - **Backend**: Designed to be stateless - files are processed in memory/temp locations only
  - **Frontend**: Uses IndexedDB for client-side file storage and caching (with thumbnails)
- **Security**: When `DOCKER_ENABLE_SECURITY=false`, security-related classes are excluded from compilation
- **FileContext**: All file operations MUST go through FileContext - never bypass with direct File handling
- **Memory Management**: Manual cleanup required for PDF.js documents and blob URLs - don't remove cleanup code
- **Tool Development**: New tools should follow Split tool pattern (`src/tools/Split.tsx`)
- **Performance Target**: Must handle PDFs up to 100GB+ without browser crashes
- **Preview System**: Tools can preview results without polluting main file context (see Split tool implementation)

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
