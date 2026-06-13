package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.regex.Pattern;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.io.ClassPathResource;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;

// NOTE: SPA forwarding controller. The forwarding routes below cover the SPA "clean URL" paths the
// app historically matched with Spring's negative-lookahead regex route. RESTEasy Reactive DOES
// support per-segment regex constraints in @Path templates, so each catch-all segment is
// constrained to {seg:[^/.]+} - one path segment that contains no '.'. This mirrors Spring's
// "match only dot-less segments" rule: requests for real files (which always carry an extension,
// e.g. /assets/index-abc.js, /sw.js, /manifest.json) do NOT match these templates and therefore
// fall through to Quarkus' static-resource handler (META-INF/resources), which serves them with the
// correct Content-Type. This precedence detail is critical: a matching JAX-RS route is answered
// BEFORE the static handler runs, so an unconstrained {path} catch-all would shadow every asset and
// return index.html (text/html) for .js/.css - exactly the "white screen / wrong MIME" bug. Only
// single- and two-segment SPA routes are matched here; a deeper dot-less SPA route would need an
// explicit template or a low-priority Vert.x fallback route (none currently required).
@Path("")
@ApplicationScoped
public class ReactRoutingController {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(ReactRoutingController.class);
    private static final Pattern BASE_HREF_PATTERN =
            Pattern.compile("<base href=\\\"[^\\\"]*\\\"\\s*/?>");

    // server.servlet.context-path has no direct Quarkus equivalent (it maps to
    // quarkus.http.root-path
    // at build time). Kept as a configurable property so the index.html base href rewrite still
    // works.
    // TODO: Migration required - consider sourcing this from quarkus.http.root-path instead.
    @ConfigProperty(name = "server.servlet.context-path", defaultValue = "/")
    String contextPath;

    private String cachedIndexHtml;
    private String cachedCallbackHtml;
    private boolean indexHtmlExists = false;
    private boolean useExternalIndexHtml = false;
    private boolean loggedMissingIndex = false;
    private String cachedSaasLandingHtml;
    private boolean saasLandingExists = false;

    @PostConstruct
    public void init() {
        log.info("Static files custom path: {}", InstallationPathConfig.getStaticPath());

        // Always initialize callback HTML (used for OAuth desktop flow)
        this.cachedCallbackHtml = buildCallbackHtml();

        // SaaS landing page: only present on the classpath when the :saas module is bundled
        // (app/saas/src/main/resources/static/saas-landing.html). When present it replaces the
        // root page so the SaaS API host shows its own landing instead of the OSS API-only page.
        ClassPathResource saasLanding = new ClassPathResource("static/saas-landing.html");
        if (saasLanding.exists()) {
            try (InputStream in = saasLanding.getInputStream()) {
                this.cachedSaasLandingHtml = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                this.saasLandingExists = true;
                log.info("SaaS landing page detected; serving it at '/' and '/index.html'");
            } catch (Exception ex) {
                log.warn("Failed to read saas-landing.html; falling back to index.html", ex);
            }
        }

        // Check for external index.html first (customFiles/static/)
        java.nio.file.Path externalIndexPath =
                Paths.get(InstallationPathConfig.getStaticPath(), "index.html");
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
                        BASE_HREF_PATTERN
                                .matcher(html)
                                .replaceFirst("<base href=\\\"" + baseUrl + "\\\" />");

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
        java.nio.file.Path externalIndexPath =
                Paths.get(InstallationPathConfig.getStaticPath(), "index.html");
        if (Files.exists(externalIndexPath) && Files.isReadable(externalIndexPath)) {
            return new FileSystemResource(externalIndexPath.toFile());
        }

        // Fall back to classpath
        return new ClassPathResource("static/index.html");
    }

    @GET
    @Path("/")
    @Produces(MediaType.TEXT_HTML)
    public Response serveRootPage() {
        // Swap ONLY the root page for SaaS. SPA entry points that delegate to serveIndexHtml
        // (/auth/callback, /share/{token}, forwarded routes) keep serving the normal shell.
        if (saasLandingExists && cachedSaasLandingHtml != null) {
            return Response.ok(cachedSaasLandingHtml)
                    .cacheControl(noCacheMustRevalidate())
                    .type(MediaType.TEXT_HTML)
                    .build();
        }
        return serveIndexHtml();
    }

