package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

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
}
