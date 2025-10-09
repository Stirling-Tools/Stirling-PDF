# Stirling-PDF Developer Guide

## 1. Introduction

Stirling-PDF is a robust, locally hosted, web-based PDF manipulation tool. This guide focuses on Docker-based development and testing, which is the recommended approach for working with the full version of Stirling-PDF.

## 2. Project Overview

Stirling-PDF is built using:

- Spring Boot (Backend API)
- React + TypeScript + Vite (Frontend V2)
- Mantine UI + TailwindCSS (UI Framework)
- PDFBox (PDF manipulation)
- LibreOffice (Document conversion)
- qpdf (PDF processing)
- PDF.js (Client-side PDF rendering)
- Embedded-PDF (PDF viewer component)
- Docker
- Lombok

## 3. Development Environment Setup

### Prerequisites

- Docker
- Git
- Java JDK 17 or later (JDK 21 recommended)
- Gradle 7.0 or later (Included within the repo)
- Node.js 18+ and npm (for frontend development)

### Setup Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/Stirling-Tools/Stirling-PDF.git
   cd Stirling-PDF
   ```

2. Install Docker and JDK17 if not already installed.

3. Install a recommended IDE:
   - **VSCode** (recommended for frontend)
      1. Open VS Code.
      2. When prompted, install the recommended extensions.
      3. Alternatively, open the command palette (`Ctrl + Shift + P` or `Cmd + Shift + P` on macOS) and run:

        ```sh
        Extensions: Show Recommended Extensions
        ```

      4. Install the required extensions from the list.
   - **IntelliJ IDEA** (recommended for backend)
   - **Eclipse** (alternative for backend)

4. Lombok Setup
Stirling-PDF uses Lombok to reduce boilerplate code. Some IDEs, like Eclipse, don't support Lombok out of the box. To set up Lombok in your development environment:
Visit the [Lombok website](https://projectlombok.org/setup/) for installation instructions specific to your IDE.

5. Add environment variable
For local testing, you should generally be testing the full 'Security' version of Stirling PDF. To do this, you must add the environment flag DOCKER_ENABLE_SECURITY=true to your system and/or IDE build/run step.

## 4. Project Structure

```bash
Stirling-PDF/
├── .github/               # GitHub-specific files (workflows, issue templates)
├── configs/               # Configuration files used by stirling at runtime (generated at runtime)
├── cucumber/              # Cucumber test files
│   ├── features/
├── customFiles/           # Custom static files and templates (generated at runtime used to replace existing files)
├── docs/                  # Documentation files
├── exampleYmlFiles/       # Example YAML configuration files
├── frontend/              # React frontend application (V2)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── tools/         # PDF tool implementations
│   │   ├── contexts/      # React contexts (FileContext, etc.)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API and processing services
│   │   └── i18n.ts        # Internationalization config
│   ├── public/
│   │   └── locales/       # Translation JSON files
│   └── package.json
├── images/                # Image assets
├── pipeline/              # Pipeline-related files (generated at runtime)
├── scripts/               # Utility scripts
├── src/                   # Backend source code
│   ├── main/
│   │   ├── java/
│   │   │   └── stirling/
│   │   │       └── software/
│   │   │           └── SPDF/
│   │   │               ├── config/
│   │   │               ├── controller/
│   │   │               │   ├── api/    # REST API endpoints
│   │   │               │   └── web/    # Web controllers
│   │   │               ├── model/
│   │   │               ├── repository/
│   │   │               ├── service/
│   │   │               └── utils/
│   │   └── resources/
│   │       └── static/    # Legacy static assets
│   └── test/
│       └── java/
│           └── stirling/
│               └── software/
│                   └── SPDF/
├── build.gradle           # Gradle build configuration
├── Dockerfile             # Main Dockerfile
├── Dockerfile.ultra-lite  # Dockerfile for ultra-lite version
├── Dockerfile.fat         # Dockerfile for fat version
├── docker-compose.yml     # Docker Compose configuration
└── test.sh                # Test script to deploy all docker versions and run cuke tests
```

## 5. Docker-based Development

Stirling-PDF offers several Docker versions:

- Full: All features included
- Ultra-Lite: Basic PDF operations only
- Fat: Includes additional libraries and fonts predownloaded

### Example Docker Compose Files

Stirling-PDF provides several example Docker Compose files in the `exampleYmlFiles` directory, such as:

- `docker-compose-latest.yml`: Latest version without login and security features
- `docker-compose-latest-security.yml`: Latest version with login and security features enabled
- `docker-compose-latest-fat-security.yml`: Fat version with login and security features enabled

These files provide pre-configured setups for different scenarios. For example, here's a snippet from `docker-compose-latest-security.yml`:

```yaml
services:
  stirling-pdf:
    container_name: Stirling-PDF-Security
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest
    deploy:
      resources:
        limits:
          memory: 4G
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/api/v1/info/status | grep -q 'UP' && curl -fL http://localhost:8080/ | grep -q 'Please sign in'"]
      interval: 5s
      timeout: 10s
      retries: 16
    ports:
      - "8080:8080"
    volumes:
      - ./stirling/latest/data:/usr/share/tessdata:rw
      - ./stirling/latest/config:/configs:rw
      - ./stirling/latest/logs:/logs:rw
    environment:
      DOCKER_ENABLE_SECURITY: "true"
      SECURITY_ENABLELOGIN: "true"
      PUID: 1002
      PGID: 1002
      UMASK: "022"
      SYSTEM_DEFAULTLOCALE: en-US
      UI_APPNAME: Stirling-PDF
      UI_HOMEDESCRIPTION: Demo site for Stirling-PDF Latest with Security
      UI_APPNAMENAVBAR: Stirling-PDF Latest
      SYSTEM_MAXFILESIZE: "100"
      METRICS_ENABLED: "true"
      SYSTEM_GOOGLEVISIBILITY: "true"
      SHOW_SURVEY: "true"
    restart: on-failure:5
