package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

class ReactRoutingControllerTest {

    private ReactRoutingController controller;
    private HttpServletRequest request;

    @BeforeEach
    void setUp() throws Exception {
        controller = new ReactRoutingController();
        request = mock(HttpServletRequest.class);

        // Set contextPath via reflection (normally injected by Spring @Value)
        setField("contextPath", "/");
    }

    private void setField(String name, Object value) throws Exception {
        Field field = ReactRoutingController.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(controller, value);
    }

    // --- init() and serveIndexHtml with fallback ---

    @Test
    void init_noIndexHtml_usesFallback() {
        // In test env, no classpath static/index.html and no external file
        controller.init();

        ResponseEntity<String> response = controller.serveIndexHtml(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("Stirling PDF"));
    }

    @Test
    void serveIndexHtml_returnsCachedContent() {
        controller.init();

        ResponseEntity<String> response1 = controller.serveIndexHtml(request);
        ResponseEntity<String> response2 = controller.serveIndexHtml(request);

        // Both should return the same cached content
        assertEquals(response1.getBody(), response2.getBody());
    }

    @Test
    void serveIndexHtml_contentTypeIsHtml() {
        controller.init();

        ResponseEntity<String> response = controller.serveIndexHtml(request);

        assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
    }

    // --- auth callback ---

    @Test
    void serveAuthCallback_returnsIndexHtml() {
        controller.init();

        ResponseEntity<String> response = controller.serveAuthCallback(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("Stirling PDF"));
    }

    @Test
    void serveShareLinkPage_returnsIndexHtml() {
        controller.init();

        ResponseEntity<String> response = controller.serveShareLinkPage(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("Stirling PDF"));
    }

    // --- tauri auth callback ---

    @Test
    void serveTauriAuthCallback_returnsCallbackHtml() {
        controller.init();

        ResponseEntity<String> response = controller.serveTauriAuthCallback(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("Authentication"));
    }

    @Test
    void serveTauriAuthCallback_containsDeepLinkScript() {
        controller.init();

        ResponseEntity<String> response = controller.serveTauriAuthCallback(request);

        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("stirlingpdf://auth/sso-complete"));
    }

    // --- forwarding routes ---

    @Test
    void forwardRootPaths_servesIndexHtml() throws Exception {
        controller.init();

        ResponseEntity<String> response = controller.forwardRootPaths(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    void forwardNestedPaths_servesIndexHtml() throws Exception {
        controller.init();

        ResponseEntity<String> response = controller.forwardNestedPaths(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    // --- context path handling ---

    @Test
    void fallbackHtml_contextPathWithoutTrailingSlash_addsSlash() throws Exception {
        setField("contextPath", "/myapp");
        controller.init();

        ResponseEntity<String> response = controller.serveIndexHtml(request);

        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("/myapp/"));
    }

    @Test
    void fallbackHtml_contextPathWithTrailingSlash_preserves() throws Exception {
        setField("contextPath", "/myapp/");
        controller.init();

        ResponseEntity<String> response = controller.serveIndexHtml(request);

        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("/myapp/"));
    }

    @Test
    void callbackHtml_containsBaseHref() {
        controller.init();

        ResponseEntity<String> response = controller.serveTauriAuthCallback(request);

        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("<base href="));
    }

    // --- prerendered per-route pages (OG/social-preview) ---

    private HttpServletRequest requestFor(String uri) {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getRequestURI()).thenReturn(uri);
        when(req.getContextPath()).thenReturn("");
        return req;
    }

    @Test
    void forwardRootPaths_servesPrerenderedPageWithOgTags() throws Exception {
        // src/test/resources/static/compress.html stands in for a build-time prerendered page
        controller.init();

        ResponseEntity<String> response = controller.forwardRootPaths(requestFor("/compress"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("<title>Compress - Stirling PDF</title>"), "per-route title");
        assertTrue(
                body.contains("property=\"og:image\" content=\"/og_images/compress.png\""),
                "per-route og:image");
        // The prerendered file is processed like index.html: %BASE_URL% replaced and
        // the API base-url script injected.
        assertTrue(body.contains("<base href=\"/\""), "base href processed");
        assertTrue(body.contains("window.STIRLING_PDF_API_BASE_URL"), "context script injected");
    }

    @Test
    void forwardRootPaths_unknownRoute_fallsBackToShellWithoutOg() throws Exception {
        controller.init();

        ResponseEntity<String> response = controller.forwardRootPaths(requestFor("/no-such-tool"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        String body = response.getBody();
        assertNotNull(body);
        assertFalse(body.contains("og:image"), "no per-tool OG when there is no prerendered page");
    }

    @Test
    void forwardNestedPaths_servesNestedPrerenderedSettingsPage() throws Exception {
        // src/test/resources/static/settings/people.html stands in for a prerendered
        // settings section.
        controller.init();

        ResponseEntity<String> response =
                controller.forwardNestedPaths(requestFor("/settings/people"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("<title>People Settings - Stirling PDF</title>"));
        assertTrue(body.contains("window.STIRLING_PDF_API_BASE_URL"), "processed like index");
    }

    @Test
    void forwardNestedPaths_dynamicRoute_fallsBackToShell() throws Exception {
        controller.init();

        ResponseEntity<String> response =
                controller.forwardNestedPaths(requestFor("/workflow/sign"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }
}
