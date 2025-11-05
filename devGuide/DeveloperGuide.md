# Stirling-PDF Developer Guide

## 1. Introduction

Stirling-PDF is a robust, locally hosted, web-based PDF manipulation tool. This guide focuses on Docker-based development and testing, which is the recommended approach for working with the full version of Stirling-PDF.

## 2. Project Overview

Stirling-PDF is built using:

- Spring Boot + Thymeleaf
- PDFBox
- LibreOffice
- qpdf
- HTML, CSS, JavaScript
- Docker
- PDF.js
- PDF-LIB.js
- Lombok

## 3. Development Environment Setup

### Prerequisites

- Docker
- Git
- Java JDK 17 or later
- Gradle 7.0 or later (Included within the repo)

### Setup Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/Stirling-Tools/Stirling-PDF.git
   cd Stirling-PDF
   ```

2. Install Docker and JDK17 if not already installed.

3. Install a recommended Java IDE such as Eclipse, IntelliJ, or VSCode
   1. Only VSCode
      1. Open VS Code.
      2. When prompted, install the recommended extensions.
      3. Alternatively, open the command palette (`Ctrl + Shift + P` or `Cmd + Shift + P` on macOS) and run:

        ```sh
        Extensions: Show Recommended Extensions
        ```

      4. Install the required extensions from the list.

4. Lombok Setup
Stirling-PDF uses Lombok to reduce boilerplate code. Some IDEs, like Eclipse, don't support Lombok out of the box. To set up Lombok in your development environment:
Visit the [Lombok website](https://projectlombok.org/setup/) for installation instructions specific to your IDE.

5. Add environment variable
For local testing, you should generally be testing the full 'Security' version of Stirling PDF. To do this, you must add the environment flag DISABLE_ADDITIONAL_FEATURES=false to your system and/or IDE build/run step.

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
      DISABLE_ADDITIONAL_FEATURES: "false"
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
   export DISABLE_ADDITIONAL_FEATURES=true  # or false for to enable login and security features for builds
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
   export DISABLE_ADDITIONAL_FEATURES=false
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

1. Compile and run the project using built-in IDE methods or by running:

   ```bash
   ./gradlew bootRun
   ```

2. Access the application at `http://localhost:8080` in your web browser.

3. Manually test the features you're working on through the UI.

4. For API changes, use tools like Postman or curl to test endpoints directly.

Important notes:

- Local testing doesn't include features that depend on external tools like qpdf, LibreOffice, or Python scripts.
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

## Code examples

### Overview of Thymeleaf

Thymeleaf is a server-side Java HTML template engine. It is used in Stirling-PDF to render dynamic web pages. Thymeleaf integrates heavily with Spring Boot.

### Thymeleaf overview

In Stirling-PDF, Thymeleaf is used to create HTML templates that are rendered on the server side. These templates are located in the `app/core/src/main/resources/templates` directory. Thymeleaf templates use a combination of HTML and special Thymeleaf attributes to dynamically generate content.

Some examples of this are:

```html
<th:block th:insert="~{fragments/navbar.html :: navbar}"></th:block>
```
or
```html
<th:block th:insert="~{fragments/footer.html :: footer}"></th:block>
```

Where it uses the `th:block`, `th:` indicating it's a special Thymeleaf element to be used server-side in generating the HTML, and block being the actual element type.
In this case, we are inserting the `navbar` entry within the `fragments/navbar.html` fragment into the `th:block` element.

They can be more complex, such as:

```html
<th:block th:insert="~{fragments/common :: head(title=#{pageExtracter.title}, header=#{pageExtracter.header})}"></th:block>
```

Which is the same as above but passes the parameters title and header into the fragment `common.html` to be used in its HTML generation.

Thymeleaf can also be used to loop through objects or pass things from the Java side into the HTML side.

```java
 @GetMapping
       public String newFeaturePage(Model model) {
           model.addAttribute("exampleData", exampleData);
           return "new-feature";
       }
```

In the above example, if exampleData is a list of plain java objects of class Person and within it, you had id, name, age, etc. You can reference it like so

