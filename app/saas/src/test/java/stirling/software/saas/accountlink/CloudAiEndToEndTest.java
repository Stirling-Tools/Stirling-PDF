package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.AiEngineMode;
import stirling.software.proprietary.accountlink.AccountLinkProperties;
import stirling.software.proprietary.accountlink.DeviceCredential;
import stirling.software.proprietary.accountlink.DeviceCredentialStore;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiEngineRouter;

/**
 * A self-hosted server's {@link AiEngineClient} through {@link InstanceAiController} to a stub
 * engine, over real sockets. The controller is called directly, as the credential filter would.
 */
class CloudAiEndToEndTest {

    private record EngineCall(
            String method, String path, String userId, String engineAuth, String body) {}

    private static final String ENGINE_SECRET = "cloud-engine-secret";
    private static final String DEVICE_ID = "device-abc";
    private static final String DEVICE_SECRET = "device-secret-xyz";
    private static final String OPEN_API =
            """
            {"paths": {
              "/health": {"get": {"x-linked-instance": true}},
              "/api/v1/orchestrator": {"post": {"x-linked-instance": true}},
              "/api/v1/documents": {"post": {"x-linked-instance": true}},
              "/api/v1/documents/by-owner": {"delete": {"x-linked-instance": true}},
              "/api/v1/config": {"post": {}}
            }}
            """;

    private HttpServer cloud;
    private HttpServer engine;
    private final List<EngineCall> engineCalls = new CopyOnWriteArrayList<>();
    private final AtomicReference<Exception> cloudFailure = new AtomicReference<>();
    private InstanceAiUsageService usageService;
    private ApplicationProperties instanceProps;

    @BeforeEach
    void startServers() throws IOException {
        engine = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // Public, like the real engine's, and not an engine call worth recording.
        engine.createContext("/openapi.json", exchange -> respond(exchange, 200, OPEN_API));
        engine.createContext(
                "/",
                exchange -> {
                    engineCalls.add(
                            new EngineCall(
                                    exchange.getRequestMethod(),
                                    exchange.getRequestURI().getPath(),
                                    exchange.getRequestHeaders().getFirst("X-User-Id"),
                                    exchange.getRequestHeaders().getFirst("X-Engine-Auth"),
                                    bodyOf(exchange)));
                    if (!ENGINE_SECRET.equals(
                            exchange.getRequestHeaders().getFirst("X-Engine-Auth"))) {
                        respond(exchange, 401, "{\"detail\":\"bad secret\"}");
                        return;
                    }
                    respond(
                            exchange,
                            200,
                            "{\"status\":\"ok\",\"smartModel\":\"demo-smart\",\"fastModel\":\"demo-fast\"}");
                });
        engine.start();

        ApplicationProperties cloudProps = new ApplicationProperties();
        cloudProps.getAiEngine().setUrl("http://127.0.0.1:" + engine.getAddress().getPort());
        cloudProps.getAiEngine().setLongRunningTimeoutSeconds(30);
        InstanceAiGatewayService gateway =
                new InstanceAiGatewayService(
                        cloudProps,
                        AiEngineRouter.selfHosted(cloudProps, ENGINE_SECRET),
                        HttpClient.newHttpClient());
        usageService = mock(InstanceAiUsageService.class);
        InstanceAiController controller = new InstanceAiController(gateway, usageService, true);

        cloud = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        cloud.createContext(
                "/api/v1/instance/ai",
                exchange -> {
                    try {
                        // Stands in for the device-credential filter.
                        String deviceId = exchange.getRequestHeaders().getFirst("X-Device-Id");
                        String deviceSecret =
                                exchange.getRequestHeaders().getFirst("X-Device-Secret");
                        if (!DEVICE_ID.equals(deviceId) || !DEVICE_SECRET.equals(deviceSecret)) {
                            respond(exchange, 401, "{\"detail\":\"unknown device\"}");
                            return;
                        }
                        String path = exchange.getRequestURI().getPath();
                        if ("GET".equals(exchange.getRequestMethod())
                                && path.endsWith("/api/v1/instance/ai/status")) {
                            InstanceAiController.InstanceAiStatus body = controller.status();
                            respond(
                                    exchange,
                                    200,
                                    "{\"sharingEnabled\":"
                                            + body.sharingEnabled()
                                            + ",\"engineReachable\":"
                                            + body.engineReachable()
                                            + "}");
                            return;
                        }
                        MockHttpServletRequest request =
                                new MockHttpServletRequest(exchange.getRequestMethod(), path);
                        request.setQueryString(exchange.getRequestURI().getRawQuery());
                        LinkedInstanceAuthenticationToken auth =
                                new LinkedInstanceAuthenticationToken(42L, 99L);
                        String userId = exchange.getRequestHeaders().getFirst("X-User-Id");
                        ResponseEntity<StreamingResponseBody> reply =
                                switch (exchange.getRequestMethod()) {
                                    case "GET" -> controller.get(request, auth, userId);
                                    case "DELETE" -> controller.delete(request, auth, userId);
                                    default ->
                                            controller.post(
                                                    request, auth, userId, bodyOf(exchange));
                                };
                        ByteArrayOutputStream drained = new ByteArrayOutputStream();
                        if (reply.getBody() != null) {
                            reply.getBody().writeTo(drained);
                        }
                        respond(
                                exchange,
                                reply.getStatusCode().value(),
                                drained.toString(StandardCharsets.UTF_8));
                    } catch (ResponseStatusException e) {
                        respond(exchange, e.getStatusCode().value(), "{\"detail\":\"refused\"}");
                    } catch (Exception e) {
                        cloudFailure.set(e);
                        respond(exchange, 500, "{\"detail\":\"boom\"}");
                    }
                });
        cloud.start();

        instanceProps = new ApplicationProperties();
        instanceProps.getAiEngine().setEnabled(true);
        instanceProps.getAiEngine().setMode(AiEngineMode.CLOUD);
        instanceProps.getAiEngine().setTimeoutSeconds(10);
        instanceProps.getAiEngine().setCloudBaseUrl(cloudUrl());
    }