```

To use these example files, copy the desired file to your project root and rename it to `docker-compose.yml`, or specify the file explicitly when running Docker Compose:

```bash
docker-compose -f exampleYmlFiles/docker-compose-latest-security.yml up
```

### Building Docker Images

Stirling-PDF uses different Docker images for various configurations. The build process is controlled by environment variables and uses specific Dockerfile variants. Here's how to build the Docker images:

1. Set the security environment variable:

   ```bash
   export DOCKER_ENABLE_SECURITY=true  # or false to disable login and security features for builds
   ```

2. Build the project with Gradle:

   ```bash
   ./gradlew clean build
   ```

3. Build the Docker images:

   For the latest version:

   ```bash
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest -f ./Dockerfile .
   ```

   For the ultra-lite version:

   ```bash
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest-ultra-lite -f ./Dockerfile.ultra-lite .
   ```

   For the fat version (with login and security features enabled):

   ```bash
   export DOCKER_ENABLE_SECURITY=true
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest-fat -f ./Dockerfile.fat .
   ```

Note: The `--no-cache` and `--pull` flags ensure that the build process uses the latest base images and doesn't use cached layers, which is useful for testing and ensuring reproducible builds. however to improve build times these can often be removed depending on your usecase

## 6. Testing

### Comprehensive Testing Script

Stirling-PDF provides a `test.sh` script in the root directory. This script builds all versions of Stirling-PDF, checks that each version works, and runs Cucumber tests. It's recommended to run this script before submitting a final pull request.

To run the test script:

```bash
./test.sh
```

This script performs the following actions:

1. Builds all Docker images (full, ultra-lite, fat).
2. Runs each version to ensure it starts correctly.
3. Executes Cucumber tests against the main version and ensures feature compatibility. In the event these tests fail, your PR will not be merged.

Note: The `test.sh` script will run automatically when you raise a PR. However, it's recommended to run it locally first to save resources and catch any issues early.

### Full Testing with Docker

1. Build and run the Docker container per the above instructions

2. Access the application at `http://localhost:8080` and manually test all features developed.

