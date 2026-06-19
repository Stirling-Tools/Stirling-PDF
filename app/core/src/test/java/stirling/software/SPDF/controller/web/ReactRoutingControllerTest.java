package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

class ReactRoutingControllerTest {

    private ReactRoutingController controller;

    @BeforeEach
    void setUp() throws Exception {
        controller = new ReactRoutingController();

        // Set contextPath via reflection (normally injected by @ConfigProperty)
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

        Response response = controller.serveIndexHtml();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.TEXT_HTML_TYPE, response.getMediaType());
        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("Stirling PDF"));
    }

    @Test
    void serveIndexHtml_returnsCachedContent() {
        controller.init();

        Response response1 = controller.serveIndexHtml();
        Response response2 = controller.serveIndexHtml();

        // Both should return the same cached content
        assertEquals(response1.getEntity(), response2.getEntity());
    }

    @Test
    void serveIndexHtml_contentTypeIsHtml() {
        controller.init();

        Response response = controller.serveIndexHtml();

        assertEquals(MediaType.TEXT_HTML_TYPE, response.getMediaType());
    }

    // --- auth callback ---

    @Test
    void serveAuthCallback_returnsIndexHtml() {
        controller.init();

        Response response = controller.serveAuthCallback();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("Stirling PDF"));
    }

    @Test
    void serveShareLinkPage_returnsIndexHtml() {
        controller.init();

        Response response = controller.serveShareLinkPage("token123");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.TEXT_HTML_TYPE, response.getMediaType());
        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("Stirling PDF"));
    }

    // --- tauri auth callback ---

    @Test
    void serveTauriAuthCallback_returnsCallbackHtml() {
        controller.init();

        Response response = controller.serveTauriAuthCallback();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.TEXT_HTML_TYPE, response.getMediaType());
        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("Authentication"));
    }

    @Test
    void serveTauriAuthCallback_containsDeepLinkScript() {
        controller.init();

        Response response = controller.serveTauriAuthCallback();

        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("stirlingpdf://auth/sso-complete"));
    }

    // --- forwarding routes ---

    @Test
    void forwardRootPaths_servesIndexHtml() throws Exception {
        controller.init();

        Response response = controller.forwardRootPaths("tools");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void forwardNestedPaths_servesIndexHtml() throws Exception {
        controller.init();

        Response response = controller.forwardNestedPaths("tools", "merge");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertNotNull(response.getEntity());
    }

    // --- context path handling ---

    @Test
    void fallbackHtml_contextPathWithoutTrailingSlash_addsSlash() throws Exception {
        setField("contextPath", "/myapp");
        controller.init();

        Response response = controller.serveIndexHtml();

        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("/myapp/"));
    }

    @Test
    void fallbackHtml_contextPathWithTrailingSlash_preserves() throws Exception {
        setField("contextPath", "/myapp/");
        controller.init();

        Response response = controller.serveIndexHtml();

        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("/myapp/"));
    }

    @Test
    void callbackHtml_containsBaseHref() {
        controller.init();

        Response response = controller.serveTauriAuthCallback();

        String body = (String) response.getEntity();
        assertNotNull(body);
        assertTrue(body.contains("<base href="));
    }
}