    @GET
    @Path("/index.html")
    @Produces(MediaType.TEXT_HTML)
    public Response serveIndexHtmlPage() {
        if (saasLandingExists && cachedSaasLandingHtml != null) {
            return Response.ok(cachedSaasLandingHtml)
                    .cacheControl(noCacheMustRevalidate())
                    .type(MediaType.TEXT_HTML)
                    .build();
        }
        return serveIndexHtml();
    }

    public Response serveIndexHtml() {
        try {
            if (indexHtmlExists && cachedIndexHtml != null) {
                return Response.ok(cachedIndexHtml)
                        .cacheControl(noCacheMustRevalidate())
                        .type(MediaType.TEXT_HTML)
                        .build();
            }
            // Fallback: process on each request (dev mode or cache failed)
            return Response.ok(processIndexHtml())
                    .cacheControl(noCacheMustRevalidate())
                    .type(MediaType.TEXT_HTML)
                    .build();
        } catch (Exception ex) {
            log.error("Failed to serve index.html, returning fallback", ex);
            return Response.ok(buildFallbackHtml())
                    .cacheControl(noCacheMustRevalidate())
                    .type(MediaType.TEXT_HTML)
                    .build();
        }
    }

    private static CacheControl noCacheMustRevalidate() {
        CacheControl cc = new CacheControl();
        cc.setNoCache(true);
        cc.setMustRevalidate(true);
        return cc;
    }

    @GET
    @Path("/auth/callback")
    @Produces(MediaType.TEXT_HTML)
    public Response serveAuthCallback() {
        return serveIndexHtml();
    }

    @GET
    @Path("/share/{token}")
    @Produces(MediaType.TEXT_HTML)
    public Response serveShareLinkPage(@PathParam("token") String token) {
        return serveIndexHtml();
    }

    @GET
    @Path("/auth/callback/tauri")
    @Produces(MediaType.TEXT_HTML)
    public Response serveTauriAuthCallback() {
        // cachedCallbackHtml is always initialized in @PostConstruct
        return Response.ok(cachedCallbackHtml).type(MediaType.TEXT_HTML).build();
    }

    // `files` was historically a backend static-asset directory and was therefore
    // in the exclusion list - removing it lets /files and /files/<folder-uuid>
    // forward to the SPA index.html, which is what FileManagerView expects.
    // (Real storage endpoints live under /api/v1/storage/files, matched by their own JAX-RS
    // resources which take precedence over this catch-all.)
    //
    // The {path:[^/.]+} constraint matches a single dot-less segment, mirroring the original Spring
    // route's "no '.'" rule. Dot-bearing paths (real static files such as /favicon.ico,
    // /manifest.json, /sw.js) do not match and fall through to the static-resource handler.
    @GET
    @Path("/{path:[^/.]+}")
    @Produces(MediaType.TEXT_HTML)
    public Response forwardRootPaths(@PathParam("path") String path) throws IOException {
        return serveIndexHtml();
    }

    // Two-segment SPA routes (e.g. /tools/merge, /files/<uuid>). Both segments are constrained to
    // be
    // dot-less, so asset requests like /assets/index-abc.js (subpath carries a '.') fall through to
    // the static-resource handler instead of being answered with index.html.
    @GET
    @Path("/{path:[^/.]+}/{subpath:[^/.]+}")
    @Produces(MediaType.TEXT_HTML)
    public Response forwardNestedPaths(
            @PathParam("path") String path, @PathParam("subpath") String subpath)
            throws IOException {
        return serveIndexHtml();
    }

    private String buildFallbackHtml() {
        String baseUrl = contextPath.endsWith("/") ? contextPath : contextPath + "/";

        // Escape for HTML attribute context
        String escapedBaseUrlHtml = htmlEscape(baseUrl);

        // Escape for JavaScript string context
        String escapedBaseUrlJs = javaScriptEscape(baseUrl);

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
        String escapedBaseUrlHtml = htmlEscape(baseUrl);

        // Escape for JavaScript string context
        String escapedBaseUrlJs = javaScriptEscape(baseUrl);

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

    // Replacements for Spring's org.springframework.web.util.HtmlUtils.htmlEscape and
    // org.springframework.web.util.JavaScriptUtils.javaScriptEscape (no Quarkus/Jakarta equivalent
    // and commons-text is not a dependency). These mirror the subset of behavior required for the
    // context-path string injected into the fallback/callback HTML.
    private static String htmlEscape(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    private static String javaScriptEscape(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\'' -> sb.append("\\'");
                case '\\' -> sb.append("\\\\");
                case '/' -> sb.append("\\/");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '<' -> sb.append("\\u003C");
                case '>' -> sb.append("\\u003E");
                case '&' -> sb.append("\\u0026");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
