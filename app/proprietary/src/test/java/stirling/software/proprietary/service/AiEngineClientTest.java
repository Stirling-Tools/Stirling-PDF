package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.billing.AiCallRecord;

/**
 * Verifies that AiEngineClient surfaces network-layer failures as structured HTTP statuses so every
 * AI tool caller sees a consistent, meaningful error rather than a raw 500.
 */
class AiEngineClientTest {

    private ApplicationProperties applicationProperties;
    private HttpClient httpClient;
    private AiEngineClient client;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getAiEngine().setEnabled(true);
        applicationProperties.getAiEngine().setUrl("http://localhost:5001");
        applicationProperties.getAiEngine().setTimeoutSeconds(5);
        httpClient = mock(HttpClient.class);
        client =
                new AiEngineClient(
                        applicationProperties,
                        httpClient,
                        AiEngineRouter.selfHosted(applicationProperties, null));
    }

    @Test
    void postWrapsConnectIOExceptionAsServiceUnavailable() throws Exception {
        ConnectException cause = new ConnectException("Connection refused");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}", null));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertSame(cause, ex.getCause(), "Original cause should be preserved for diagnostics");
    }

    @Test
    void postWrapsTimeoutAsGatewayTimeout() throws Exception {
        HttpTimeoutException cause = new HttpTimeoutException("request timed out");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}", null));

        assertEquals(HttpStatus.GATEWAY_TIMEOUT, ex.getStatusCode());
        assertSame(cause, ex.getCause());
    }

    @Test
    void getWrapsGenericIOExceptionAsServiceUnavailable() throws Exception {
        IOException cause = new IOException("socket reset");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.get("/x", null));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    void postShortCircuitsWhenEngineDisabled() {
        applicationProperties.getAiEngine().setEnabled(false);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}", null));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    @SuppressWarnings("unchecked")
    void anUpstreamUnauthorizedIsAboutOurCredentialsNotTheCallers() throws Exception {
        // Relayed as a 401 the frontend treats it as its own session expiring and reloads.
        HttpResponse<String> rejected = mock(HttpResponse.class);
        when(rejected.statusCode()).thenReturn(401);
        when(rejected.body()).thenReturn("");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(rejected);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.get("/x", null));

        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals(401, ((AiEngineClient.EngineRejectedCredentials) ex).upstreamStatus());
        assertEquals("AI engine rejected this server's credentials (HTTP 401)", ex.getReason());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aStreamedCallRecordsWhereItRanForTheMeter() throws Exception {
        HttpResponse<Stream<String>> streamed = mock(HttpResponse.class);
        when(streamed.statusCode()).thenReturn(200);
        when(streamed.body()).thenReturn(Stream.of("{\"event\":\"result\"}"));
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(streamed);
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            client.streamPost("/api/v1/orchestrator", "{}", null, line -> {});
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }

        assertTrue(AiCallRecord.ranLocally(request.getAttribute(AiCallRecord.attributeName())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void aClientErrorNamesItsStatusEvenWithAnEmptyBody() throws Exception {
        HttpResponse<String> unprocessable = mock(HttpResponse.class);
        when(unprocessable.statusCode()).thenReturn(422);
        when(unprocessable.body()).thenReturn("");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(unprocessable);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}", null));

        assertEquals(HttpStatus.UNPROCESSABLE_CONTENT, ex.getStatusCode());
        assertEquals("AI engine returned client error (HTTP 422)", ex.getReason());
    }

    @Test
    @SuppressWarnings("unchecked")
    void allVerbsSendEngineAuthHeaderWhenSecretConfigured() throws Exception {
        // Regression for the engine shared-secret hardening: every verb that hits a non-public
        // engine route (post/delete/get) must present X-Engine-Auth, or the route 401s once the
        // secret is set. delete() backs the logout-time RAG purge, so a miss silently leaks data.
        AiEngineClient secured =
                new AiEngineClient(
                        applicationProperties,
                        httpClient,
                        AiEngineRouter.selfHosted(applicationProperties, "top-secret"));
        HttpResponse<String> ok = mock(HttpResponse.class);
        when(ok.statusCode()).thenReturn(200);
        when(ok.body()).thenReturn("{}");
        org.mockito.ArgumentCaptor<java.net.http.HttpRequest> captor =
                org.mockito.ArgumentCaptor.forClass(java.net.http.HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class))).thenReturn(ok);

        secured.post("/api/v1/pdf-question", "{}", "alice");
        secured.delete("/api/v1/documents/by-owner", "alice");
        secured.get("/api/v1/x", "alice");

        for (java.net.http.HttpRequest req : captor.getAllValues()) {
            assertEquals(
                    "top-secret",
                    req.headers().firstValue("X-Engine-Auth").orElse(null),
                    req.method() + " must carry the engine shared secret");
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void noEngineAuthHeaderWhenSecretUnset() throws Exception {
        AiEngineClient noSecret =
                new AiEngineClient(
                        applicationProperties,
                        httpClient,
                        AiEngineRouter.selfHosted(applicationProperties, null));
        HttpResponse<String> ok = mock(HttpResponse.class);
        when(ok.statusCode()).thenReturn(200);
        when(ok.body()).thenReturn("{}");
        org.mockito.ArgumentCaptor<java.net.http.HttpRequest> captor =
                org.mockito.ArgumentCaptor.forClass(java.net.http.HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class))).thenReturn(ok);

        noSecret.delete("/api/v1/documents/by-owner", "alice");

        assertEquals(null, captor.getValue().headers().firstValue("X-Engine-Auth").orElse(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void getWithTimeoutPutsThatTimeoutOnTheRequest() throws Exception {
        HttpResponse<String> ok = mock(HttpResponse.class);
        when(ok.statusCode()).thenReturn(200);
        when(ok.body()).thenReturn("{}");
        org.mockito.ArgumentCaptor<java.net.http.HttpRequest> captor =
                org.mockito.ArgumentCaptor.forClass(java.net.http.HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class))).thenReturn(ok);

        client.get("/health", null, java.time.Duration.ofSeconds(2));
        client.get("/health", null);

        assertEquals(
                java.util.Optional.of(java.time.Duration.ofSeconds(2)),
                captor.getAllValues().get(0).timeout());
        assertEquals(
                java.util.Optional.of(java.time.Duration.ofSeconds(5)),
                captor.getAllValues().get(1).timeout(),
                "the two-argument get keeps the configured timeout");
    }
}