```html
<tbody>
   <!-- Use th:each to iterate over the list -->
   <tr th:each="person : ${exampleData}">
       <td th:text="${person.id}"></td>
       <td th:text="${person.name}"></td>
       <td th:text="${person.age}"></td>
       <td th:text="${person.email}"></td>
   </tr>
</tbody>
```

This would generate n entries of tr for each person in exampleData

### Adding a New Feature to the Backend (API)

1. **Create a New Controller:**
   - Create a new Java class in the `app/core/src/main/java/stirling/software/SPDF/controller/api` directory.
   - Annotate the class with `@RestController` and `@RequestMapping` to define the API endpoint.
   - Ensure to add API documentation annotations like `@Tag(name = "General", description = "General APIs")` and `@Operation(summary = "Crops a PDF document", description = "This operation takes an input PDF file and crops it according to the given coordinates. Input:PDF Output:PDF Type:SISO")`.

   ```java
   package stirling.software.SPDF.controller.api;

   import org.springframework.web.bind.annotation.GetMapping;
   import org.springframework.web.bind.annotation.RequestMapping;
   import org.springframework.web.bind.annotation.RestController;
   import io.swagger.v3.oas.annotations.Operation;
   import io.swagger.v3.oas.annotations.tags.Tag;

   @RestController
   @RequestMapping("/api/v1/new-feature")
   @Tag(name = "General", description = "General APIs")
   public class NewFeatureController {

       @GetMapping
       @Operation(summary = "New Feature", description = "This is a new feature endpoint.")
       public String newFeature() {
           return "NewFeatureResponse"; // This refers to the NewFeatureResponse.html template presenting the user with the generated html from that file when they navigate to /api/v1/new-feature
       }
   }
   ```

2. **Define the Service Layer:** (Not required but often useful)
   - Create a new service class in the `app/core/src/main/java/stirling/software/SPDF/service` directory.
   - Implement the business logic for the new feature.

   ```java
   package stirling.software.SPDF.service;

   import org.springframework.stereotype.Service;

   @Service
   public class NewFeatureService {

       public String getNewFeatureData() {
           // Implement business logic here
           return "New Feature Data";
       }
   }
   ```

2b. **Integrate the Service with the Controller:**

- Autowire the service class in the controller and use it to handle the API request.

  ```java
  package stirling.software.SPDF.controller.api;

  import org.springframework.beans.factory.annotation.Autowired;
  import org.springframework.web.bind.annotation.GetMapping;
  import org.springframework.web.bind.annotation.RequestMapping;
  import org.springframework.web.bind.annotation.RestController;
  import stirling.software.SPDF.service.NewFeatureService;
  import io.swagger.v3.oas.annotations.Operation;
  import io.swagger.v3.oas.annotations.tags.Tag;

  @RestController
  @RequestMapping("/api/v1/new-feature")
  @Tag(name = "General", description = "General APIs")
  public class NewFeatureController {

      @Autowired
      private NewFeatureService newFeatureService;

      @GetMapping
      @Operation(summary = "New Feature", description = "This is a new feature endpoint.")
      public String newFeature() {
          return newFeatureService.getNewFeatureData();
      }
  }
  ```

### Adding a New Feature to the Frontend (UI)

1. **Create a New Thymeleaf Template:**
   - Create a new HTML file in the `app/core/src/main/resources/templates` directory.
   - Use Thymeleaf attributes to dynamically generate content.
   - Use `extract-page.html` as a base example for the HTML template, which is useful to ensure importing of the general layout, navbar, and footer.

   ```html
   <!DOCTYPE html>
   <html th:lang="${#locale.language}" th:dir="#{language.direction}" th:data-language="${#locale.toString()}" xmlns:th="https://www.thymeleaf.org">
     <head>
     <th:block th:insert="~{fragments/common :: head(title=#{newFeature.title}, header=#{newFeature.header})}"></th:block>
     </head>

     <body>
       <div id="page-container">
         <div id="content-wrap">
           <th:block th:insert="~{fragments/navbar.html :: navbar}"></th:block>
           <br><br>
           <div class="container">
             <div class="row justify-content-center">
               <div class="col-md-6 bg-card">
                 <div class="tool-header">
                   <span class="material-symbols-rounded tool-header-icon organize">upload</span>
                   <span class="tool-header-text" th:text="#{newFeature.header}"></span>
                 </div>
                 <form th:action="@{'/api/v1/new-feature'}" method="post" enctype="multipart/form-data">
                   <div th:replace="~{fragments/common :: fileSelector(name='fileInput', multipleInputsForSingleRequest=false, accept='application/pdf')}"></div>
                   <input type="hidden" id="customMode" name="customMode" value="">
                   <div class="mb-3">
                     <label for="featureInput" th:text="#{newFeature.prompt}"></label>
                     <input type="text" class="form-control" id="featureInput" name="featureInput" th:placeholder="#{newFeature.placeholder}" required>
                   </div>

                   <button type="submit" id="submitBtn" class="btn btn-primary" th:text="#{newFeature.submit}"></button>
                 </form>
               </div>
             </div>
           </div>
         </div>
         <th:block th:insert="~{fragments/footer.html :: footer}"></th:block>
       </div>
     </body>
   </html>
   ```

