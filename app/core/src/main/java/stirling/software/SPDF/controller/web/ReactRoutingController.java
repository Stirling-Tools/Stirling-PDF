package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Slf4j
@Controller
public class ReactRoutingController {

    @Value("${server.servlet.context-path:/}")
    private String contextPath;

    private String cachedIndexHtml;
    private boolean indexHtmlExists = false;
    private boolean useExternalIndexHtml = false;

    @PostConstruct
    public void init() {
        log.info("Static files custom path: {}", InstallationPathConfig.getStaticPath());

        // Check for external index.html first (customFiles/static/)
        Path externalIndexPath = Paths.get(InstallationPathConfig.getStaticPath(), "index.html");
        log.debug("Checking for custom index.html at: {}", externalIndexPath);
        if (Files.exists(externalIndexPath) && Files.isReadable(externalIndexPath)) {
            log.info("Using custom index.html from: {}", externalIndexPath);
            try {
                this.cachedIndexHtml = processIndexHtml();
                this.indexHtmlExists = true;
                this.useExternalIndexHtml = true;
                return;
            } catch (IOException e) {
                log.warn("Failed to load custom index.html, falling back to classpath", e);
            }
        }

        // Fall back to classpath index.html
        ClassPathResource resource = new ClassPathResource("static/index.html");
        if (resource.exists()) {
            try {
                this.cachedIndexHtml = processIndexHtml();
                this.indexHtmlExists = true;
                this.useExternalIndexHtml = false;
            } catch (IOException e) {
                // Failed to cache, will process on each request
                log.warn("Failed to cache index.html", e);
                this.indexHtmlExists = false;
            }
        }
    }

    private String processIndexHtml() throws IOException {
        Resource resource = getIndexHtmlResource();

        try (InputStream inputStream = resource.getInputStream()) {
            String html = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);

            // Replace %BASE_URL% with the actual context path for base href
            String baseUrl = contextPath.endsWith("/") ? contextPath : contextPath + "/";
            html = html.replace("%BASE_URL%", baseUrl);
            // Also rewrite any existing <base> tag (Vite may have baked one in)
            html =
                    html.replaceFirst(
                            "<base href=\\\"[^\\\"]*\\\"\\s*/?>",
                            "<base href=\\\"" + baseUrl + "\\\" />");

            // Inject context path as a global variable for API calls
            String contextPathScript =
                    "<script>window.STIRLING_PDF_API_BASE_URL = '" + baseUrl + "';</script>";
            html = html.replace("</head>", contextPathScript + "</head>");

            return html;
        }
    }

    private Resource getIndexHtmlResource() throws IOException {
        // Check external location first
        Path externalIndexPath = Paths.get(InstallationPathConfig.getStaticPath(), "index.html");
        if (Files.exists(externalIndexPath) && Files.isReadable(externalIndexPath)) {
            return new FileSystemResource(externalIndexPath.toFile());
        }

        // Fall back to classpath
        return new ClassPathResource("static/index.html");
    }

    @GetMapping(
            value = {"/", "/index.html"},
            produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> serveIndexHtml(HttpServletRequest request) throws IOException {
        if (indexHtmlExists && cachedIndexHtml != null) {
            return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(cachedIndexHtml);
        }
        // Fallback: process on each request (dev mode or cache failed)
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(processIndexHtml());
    }

    @GetMapping(
            "/{path:^(?!api|static|robots\\.txt|favicon\\.ico|manifest.*\\.json|pipeline|pdfjs|pdfjs-legacy|pdfium|vendor|fonts|images|files|css|js|assets|locales|modern-logo|classic-logo|Login|og_images|samples)[^\\.]*$}")
    public ResponseEntity<String> forwardRootPaths(HttpServletRequest request) throws IOException {
        return serveIndexHtml(request);
    }

    @GetMapping(
            "/{path:^(?!api|static|pipeline|pdfjs|pdfjs-legacy|pdfium|vendor|fonts|images|files|css|js|assets|locales|modern-logo|classic-logo|Login|og_images|samples)[^\\.]*}/{subpath:^(?!.*\\.).*$}")
    public ResponseEntity<String> forwardNestedPaths(HttpServletRequest request)
            throws IOException {
        return serveIndexHtml(request);
    }
}
