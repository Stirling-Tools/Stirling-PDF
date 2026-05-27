package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;

class AiEngineClientTest {

    private static final String ENGINE_SECRET = "shared-engine-secret";

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
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
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

    // --- decorate() contract: X-Engine-Auth + X-User-Id stamping ---------------------------

    @Test
    void postStampsEngineAuthAndUserIdHeaders() throws Exception {
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);
        authenticateAs("alice");
        stubOkResponse();

        client.post("/x", "{}");

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-Engine-Auth")).contains(ENGINE_SECRET);
        assertThat(sent.headers().firstValue("X-User-Id")).contains("alice");
    }

    @Test
    void getStampsEngineAuthAndUserIdHeaders() throws Exception {
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);
        authenticateAs("bob");
        stubOkResponse();

        client.get("/x");

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-Engine-Auth")).contains(ENGINE_SECRET);
        assertThat(sent.headers().firstValue("X-User-Id")).contains("bob");
    }

    @Test
    void streamPostStampsEngineAuthAndUserIdHeaders() throws Exception {
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);
        applicationProperties.getAiEngine().setLongRunningTimeoutSeconds(60);
        authenticateAs("carol");
        @SuppressWarnings("unchecked")
        HttpResponse<Stream<String>> response =
                (HttpResponse<Stream<String>>) mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(Stream.empty());
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);

        client.streamPost("/stream", "{}", line -> {});

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-Engine-Auth")).contains(ENGINE_SECRET);
        assertThat(sent.headers().firstValue("X-User-Id")).contains("carol");
    }

    @Test
    void postOmitsEngineAuthWhenSharedSecretBlank() throws Exception {
        applicationProperties.getCluster().getEngine().setSharedSecret("");
        authenticateAs("alice");
        stubOkResponse();

        client.post("/x", "{}");

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-Engine-Auth"))
                .as("blank engine secret must NOT produce a header")
                .isEmpty();
        assertThat(sent.headers().firstValue("X-User-Id")).contains("alice");
    }

    @Test
    void postOmitsUserIdHeaderWhenSecurityContextEmpty() throws Exception {
        // Unauthenticated context: X-User-Id must be omitted; X-Engine-Auth still applies.
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);
        SecurityContextHolder.clearContext();
        stubOkResponse();

        client.post("/x", "{}");

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-Engine-Auth")).contains(ENGINE_SECRET);
        assertThat(sent.headers().firstValue("X-User-Id"))
                .as("anonymous context must NOT stamp an X-User-Id header")
                .isEmpty();
    }

    @Test
    void postOmitsUserIdHeaderForAnonymousAuthenticationToken() throws Exception {
        // AnonymousAuthenticationToken#isAuthenticated() returns true and getName() ==
        // "anonymousUser". resolveUserId() must special-case it so the engine never sees
        // anonymous traffic conflated under the literal identity "anonymousUser".
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        stubOkResponse();

        client.post("/x", "{}");

        HttpRequest sent = captureSentRequest();
        assertThat(sent.headers().firstValue("X-User-Id"))
                .as("anonymous principal must NOT stamp an X-User-Id header")
                .isEmpty();
    }

    private void authenticateAs(String username) {
        UserDetails principal =
                User.withUsername(username).password("n/a").authorities("USER").build();
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                principal, "n/a", principal.getAuthorities()));
    }

    @SuppressWarnings("unchecked")
    private void stubOkResponse() throws Exception {
        HttpResponse<String> response = (HttpResponse<String>) mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    private HttpRequest captureSentRequest() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue();
    }
}
