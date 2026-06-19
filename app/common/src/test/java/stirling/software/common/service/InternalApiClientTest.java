package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;

import org.eclipse.microprofile.config.Config;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.enterprise.inject.Instance;
import jakarta.servlet.ServletContext;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;

/**
 * MIGRATION (Spring -> Quarkus): {@code InternalApiClient} was rebuilt on {@code
 * java.net.http.HttpClient}. The constructor now takes {@code Instance<UserServiceInterface>} and
 * an MicroProfile {@code Config} (was a raw {@code UserServiceInterface} + Spring {@code
 * Environment}), the request body is {@code Map<String,List<Object>>} (was {@code MultiValueMap})
 * and the result is a JAX-RS {@code Response} (was {@code ResponseEntity<Resource>}).
 *
 * <p>The previous HTTP-dispatch tests intercepted Spring's {@code RestTemplate} via {@code
 * mockConstruction}; the new client builds a {@code java.net.http.HttpClient} internally with no
 * equivalent unit-level seam, so those cases cannot be ported as plain unit tests and are dropped.
 * The endpoint-allowlist / URL-validation tests below are preserved unchanged in intent - they
 * still exercise the current {@code validateUrl}/{@code ALLOWED_ENDPOINT_PATH} guard, which throws
 * {@code SecurityException} before any network I/O.
 */
@ExtendWith(MockitoExtension.class)
class InternalApiClientTest {

    @Mock ServletContext servletContext;
    @Mock Instance<UserServiceInterface> userService;
    @Mock TempFileManager tempFileManager;
    @Mock Config config;

    InternalApiClient client;

    @BeforeEach
    void setUp() {
        lenient().when(servletContext.getContextPath()).thenReturn("");
        lenient().when(userService.isResolvable()).thenReturn(false);
        client = newClient();
    }

    private InternalApiClient newClient() {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        return new InternalApiClient(
                servletContext, userService, tempFileManager, config, applicationProperties);
    }

    private static Map<String, List<Object>> emptyBody() {
        return new java.util.LinkedHashMap<>();
    }

    @Test
    void postRejectsDisallowedPath() {
        assertThrows(
                SecurityException.class, () -> client.post("/api/v1/admin/settings", emptyBody()));
    }

    @Test
    void postRejectsAiEndpointsOutsideToolsSubnamespace() {
        // /api/v1/ai/orchestrate and other non-tool AI endpoints are not internally
        // dispatchable. Only /api/v1/ai/tools/* and the general/misc/security/convert/filter
        // namespaces are on the allowlist - letting a plan step re-enter /orchestrate would
        // introduce recursion risk.
        assertThrows(
                SecurityException.class, () -> client.post("/api/v1/ai/orchestrate", emptyBody()));
    }

    @Test
    void postRejectsPathTraversal() {
        assertThrows(
                SecurityException.class,
                () -> client.post("/api/v1/misc/../../actuator/env", emptyBody()));
    }

    @Test
    void postRejectsUrlEncodedCharacters() {
        assertThrows(
                SecurityException.class,
                () -> client.post("/api/v1/misc/%2e%2e/actuator", emptyBody()));
    }

    @Test
    void postRejectsQueryString() {
        assertThrows(
                SecurityException.class,
                () -> client.post("/api/v1/misc/compress-pdf?redirect=evil", emptyBody()));
    }

    @Test
    void postRejectsEmptySegment() {
        assertThrows(SecurityException.class, () -> client.post("/api/v1/misc//foo", emptyBody()));
    }

    @Test
    void postRejectsTrailingSlash() {
        assertThrows(SecurityException.class, () -> client.post("/api/v1/misc/foo/", emptyBody()));
    }

    @Test
    void postRejectsNullPath() {
        assertThrows(SecurityException.class, () -> client.post(null, emptyBody()));
    }
}
