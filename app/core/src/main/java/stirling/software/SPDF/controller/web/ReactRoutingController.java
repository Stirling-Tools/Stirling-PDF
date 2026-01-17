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
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.util.JavaScriptUtils;

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

        // Always initialize callback HTML (used for OAuth desktop flow)
        this.cachedCallbackHtml = buildCallbackHtml();

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
    public ResponseEntity<String> serveAuthCallback(HttpServletRequest request) {
        return serveIndexHtml(request);
    }

    @GetMapping(value = "/auth/callback/tauri", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> serveTauriAuthCallback(HttpServletRequest request) {
        // cachedCallbackHtml is always initialized in @PostConstruct
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

        // Escape for HTML attribute context
        String escapedBaseUrlHtml = HtmlUtils.htmlEscape(baseUrl);

        // Escape for JavaScript string context
        String escapedBaseUrlJs = JavaScriptUtils.javaScriptEscape(baseUrl);

        String serverUrl = "(window.location.origin + '" + escapedBaseUrlJs + "')";
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
                        const serverUrl = %s;

                        if (token) {
                          // Extract nonce from URL to send back to desktop app for validation
                          const nonceFromUrl = hashParams.get('nonce') || searchParams.get('nonce');

                          console.log('[Fallback Auth] Token received, sending to desktop app via deep link');

                          // Send token + nonce via deep link to desktop app
                          // Desktop app will validate nonce before accepting token
                          try {
                            const encodedToken = encodeURIComponent(token);
                            const encodedServer = encodeURIComponent(serverUrl);
                            const encodedNonce = nonceFromUrl ? encodeURIComponent(nonceFromUrl) : '';
                            const deepLink = `stirlingpdf://auth/sso-complete?server=${encodedServer}#access_token=${encodedToken}&nonce=${encodedNonce}&type=sso-selfhosted`;
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
                .formatted(escapedBaseUrlHtml, escapedBaseUrlJs, serverUrl);
    }

    private String buildCallbackHtml() {
        String baseUrl = contextPath.endsWith("/") ? contextPath : contextPath + "/";

        // Escape for HTML attribute context
        String escapedBaseUrlHtml = HtmlUtils.htmlEscape(baseUrl);

        // Escape for JavaScript string context
        String escapedBaseUrlJs = JavaScriptUtils.javaScriptEscape(baseUrl);

        String serverUrl = "(window.location.origin + '" + escapedBaseUrlJs + "')";
        return """
                <!doctype html>
                <html>
                  <head>
                    <meta charset="utf-8" />
                    <base href="%s" />
                    <title>Authentication Complete</title>
                    <style>
                      * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                      }

                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        text-align: center;
                        padding: 50px 20px;
                        background: #f5f5f5;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                      }

                      .container {
                        background: #ffffff;
                        border-radius: 12px;
                        padding: 40px;
                        max-width: 420px;
                        width: 100%%;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        border: 1px solid #e5e7eb;
                        color: #1a1a1a;
                      }

                      .icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                        color: #2e7d32;
                      }

                      .icon.error {
                        color: #d32f2f;
                      }

                      h1 {
                        font-size: 24px;
                        font-weight: 600;
                        margin-bottom: 12px;
                        color: #1a1a1a;
                      }

                      p {
                        color: #666;
                        line-height: 1.6;
                        font-size: 15px;
                      }

                      .error-details {
                        background: #ffebee;
                        border: 1px solid #ffcdd2;
                        padding: 16px;
                        border-radius: 8px;
                        margin-top: 20px;
                        font-size: 14px;
                        color: #c62828;
                        word-break: break-word;
                        text-align: left;
                        line-height: 1.5;
                        display: none;
                      }

                      @media (prefers-color-scheme: dark) {
                        body {
                          background: #1a1a1a;
                          color: #e0e0e0;
                        }

                        .container {
                          background: #2d2d2d;
                          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                          border-color: #374151;
                          color: #e5e7eb;
                        }

                        .icon {
                          color: #66bb6a;
                        }

                        .icon.error {
                          color: #ef5350;
                        }

                        h1 {
                          color: #f5f5f5;
                        }

                        p {
                          color: #b0b0b0;
                        }

                        .error-details {
                          background: #3d2020;
                          border: 1px solid #5d3030;
                          color: #ef9a9a;
                        }
                      }

                      @media (max-width: 480px) {
                        body {
                          padding: 20px 16px;
                        }

                        .container {
                          padding: 32px 24px;
                        }

                        h1 {
                          font-size: 20px;
                        }

                        .icon {
                          font-size: 40px;
                        }
                      }
                    </style>
                    <script>
                      (function() {
                        const run = () => {
                          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                          const searchParams = new URLSearchParams(window.location.search);
                          const token = hashParams.get('access_token') || hashParams.get('token') || searchParams.get('access_token');
                          const errorCode = searchParams.get('errorOAuth')
                            || searchParams.get('error')
                            || hashParams.get('error')
                            || searchParams.get('error_description')
                            || hashParams.get('error_description');
                          const serverUrl = %s;
                          const iconEl = document.getElementById('auth-icon');
                          const titleEl = document.getElementById('auth-title');
                          const messageEl = document.getElementById('auth-message');
                          const detailsEl = document.getElementById('auth-error-details');

                          const sendDeepLink = (type, value, key) => {
                            try {
                              const encodedValue = encodeURIComponent(value || '');
                              const encodedServer = encodeURIComponent(serverUrl);
                              const hashKey = key || 'access_token';
                              const deepLink = `stirlingpdf://auth/sso-complete?server=${encodedServer}#${hashKey}=${encodedValue}&type=${type}`;
                              window.location.href = deepLink;
                            } catch (_) {
                              // ignore deep link errors
                            }
                          };

                          const showError = (message, details) => {
                            if (iconEl) {
                              iconEl.textContent = '✗';
                              iconEl.classList.add('error');
                            }
                            if (titleEl) {
                              titleEl.textContent = 'Authentication failed';
                            }
                            if (messageEl) {
                              messageEl.textContent = message;
                            }
                            if (detailsEl && details) {
                              detailsEl.textContent = details;
                              detailsEl.style.display = 'block';
                            }
                          };

                          if (token) {
                            // Extract nonce from URL to send back to desktop app for validation
                            // (System browser doesn't have access to desktop app's sessionStorage)
                            const nonceFromUrl = hashParams.get('nonce') || searchParams.get('nonce');

                            console.log('[Auth Callback] Token received, sending to desktop app via deep link');

                            // Send token + nonce via deep link to desktop app
                            // Desktop app will validate nonce before accepting token
                            setTimeout(() => {
                              try {
                                const encodedToken = encodeURIComponent(token);
                                const encodedServer = encodeURIComponent(serverUrl);
                                const encodedNonce = nonceFromUrl ? encodeURIComponent(nonceFromUrl) : '';
                                const deepLink = `stirlingpdf://auth/sso-complete?server=${encodedServer}#access_token=${encodedToken}&nonce=${encodedNonce}&type=sso-selfhosted`;
                                window.location.href = deepLink;
                              } catch (err) {
                                console.error('[Auth Callback] Failed to trigger deep link:', err);
                              }
                            }, 200);

                            return;
                          }

                          if (errorCode) {
                            const isCancelled = errorCode === 'access_denied';
                            sendDeepLink('sso-error', errorCode, 'error');
                            showError(
                              isCancelled
                                ? 'Authentication was cancelled. You can close this window and return to the app.'
                                : 'Authentication was not successful. You can close this window and return to the app.',
                              errorCode
                            );
                            return;
                          }

                          showError(
                            'Authentication did not complete. You can close this window and try again.',
                            'missing_token'
                          );
                        };

                        if (document.readyState === 'loading') {
                          document.addEventListener('DOMContentLoaded', run);
                        } else {
                          run();
                        }
                      })();
                    </script>
                  </head>
                  <body>
                    <div class="container">
                      <div class="icon" id="auth-icon">&#10003;</div>
                      <h1 id="auth-title">Authentication complete</h1>
                      <p id="auth-message">You can close this window and return to Stirling PDF.</p>
                      <div class="error-details" id="auth-error-details"></div>
                    </div>
                  </body>
                </html>
                """
                .formatted(escapedBaseUrlHtml, serverUrl);
    }
}