### Local Testing (Frontend and Backend)

For quick iterations and development, you can run the frontend and backend separately:

#### Backend Development

1. Run the backend:

   ```bash
   ./gradlew bootRun
   ```

2. The backend API will be available at `http://localhost:8080`

3. API documentation is available at `http://localhost:8080/swagger-ui/index.html`

#### Frontend Development

1. Install dependencies (first time only):

   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. The frontend will be available at `http://localhost:5173`

4. Vite automatically proxies API calls from `/api/*` to the backend at `localhost:8080`

Important notes:

- Frontend requires the backend to be running for full functionality
- Hot module replacement (HMR) enables instant updates during development
- Local testing doesn't include features that depend on external tools like qpdf, LibreOffice, or Python scripts.
- Always verify your changes in the full Docker environment before submitting pull requests, as some integrations and features will only work in the complete setup.

## 7. Contributing

1. Fork the repository on GitHub.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with clear, descriptive messages and ensure any documentation is updated related to your changes.
4. Test your changes thoroughly in the Docker environment.
5. Run the `test.sh` script to ensure all versions build correctly and pass the Cucumber tests:

   ```bash
   ./test.sh
   ```

6. Push your changes to your fork.
7. Submit a pull request to the main repository.
8. See additional [contributing guidelines](../CONTRIBUTING.md).

When you raise a PR:

- The `test.sh` script will run automatically against your PR.
- The PR checks will verify versioning and dependency updates.
- Documentation will be automatically updated for dependency changes.
- Security issues will be checked using Snyk and PixeeBot.

Address any issues that arise from these checks before finalizing your pull request.

## 8. API Documentation

