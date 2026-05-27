package stirling.software.saas.ai.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

/** Verifies the auth-header strip-and-stamp contract on the saas AI proxy. */
@ExtendWith(MockitoExtension.class)
class AiProxyServiceTest {

    private static final String ENGINE_URL = "http://engine.local:5001";
    private static final String ENGINE_SECRET = "shared-engine-secret";
    private static final String SERVER_API_KEY = "server-resolved-api-key";
    private static final String CURRENT_USERNAME = "alice";

    @Mock UserRepository userRepository;
    @Mock UserService userService;
    @Mock HttpClient httpClient;
    @Mock HttpResponse<InputStream> mockResponse;

    private ApplicationProperties applicationProperties;
    private AiProxyService proxy;

    @BeforeEach
    void setUp() throws Exception {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getCluster().getEngine().setSharedSecret(ENGINE_SECRET);

        proxy = new AiProxyService(ENGINE_URL, userRepository, userService, applicationProperties);
        // Replace the internally-constructed HttpClient with our mock so we can capture requests.
        ReflectionTestUtils.setField(proxy, "httpClient", httpClient);

        lenient().when(mockResponse.body()).thenReturn(new ByteArrayInputStream(new byte[0]));
        lenient().when(mockResponse.statusCode()).thenReturn(200);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/chat", "/api/create/sessions"})
    void forward_dropsClientAuthorizationAndApiKeyHeaders(String path) throws Exception {
        when(userService.getCurrentUsername()).thenReturn(CURRENT_USERNAME);
        when(userService.getApiKeyForUser(CURRENT_USERNAME)).thenReturn(SERVER_API_KEY);

        MockHttpServletRequest inbound = new MockHttpServletRequest("POST", path);
        inbound.addHeader("Authorization", "Bearer client-supplied-bearer");
        inbound.addHeader("X-API-KEY", "client-supplied-api-key");
        inbound.setContentType("application/json");
        inbound.setContent("{}".getBytes());

        proxy.forward("POST", path, inbound, false);

        HttpRequest outbound = captureOutboundRequest();

        // setHeader with empty string causes the JDK builder to omit the header or send it empty.
        assertThat(outbound.headers().firstValue("Authorization").orElse(""))
                .as("client Authorization must never reach the engine")
                .isEmpty();
        assertThat(outbound.headers().allValues("Authorization"))
                .as("client Authorization value must not be among the outbound values")
                .doesNotContain("Bearer client-supplied-bearer");

        Optional<String> apiKey = outbound.headers().firstValue("X-API-KEY");
        assertThat(apiKey)
                .as("X-API-KEY must be the server-resolved value, not the client-supplied one")
                .contains(SERVER_API_KEY);
        assertThat(apiKey.orElse(""))
                .as("client-supplied X-API-KEY must not leak through")
                .isNotEqualTo("client-supplied-api-key");
        assertThat(outbound.headers().allValues("X-API-KEY"))
                .as("client X-API-KEY must not be among the outbound values")
                .doesNotContain("client-supplied-api-key");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/chat", "/api/create/sessions"})
    void forward_stampsEngineAuthAndUserIdHeaders(String path) throws Exception {
        when(userService.getCurrentUsername()).thenReturn(CURRENT_USERNAME);
        when(userService.getApiKeyForUser(CURRENT_USERNAME)).thenReturn(SERVER_API_KEY);

        MockHttpServletRequest inbound = new MockHttpServletRequest("POST", path);
        inbound.setContentType("application/json");
        inbound.setContent("{}".getBytes());

        proxy.forward("POST", path, inbound, false);

        HttpRequest outbound = captureOutboundRequest();

        assertThat(outbound.headers().firstValue("X-Engine-Auth"))
                .as("engine shared secret must be stamped on outbound requests")
                .contains(ENGINE_SECRET);
        assertThat(outbound.headers().firstValue("X-User-Id"))
                .as("authenticated username must be stamped on outbound requests")
                .contains(CURRENT_USERNAME);
    }

    @Test
    void forward_omitsEngineAuthWhenSecretBlank() throws Exception {
        applicationProperties.getCluster().getEngine().setSharedSecret("");
        when(userService.getCurrentUsername()).thenReturn(CURRENT_USERNAME);
        when(userService.getApiKeyForUser(CURRENT_USERNAME)).thenReturn(SERVER_API_KEY);

        MockHttpServletRequest inbound = new MockHttpServletRequest("GET", "/api/v1/health");

        proxy.forward("GET", "/api/v1/health", inbound, false);

        HttpRequest outbound = captureOutboundRequest();
        assertThat(outbound.headers().firstValue("X-Engine-Auth"))
                .as("blank engine secret must not produce a header")
                .isEmpty();
    }

    @Test
    void forward_omitsUserIdForAnonymousPrincipal() throws Exception {
        when(userService.getCurrentUsername()).thenReturn("anonymousUser");

        MockHttpServletRequest inbound =
                new MockHttpServletRequest("GET", "/api/create/sessions/abc");

        proxy.forward("GET", "/api/create/sessions/abc", inbound, false);

        HttpRequest outbound = captureOutboundRequest();
        assertThat(outbound.headers().firstValue("X-User-Id"))
                .as("anonymous principal must not produce an X-User-Id header")
                .isEmpty();
    }

    private HttpRequest captureOutboundRequest() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        org.mockito.Mockito.verify(httpClient)
                .send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue();
    }
}
