# Stirling-PDF Developer Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Project Overview](#project-overview)
3. [Development Environment Setup](#development-environment-setup)
4. [Project Structure](#project-structure)
5. [Docker-based Development](#docker-based-development)
6. [Testing](#testing)
7. [Contributing](#contributing)
8. [API Documentation](#api-documentation)
9. [Customization](#customization)
10. [Language Translations](#language-translations)

## 1. Introduction

Stirling-PDF is a robust, locally hosted web-based PDF manipulation tool. This guide focuses on Docker-based development and testing, which is the recommended approach for working with the full version of Stirling-PDF.

## 2. Project Overview

Stirling-PDF is built using:
- Spring Boot + Thymeleaf
- PDFBox
- LibreOffice
- OcrMyPdf
- HTML, CSS, JavaScript
- Docker
- PDF.js
- PDF-LIB.js
- Lombok

## 3. Development Environment Setup

### Prerequisites
- Docker
- Git
- Java JDK 17 or later (
- Gradle 7.0 or later (Included within repo)

### Setup Steps
1. Clone the repository:
   ```
   git clone https://github.com/Stirling-Tools/Stirling-PDF.git
   cd Stirling-PDF
   ```

2. Install Docker and JDK17 if not already installed.

3. Install a recommended Java IDE such as Eclipse, IntelliJ or VSCode

4. Lombok Setup
Stirling-PDF uses Lombok to reduce boilerplate code. Some IDEs, like Eclipse, don't support Lombok out of the box. To set up Lombok in your development environment:
Visit the [Lombok website](https://projectlombok.org/setup/) for installation instructions specific to your IDE.

5. Add environment variable
For local testing you should generally be testing the full 'Security' version of Stirling-PDF to do this you must add the environment flag DOCKER_ENABLE_SECURITY=true to your system and/or IDE build/run step


## 4. Project Structure

```
Stirling-PDF/
├── .github/               # GitHub-specific files (workflows, issue templates)
├── configs/               # Configuration files used by stirling at runtime (generated at runtime)
├── cucumber/              # Cucumber test files
│   ├── features/
├── customFiles/           # Custom static files and templates (generated at runtime used to replace existing files)
├── docs/                  # Documentation files
├── exampleYmlFiles/       # Example YAML configuration files
├── images/                # Image assets
├── pipeline/              # Pipeline-related files (generated at runtime)
├── scripts/               # Utility scripts
├── src/                   # Source code
│   ├── main/
│   │   ├── java/
│   │   │   └── stirling/
│   │   │       └── software/
│   │   │           └── SPDF/
│   │   │               ├── config/
│   │   │               ├── controller/
│   │   │               ├── model/
│   │   │               ├── repository/
│   │   │               ├── service/
│   │   │               └── utils/
│   │   └── resources/
│   │       ├── static/
│   │       │   ├── css/
│   │       │   ├── js/
│   │       │   └── pdfjs/
│   │       └── templates/
│   └── test/
│       └── java/
│           └── stirling/
│               └── software/
│                   └── SPDF/
├── build.gradle           # Gradle build configuration
├── Dockerfile             # Main Dockerfile
├── Dockerfile-ultra-lite  # Dockerfile for ultra-lite version
├── Dockerfile-fat         # Dockerfile for fat version
├── docker-compose.yml     # Docker Compose configuration
└── test.sh                # Test script to deploy all docker versions and run cuke tests
```

## 5. Docker-based Development

Stirling-PDF offers several Docker versions:
- Full: All features included
- Ultra-Lite: Basic PDF operations only
- Fat: Includes additional libraries and fonts predownloaded

### Example Docker Compose Files

Stirling-PDF provides several example Docker Compose files in the `exampleYmlFiles` directory such as :

- `docker-compose-latest.yml`: Latest version without security features
- `docker-compose-latest-security.yml`: Latest version with security features enabled
- `docker-compose-latest-fat-security.yml`: Fat version with security features enabled

These files provide pre-configured setups for different scenarios. For example, here's a snippet from `docker-compose-latest-security.yml`:

```yaml
services:
  stirling-pdf:
    container_name: Stirling-PDF-Security
    image: frooodle/s-pdf:latest
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
      - /stirling/latest/data:/usr/share/tessdata:rw
      - /stirling/latest/config:/configs:rw
      - /stirling/latest/logs:/logs:rw
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
   export DOCKER_ENABLE_SECURITY=false  # or true for security-enabled builds
   ```

2. Build the project with Gradle:
   ```bash
   ./gradlew clean build
   ```

3. Build the Docker images:

   For the latest version:
   ```bash
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t frooodle/s-pdf:latest -f ./Dockerfile .
   ```

   For the ultra-lite version:
   ```bash
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t frooodle/s-pdf:latest-ultra-lite -f ./Dockerfile-ultra-lite .
   ```

   For the fat version (with security enabled):
   ```bash
   export DOCKER_ENABLE_SECURITY=true
   docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t frooodle/s-pdf:latest-fat -f ./Dockerfile-fat .
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
1. Builds all Docker images (full, ultra-lite, fat)
2. Runs each version to ensure it starts correctly
3. Executes Cucumber tests against main version and ensures feature compatibility, in the event these tests fail your PR will not be merged

Note: The `test.sh` script will run automatically when you raise a PR. However, it's recommended to run it locally first to save resources and catch any issues early.

### Full Testing with Docker

1. Build and run the Docker container per the above instructions:

2. Access the application at `http://localhost:8080` and manually test all features developed.


### Local Testing (Java and UI Components)

For quick iterations and development of Java backend, JavaScript, and UI components, you can run and test Stirling-PDF locally without Docker. This approach allows you to work on and verify changes to:

- Java backend logic
- RESTful API endpoints
- JavaScript functionality
- User interface components and styling
- Thymeleaf templates

To run Stirling-PDF locally:

1. Compile and run the project using built in IDE methods or by running:
   ```
   ./gradlew bootRun
   ```

2. Access the application at `http://localhost:8080` in your web browser.

3. Manually test the features you're working on through the UI.

4. For API changes, use tools like Postman or curl to test endpoints directly.

Important notes:
- Local testing doesn't include features that depend on external tools like OCRmyPDF, LibreOffice, or Python scripts.
- There are currently no automated unit tests. All testing is done manually through the UI or API calls. (You are welcome to add JUnits!)
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
8. See additional [contributing guidelines](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/CONTRIBUTING.md)

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

When using Docker, pass environment variables using the `-e` flag or in your `docker-compose.yml` file.

Example:
```
docker run -p 8080:8080 -e APP_NAME="My PDF Tool" stirling-pdf:full
```

Refer to the main README for a full list of customization options.

## 10. Language Translations

For managing language translations that affect multiple files, Stirling-PDF provides a helper script:

```bash
/scripts/replace_translation_line.sh
```

This script helps you make consistent replacements across language files.

When contributing translations:
1. Use the helper script for multi-file changes.
2. Ensure all language files are updated consistently.
3. The PR checks will verify consistency in language file updates.

Remember to test your changes thoroughly to ensure they don't break any existing functionality.