    @AfterEach
    void stopServers() {
        engine.stop(0);
        cloud.stop(0);
    }

    private String cloudUrl() {
        return "http://127.0.0.1:" + cloud.getAddress().getPort();
    }

    private static String bodyOf(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> providing(T value) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(value);
        return provider;
    }

    private AiEngineClient clientWith(DeviceCredentialStore store) {
        AccountLinkProperties linkProps = new AccountLinkProperties();
        linkProps.setSaasBaseUrl(cloudUrl());
        AiEngineRouter router =
                new AiEngineRouter(
                        instanceProps, providing(store), providing(linkProps), "local-secret");
        return new AiEngineClient(instanceProps, HttpClient.newHttpClient(), router);
    }

    /** A self-hosted server's engine client, linked and pointed at the cloud under test. */
    private AiEngineClient linkedInstanceClient() {
        DeviceCredential credential = new DeviceCredential();
        credential.setDeviceId(DEVICE_ID);
        credential.setDeviceSecret(DEVICE_SECRET);
        DeviceCredentialStore store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(credential));
        return clientWith(store);
    }

    @Test
    void aLinkedInstancesAiCallReachesTheCloudEngineAndComesBack() throws Exception {
        String body = linkedInstanceClient().get("/health", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(body).contains("demo-smart");
        assertThat(engineCalls).hasSize(1);
        assertThat(engineCalls.get(0).path()).isEqualTo("/health");
        // The instance's own shared secret never leaves it; the cloud presents its own.
        assertThat(engineCalls.get(0).engineAuth()).isEqualTo(ENGINE_SECRET);
    }

    @Test
    void theEngineSeesAnOwnerNamespacedToTheCallingInstance() throws Exception {
        linkedInstanceClient().post("/api/v1/orchestrator", "{}", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(engineCalls).hasSize(1);
        assertThat(engineCalls.get(0).userId()).isEqualTo("instance:42:alice");
    }

    @Test
    void successfulCloudWorkIsBilledOnceByTheCloud() throws Exception {
        linkedInstanceClient().post("/api/v1/orchestrator", "{}", "alice");

        verify(usageService).recordCall(99L, 42L, "/api/v1/orchestrator");
    }

    @Test
    void healthChecksAreNotBilledAsReasoning() throws Exception {
        linkedInstanceClient().get("/health", "alice");

        // recordCall decides that /health is free; its own test covers that.
        verify(usageService).recordCall(99L, 42L, "/health");
        verify(usageService, never()).recordCall(any(), any(), eq("/api/v1/orchestrator"));
    }

    @Test
    void anUnlinkedServerInCloudModeRefusesBeforeItCallsAnything() {
        DeviceCredentialStore unlinked = mock(DeviceCredentialStore.class);
        when(unlinked.get()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> clientWith(unlinked).get("/health", "alice"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not linked");
        assertThat(engineCalls).isEmpty();
    }

    @Test
    void documentUploadIsRefusedLocallyWhenCloudIndexingIsOff() {
        assertThatThrownBy(() -> linkedInstanceClient().post("/api/v1/documents", "{}", "alice"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("turned off");
        assertThat(engineCalls).isEmpty();
    }

    @Test
    void anUploadReachesTheEngineUnderTheInstanceOwnerOnceIndexingIsOn() throws Exception {
        instanceProps.getAiEngine().setCloudDocumentIndexing(true);

        linkedInstanceClient()
                .post(
                        "/api/v1/documents",
                        "{\"documentId\":\"d1\",\"ownerId\":\"alice\",\"readPrincipals\":[\"alice\"]}",
                        "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(engineCalls).hasSize(1);
        assertThat(engineCalls.get(0).path()).isEqualTo("/api/v1/documents");
        assertThat(engineCalls.get(0).body()).contains("\"ownerId\":\"instance:42:alice\"");
    }

    @Test
    void selfHostedModeStillGoesStraightToTheLocalEngine() throws Exception {
        instanceProps.getAiEngine().setMode(AiEngineMode.SELF_HOSTED);
        instanceProps.getAiEngine().setUrl("http://127.0.0.1:" + engine.getAddress().getPort());
        AiEngineClient client =
                new AiEngineClient(
                        instanceProps,
                        HttpClient.newHttpClient(),
                        AiEngineRouter.selfHosted(instanceProps, ENGINE_SECRET));

        client.get("/health", "alice");

        assertThat(engineCalls).hasSize(1);
        assertThat(engineCalls.get(0).userId()).isEqualTo("alice");
        verify(usageService, never()).recordCall(any(), any(), any());
    }

    @Test
    void aRouteTheEngineDoesNotMarkNeverReachesIt() {
        // Config push would let one tenant repoint the models every tenant shares.
        assertThatThrownBy(() -> linkedInstanceClient().post("/api/v1/config", "{}", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
        assertThat(engineCalls).isEmpty();
    }

    @Test
    void theLogoutPurgeReachesTheCloudEngineInTheInstanceNamespace() throws Exception {
        linkedInstanceClient().delete("/api/v1/documents/by-owner", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(engineCalls).hasSize(1);
        EngineCall call = engineCalls.get(0);
        assertThat(call.method()).isEqualTo("DELETE");
        assertThat(call.path()).isEqualTo("/api/v1/documents/by-owner");
        assertThat(call.userId()).isEqualTo("instance:42:alice");
    }

    @Test
    void aLinkedInstanceCanAskWhetherTheCloudSharesItsAi() throws Exception {
        String body = linkedInstanceClient().get("/status", "alice");

        assertThat(body).contains("\"sharingEnabled\":true");
        assertThat(body).contains("\"engineReachable\":true");
        assertThat(cloudFailure.get()).isNull();
    }
}
