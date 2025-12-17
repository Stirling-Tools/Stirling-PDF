package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;

@Controller
public class ReactRoutingController {

    @Value("${server.servlet.context-path:/}")
    private String contextPath;

    private String cachedIndexHtml;
    private boolean indexHtmlExists = false;

    @PostConstruct
    public void init() {
        // Only cache if index.html exists (production builds)
        ClassPathResource resource = new ClassPathResource("static/index.html");
        if (resource.exists()) {
            try {
                this.cachedIndexHtml = processIndexHtml();
                this.indexHtmlExists = true;
            } catch (IOException e) {
                // Failed to cache, will process on each request
                this.indexHtmlExists = false;
            }
        }
    }

    private String processIndexHtml() throws IOException {
        ClassPathResource resource = new ClassPathResource("static/index.html");

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
