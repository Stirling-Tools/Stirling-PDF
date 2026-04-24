package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;

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
        client = new AiEngineClient(applicationProperties, httpClient);
    }

    @Test
    void postWrapsConnectIOExceptionAsServiceUnavailable() throws Exception {
        ConnectException cause = new ConnectException("Connection refused");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}"));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertSame(cause, ex.getCause(), "Original cause should be preserved for diagnostics");
    }

    @Test
    void postWrapsTimeoutAsGatewayTimeout() throws Exception {
        HttpTimeoutException cause = new HttpTimeoutException("request timed out");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}"));

        assertEquals(HttpStatus.GATEWAY_TIMEOUT, ex.getStatusCode());
        assertSame(cause, ex.getCause());
    }

    @Test
    void getWrapsGenericIOExceptionAsServiceUnavailable() throws Exception {
        IOException cause = new IOException("socket reset");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.get("/x"));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    void postShortCircuitsWhenEngineDisabled() {
        applicationProperties.getAiEngine().setEnabled(false);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.post("/x", "{}"));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }
}
