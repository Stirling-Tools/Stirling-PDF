# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Development Commands

### Build and Run
```bash
# Build the project
./gradlew clean build

# Run locally (includes JWT authentication work-in-progress)
./gradlew bootRun

# Run specific module
./gradlew :stirling-pdf:bootRun

# Build with security features enabled/disabled
DISABLE_ADDITIONAL_FEATURES=false ./gradlew clean build  # enable security
DISABLE_ADDITIONAL_FEATURES=true ./gradlew clean build   # disable security
```

### Testing
```bash
# Run unit tests
./gradlew test

# Run comprehensive integration tests (builds all Docker versions and runs Cucumber tests)
./testing/test.sh

# Run Cucumber/BDD tests specifically
cd testing/cucumber && python -m behave

# Test web pages
cd testing && ./test_webpages.sh -f webpage_urls.txt -b http://localhost:8080
```

### Code Quality and Formatting
```bash
# Apply Java code formatting (required before commits)
./gradlew spotlessApply

# Check formatting compliance
./gradlew spotlessCheck

# Generate license report
./gradlew generateLicenseReport
```

### Docker Development
```bash
# Build different Docker variants
docker build --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest -f ./Dockerfile .
docker build --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest-ultra-lite -f ./Dockerfile.ultra-lite .
DISABLE_ADDITIONAL_FEATURES=false docker build --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest-fat -f ./Dockerfile.fat .

# Use example Docker Compose configs
docker-compose -f exampleYmlFiles/docker-compose-latest-security.yml up -d
```

## Architecture Overview

Stirling-PDF is a Spring Boot web application for PDF manipulation with the following key architectural components:

### Multi-Module Structure
- **stirling-pdf/**: Main application module with web UI and REST APIs
- **common/**: Shared utilities and common functionality
- **proprietary/**: Enterprise/security features (JWT authentication, audit, teams)

### Technology Stack
- **Backend**: Spring Boot 3.5, Spring Security, Spring Data JPA
- **Frontend**: Thymeleaf templates, Bootstrap, vanilla JavaScript
- **PDF Processing**: Apache PDFBox 3.0, qpdf, LibreOffice
- **Authentication**: JWT-based stateless sessions (in development)
- **Database**: H2 (default), supports PostgreSQL/MySQL
- **Build**: Gradle with multi-project setup

### Current Development Context
The repository is on the `jwt-authentication` branch with work-in-progress changes to:
- JWT-based authentication system (`JWTService`, `JWTServiceInterface`)
- Stateless session management
- User model updates for JWT support

### Key Directories
- `stirling-pdf/src/main/java/stirling/software/SPDF/`: Main application code
  - `controller/`: REST API endpoints and UI controllers
  - `service/`: Business logic layer
  - `config/`: Spring configuration classes
  - `security/`: Authentication and authorization
- `stirling-pdf/src/main/resources/templates/`: Thymeleaf HTML templates
- `stirling-pdf/src/main/resources/static/`: CSS, JavaScript, and assets
- `proprietary/src/main/java/stirling/software/proprietary/`: Enterprise features
- `testing/`: Integration tests and Cucumber features

### Configuration Management
- Environment variables or `settings.yml` for runtime configuration
- Conditional feature compilation based on `DISABLE_ADDITIONAL_FEATURES`
- Multi-environment Docker configurations in `exampleYmlFiles/`

### API Design Patterns
- RESTful endpoints under `/api/v1/`
- OpenAPI/Swagger documentation available at `/swagger-ui/index.html`
- File upload/download handling with multipart form data
- Consistent error handling and response formats

## Development Workflow

1. **Environment Setup**: Set `DISABLE_ADDITIONAL_FEATURES=false` for full feature development
2. **Code Formatting**: Always run `./gradlew spotlessApply` before committing
3. **Testing Strategy**: Use `./testing/test.sh` for comprehensive testing before PRs
4. **Feature Development**: Follow the controller -> service -> template pattern
5. **Security**: JWT authentication is currently in development on this branch

## Important Notes

- The application supports conditional compilation of security features
- Translation files are in `messages_*.properties` format
- PDF processing operations are primarily stateless
- Docker is the recommended deployment method
- All text should be internationalized using translation keys