2. **Create a New Controller for the UI:**
   - Create a new Java class in the `app/core/src/main/java/stirling/software/SPDF/controller/ui` directory.
   - Annotate the class with `@Controller` and `@RequestMapping` to define the UI endpoint.

   ```java
   package stirling.software.SPDF.controller.ui;

   import org.springframework.beans.factory.annotation.Autowired;
   import org.springframework.stereotype.Controller;
   import org.springframework.ui.Model;
   import org.springframework.web.bind.annotation.GetMapping;
   import org.springframework.web.bind.annotation.RequestMapping;
   import stirling.software.SPDF.service.NewFeatureService;

   @Controller
   @RequestMapping("/new-feature")
   public class NewFeatureUIController {

       @Autowired
       private NewFeatureService newFeatureService;

       @GetMapping
       public String newFeaturePage(Model model) {
           model.addAttribute("newFeatureData", newFeatureService.getNewFeatureData());
           return "new-feature";
       }
   }
   ```

3. **Update the Navigation Bar:**
   - Add a link to the new feature page in the navigation bar.
   - Update the `app/core/src/main/resources/templates/fragments/navbar.html` file.

   ```html
   <li class="nav-item">
       <a class="nav-link" th:href="@{'/new-feature'}">New Feature</a>
   </li>
   ```

## Adding New Translations to Existing Language Files in Stirling-PDF

When adding a new feature or modifying existing ones in Stirling-PDF, you'll need to add new translation entries to the existing language files. Here's a step-by-step guide:

### 1. Locate Existing Language Files

Find the existing `messages.properties` files in the `app/core/src/main/resources` directory. You'll see files like:

- `messages.properties` (default, usually English)
- `messages_en_GB.properties`
- `messages_fr_FR.properties`
- `messages_de_DE.properties`
- etc.

### 2. Add New Translation Entries

Open each of these files and add your new translation entries. For example, if you're adding a new feature called "PDF Splitter",
Use descriptive, hierarchical keys (e.g., `feature.element.description`)
you might add:

```properties
pdfSplitter.title=PDF Splitter
pdfSplitter.description=Split your PDF into multiple documents
pdfSplitter.button.split=Split PDF
pdfSplitter.input.pages=Enter page numbers to split
```

Add these entries to the default GB language file and any others you wish, translating the values as appropriate for each language.

### 3. Use Translations in Thymeleaf Templates

In your Thymeleaf templates, use the `#{key}` syntax to reference the new translations:

```html
<h1 th:text="#{pdfSplitter.title}">PDF Splitter</h1>
<p th:text="#{pdfSplitter.description}">Split your PDF into multiple documents</p>
<input type="text" th:placeholder="#{pdfSplitter.input.pages}">
<button th:text="#{pdfSplitter.button.split}">Split PDF</button>
```

Remember, never hard-code text in your templates or Java code. Always use translation keys to ensure proper localization.

### Chatbot Feature Configuration

- The chatbot backend is disabled unless `premium.proFeatures.chatbot.enabled` is true in `configs/settings.yml`.
- Provide an OpenAI-compatible key via `SPRING_AI_OPENAI_API_KEY` (or `spring.ai.openai.api-key`) and set `spring.ai.openai.enabled=true` when you want chatbot beans to load. Leaving this property disabled allows the rest of Stirling-PDF to run without AI credentials.
