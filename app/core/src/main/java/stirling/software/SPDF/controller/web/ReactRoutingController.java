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

import stirling.software.common.configuration.InstallationPathConfig;

@Controller
public class ReactRoutingController {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(ReactRoutingController.class);

    @Value("${server.servlet.context-path:/}")
    private String contextPath;

    private String cachedIndexHtml;
    private String cachedCallbackHtml;
    private boolean indexHtmlExists = false;
    private boolean useExternalIndexHtml = false;
    private boolean loggedMissingIndex = false;

    @PostConstruct
    public void init() {
        log.info("Static files custom path: {}", InstallationPathConfig.getStaticPath());

        // Check for external index.html first (customFiles/static/)
        Path externalIndexPath = Paths.get(InstallationPathConfig.getStaticPath(), "index.html");
        log.debug("Checking for custom index.html at: {}", externalIndexPath);
        if (Files.exists(externalIndexPath) && Files.isReadable(externalIndexPath)) {
            log.info("Using custom index.html from: {}", externalIndexPath);
            this.cachedIndexHtml = processIndexHtml();
            this.indexHtmlExists = true;
            this.useExternalIndexHtml = true;
            return;
        }

        // Fall back to classpath index.html
        ClassPathResource resource = new ClassPathResource("static/index.html");
        if (resource.exists()) {
            this.cachedIndexHtml = processIndexHtml();
            this.indexHtmlExists = true;
            this.useExternalIndexHtml = false;
            return;
        }

        // Neither external nor classpath index.html exists - cache fallback once
        this.cachedIndexHtml = buildFallbackHtml();
        this.cachedCallbackHtml = buildCallbackHtml();
        this.indexHtmlExists = true;
        this.useExternalIndexHtml = false;
        this.loggedMissingIndex = true;
        log.warn(
                "index.html not found in classpath or custom path; using lightweight fallback page");
    }

    private String processIndexHtml() {
        try {
            Resource resource = getIndexHtmlResource();

            if (!resource.exists()) {
                if (!loggedMissingIndex) {
                    log.warn("index.html not found, using lightweight fallback page");
                    loggedMissingIndex = true;
                }
                return buildFallbackHtml();
            }

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
        } catch (Exception ex) {
            if (!loggedMissingIndex) {
                log.warn("index.html not found, using lightweight fallback page", ex);
                loggedMissingIndex = true;
            }
            return buildFallbackHtml();
        }
    }

    private Resource getIndexHtmlResource() {
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
    public ResponseEntity<String> serveIndexHtml(HttpServletRequest request) {
        try {
            if (indexHtmlExists && cachedIndexHtml != null) {
                return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(cachedIndexHtml);
            }
            // Fallback: process on each request (dev mode or cache failed)
            return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(processIndexHtml());
        } catch (Exception ex) {
            log.error("Failed to serve index.html, returning fallback", ex);
            return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(buildFallbackHtml());
        }
    }

    @GetMapping(value = "/auth/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> serveAuthCallback() {
        if (cachedCallbackHtml == null) {
            cachedCallbackHtml = buildCallbackHtml();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(cachedCallbackHtml);
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

    private String buildFallbackHtml() {
        String baseUrl = contextPath.endsWith("/") ? contextPath : contextPath + "/";
        String serverUrl = "(window.location.origin + '" + baseUrl + "')";
        return """
                <!doctype html>
                <html>
                  <head>
                    <meta charset="utf-8" />
                    <base href="%s" />
                    <title>Stirling PDF</title>
                    <script>
                      // Minimal handler for SSO callback when index.html is missing (desktop fallback)
                      (function() {
                        const baseUrl = '%s';
                        window.STIRLING_PDF_API_BASE_URL = baseUrl;
                        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                        const searchParams = new URLSearchParams(window.location.search);
                        const token = hashParams.get('access_token') || hashParams.get('token') || searchParams.get('access_token');
                        const isDesktopPopup = !!window.opener;
                        const serverUrl = %s;

                        if (token) {
                          try { localStorage.setItem('stirling_jwt', token); } catch (_) {}
                          try { window.dispatchEvent(new Event('jwt-available')); } catch (_) {}

                          if (isDesktopPopup) {
                            try { window.opener.postMessage({ type: 'stirling-desktop-sso', token }, '*'); } catch (_) {}
                            setTimeout(() => { try { window.close(); } catch (_) {} }, 150);
                            return;
                          }

                          // Trigger deep link back to desktop app with token + server info
                          try {
                            const deepLink = `stirlingpdf://auth/sso-complete?server=${encodeURIComponent(serverUrl)}#access_token=${encodeURIComponent(token)}&type=sso-selfhosted`;
                            window.location.href = deepLink;
                            return;
                          } catch (_) {
                            // ignore deep link errors
                          }
                        }

                        // No redirect to avoid loops when index.html is missing
                      })();
                    </script>
                  </head>
                  <body>
                    <p>Stirling PDF is running.</p>
                  </body>
                </html>
                """
                .formatted(baseUrl, baseUrl, serverUrl);
    }

    private String buildCallbackHtml() {
        String baseUrl = contextPath.endsWith("/") ? contextPath : contextPath + "/";
        String serverUrl = "(window.location.origin + '" + baseUrl + "')";
        return """
                <!doctype html>
                <html>
                  <head>
                    <meta charset="utf-8" />
                    <base href="%s" />
                    <title>Authentication Complete</title>
                    <script>
                      (function() {
                        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                        const searchParams = new URLSearchParams(window.location.search);
                        const token = hashParams.get('access_token') || hashParams.get('token') || searchParams.get('access_token');
                        const isDesktopPopup = !!window.opener;
                        const serverUrl = %s;

                        if (token) {
                          try { localStorage.setItem('stirling_jwt', token); } catch (_) {}
                          try { window.dispatchEvent(new Event('jwt-available')); } catch (_) {}

                          if (isDesktopPopup) {
                            try { window.opener.postMessage({ type: 'stirling-desktop-sso', token }, '*'); } catch (_) {}
                            setTimeout(() => { try { window.close(); } catch (_) {} }, 150);
                            return;
                          }

                          try {
                            const deepLink = `stirlingpdf://auth/sso-complete?server=${encodeURIComponent(serverUrl)}#access_token=${encodeURIComponent(token)}&type=sso-selfhosted`;
                            window.location.href = deepLink;
                            return;
                          } catch (_) {
                            // ignore deep link errors
                          }
                        }
                      })();
                    </script>
                  </head>
                  <body>
                    <p>Authentication complete. You can close this window.</p>
                  </body>
                </html>
                """
                .formatted(baseUrl, serverUrl);
    }
}