API documentation is available at `/swagger-ui/index.html` when running the application. You can also view the latest API documentation [here](https://app.swaggerhub.com/apis-docs/Stirling-Tools/Stirling-PDF/).

## 9. Customization

Stirling-PDF can be customized through environment variables or a `settings.yml` file. Key customization options include:

- Application name and branding
- Security settings
- UI customization
- Endpoint management
- Maximum DPI for PDF to image conversion (`system.maxDPI`)

When using Docker, pass environment variables using the `-e` flag or in your `docker-compose.yml` file.

Example:

```bash
docker run -p 8080:8080 -e APP_NAME="My PDF Tool" stirling-pdf:full
```

Refer to the main README for a full list of customization options.

## 10. Frontend Development (V2)

### Architecture Overview

The V2 frontend is designed for **stateful document processing**:
- Users upload PDFs once, then chain tools (split → merge → compress → view)
- File state and processing results persist across tool switches
- No file reloading between tools - performance critical for large PDFs (up to 100GB+)

### Key Components

#### FileContext - Central State Management
**Location**: `frontend/src/contexts/FileContext.tsx`
- **Active files**: Currently loaded PDFs and their variants
- **Tool navigation**: Current mode (viewer/pageEditor/fileEditor/toolName)
- **Memory management**: PDF document cleanup, blob URL lifecycle, Web Worker management
- **IndexedDB persistence**: File storage with thumbnail caching
- **Preview system**: Tools can preview results without context pollution

**Critical**: All file operations go through FileContext. Don't bypass with direct file handling.

#### Processing Services
- **enhancedPDFProcessingService**: Background PDF parsing and manipulation
- **thumbnailGenerationService**: Web Worker-based with main-thread fallback
- **fileStorage**: IndexedDB with LRU cache management

### Tool Development

**Architecture**: Modular hook-based system with clear separation of concerns:

- **useToolOperation** (`frontend/src/hooks/tools/shared/useToolOperation.ts`): Main orchestrator hook
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

### Adding a New Tool

See [ADDING_TOOLS.md](../ADDING_TOOLS.md) for a complete guide to creating new PDF tools.

### Internationalization

Translations are stored in JSON files at `frontend/public/locales/{language-code}/translation.json`.

To use translations in React components:

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('myTool.title')}</h1>
      <p>{t('myTool.description')}</p>
    </div>
  );
}
```

See [HowToAddNewLanguage.md](./HowToAddNewLanguage.md) for details on adding new languages.

## 11. Backend Development

### Adding a New API Endpoint

1. **Create a New Controller:**
   - Create a new Java class in the `src/main/java/stirling/software/SPDF/controller/api` directory.
   - Annotate the class with `@RestController` and `@RequestMapping` to define the API endpoint.
   - Ensure to add API documentation annotations like `@Tag` and `@Operation`.

   ```java
   package stirling.software.SPDF.controller.api;

   import org.springframework.web.bind.annotation.*;
   import org.springframework.web.multipart.MultipartFile;
   import io.swagger.v3.oas.annotations.Operation;
   import io.swagger.v3.oas.annotations.tags.Tag;

   @RestController
   @RequestMapping("/api/v1/pdf")
   @Tag(name = "General", description = "General APIs")
   public class NewFeatureController {

       @PostMapping("/new-feature")
       @Operation(summary = "New Feature", description = "This is a new feature endpoint. Input:PDF Output:PDF Type:SISO")
       public ResponseEntity<byte[]> newFeature(
           @RequestPart("fileInput") MultipartFile file,
           @RequestParam("param1") String param1) {

           // Process PDF
           byte[] result = processFile(file, param1);

           return ResponseEntity.ok()
               .header("Content-Disposition", "attachment; filename=output.pdf")
               .contentType(MediaType.APPLICATION_PDF)
               .body(result);
       }
   }
   ```

2. **Define the Service Layer:** (Optional but recommended)
   - Create a new service class in the `src/main/java/stirling/software/SPDF/service` directory.
   - Implement the business logic for the new feature.

   ```java
   package stirling.software.SPDF.service;

   import org.springframework.stereotype.Service;

   @Service
   public class NewFeatureService {

       public byte[] processFile(MultipartFile file, String param1) {
           // Implement business logic here
           return processedBytes;
       }
   }
   ```

3. **Integrate the Service with the Controller:**

   ```java
   @RestController
   @RequestMapping("/api/v1/pdf")
   public class NewFeatureController {

       @Autowired
       private NewFeatureService newFeatureService;

       @PostMapping("/new-feature")
       public ResponseEntity<byte[]> newFeature(
           @RequestPart("fileInput") MultipartFile file,
           @RequestParam("param1") String param1) {

           byte[] result = newFeatureService.processFile(file, param1);

           return ResponseEntity.ok()
               .header("Content-Disposition", "attachment; filename=output.pdf")
               .contentType(MediaType.APPLICATION_PDF)
               .body(result);
       }
   }
   ```

### Multi-File Endpoints

For tools that process multiple files in one request:

```java
@PostMapping("/merge")
public ResponseEntity<byte[]> mergePdfs(
    @RequestPart("fileInput") MultipartFile[] files) {

    // Process all files together
    byte[] merged = mergeService.mergeFiles(files);

    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=merged.pdf")
        .contentType(MediaType.APPLICATION_PDF)
        .body(merged);
}
```

## 12. Best Practices

### Frontend
- Always use FileContext for file operations
- Implement proper cleanup for PDF.js documents and blob URLs
- Use the `useToolOperation` hook for consistent tool behavior
- Follow TypeScript strict mode guidelines
- Test with large files (100MB+) to ensure memory efficiency

### Backend
- Use PDFBox for PDF manipulation
- Implement proper error handling and logging
- Add Swagger documentation to all API endpoints
- Use service layer for business logic
- Follow Spring Boot best practices

### General
- Write clear commit messages
- Update documentation for any API changes
- Test in Docker before submitting PRs
- Run `./gradlew spotlessApply` to format code
- Ensure all tests pass with `./test.sh`
