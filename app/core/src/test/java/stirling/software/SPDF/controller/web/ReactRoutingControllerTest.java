package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.function.EntityResponse;
import org.springframework.web.servlet.function.HandlerFunction;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerRequest;
import org.springframework.web.servlet.function.ServerResponse;
import org.springframework.web.util.ServletRequestPathUtils;

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

    // --- mobile scanner route ---

    @Test
    void serveMobileScanner_webMode_servesSpaNotUploadPage() {
        controller.init();

        ResponseEntity<String> response = controller.serveMobileScanner(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        String body = response.getBody();
        assertNotNull(body);
        assertFalse(body.contains("Take Photo"));
    }

    @Test
    void serveMobileScanner_desktopMode_servesStaticUploadPage() {
        controller.init();
        System.setProperty("STIRLING_PDF_TAURI_MODE", "true");
        try {
            ResponseEntity<String> response = controller.serveMobileScanner(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
            String body = response.getBody();
            assertNotNull(body);
            assertTrue(body.contains("Mobile Upload"));
            assertTrue(body.contains("Take Photo"));
        } finally {
            System.clearProperty("STIRLING_PDF_TAURI_MODE");
        }
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

    // --- deep-link SPA fallback (router function) ---

    @Test
    void isSpaFallbackRoute_acceptsDeepSpaPaths() {
        assertTrue(ReactRoutingController.isSpaFallbackRoute("/processor/pipelines/new"));
        assertTrue(ReactRoutingController.isSpaFallbackRoute("/processor/pipelines/123/runs/456"));
        assertTrue(ReactRoutingController.isSpaFallbackRoute("/workflow/sign/some-token"));
        assertTrue(ReactRoutingController.isSpaFallbackRoute("/processor/pipelines/new/"));
        // "pipelines" must not be swallowed by the "pipeline" exclusion
        assertTrue(ReactRoutingController.isSpaFallbackRoute("/pipelines"));
    }

    @Test
    void isSpaFallbackRoute_rejectsBackendStaticAndFilePaths() {
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/api/v1/some/endpoint"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/pipeline"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/pipeline/anything"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/assets/deep/path"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/processor/pipelines/file.js"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/branding/sub/logo.png"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute("/"));
        assertFalse(ReactRoutingController.isSpaFallbackRoute(""));
        assertFalse(ReactRoutingController.isSpaFallbackRoute(null));
    }

    @Test
    void spaDeepLinkFallback_servesIndexForDeepRoute() throws Exception {
        controller.init();
        RouterFunction<ServerResponse> router = controller.spaDeepLinkFallback();

        ServerRequest deepRequest = serverRequest("GET", "/processor/pipelines/new");
        Optional<HandlerFunction<ServerResponse>> handler = router.route(deepRequest);
        assertTrue(handler.isPresent());

        ServerResponse response = handler.get().handle(deepRequest);
        assertEquals(HttpStatus.OK, response.statusCode());
        assertInstanceOf(EntityResponse.class, response);
        Object body = ((EntityResponse<?>) response).entity();
        assertTrue(body.toString().contains("Stirling PDF"));
    }

    @Test
    void spaDeepLinkFallback_ignoresApiFilesAndNonGet() {
        controller.init();
        RouterFunction<ServerResponse> router = controller.spaDeepLinkFallback();

        assertTrue(router.route(serverRequest("GET", "/api/v1/policies/run")).isEmpty());
        assertTrue(router.route(serverRequest("GET", "/branding/sub/logo.png")).isEmpty());
        assertTrue(router.route(serverRequest("POST", "/processor/pipelines/new")).isEmpty());
    }

    private static ServerRequest serverRequest(String method, String uri) {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest(method, uri);
        ServletRequestPathUtils.parseAndCache(servletRequest);
        return ServerRequest.create(servletRequest, List.of(new StringHttpMessageConverter()));
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
