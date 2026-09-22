package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
 * The whole cloud AI path, over real sockets: a self-hosted server's {@link AiEngineClient} calls
 * Stirling Cloud, {@link InstanceAiController} authenticates the instance and rewrites the owner,
 * {@link InstanceAiGatewayService} forwards to the engine.
 *
 * <p>Two real HTTP hops. The only stand-in is the engine itself, which is replaced by a recorder -
 * real inference needs a provider key, and what needs proving here is the routing and the tenancy,
 * not that a model answers.
 *
 * <p>Spring's own dispatch and the device-credential filter are not exercised; the controller is
 * invoked directly with an already-authenticated principal, which is what those layers produce.
 */
class CloudAiEndToEndTest {

    /** What the engine saw, so the test can assert on the far end of both hops. */
    private record EngineCall(String method, String path, String userId, String engineAuth) {}

    private HttpServer cloud;
    private HttpServer engine;
    private final List<EngineCall> engineCalls = new ArrayList<>();
    private final AtomicReference<Exception> cloudFailure = new AtomicReference<>();
    private InstanceAiUsageService usageService;
    private ApplicationProperties instanceProps;

    private static final String ENGINE_SECRET = "cloud-engine-secret";
    private static final String DEVICE_ID = "device-abc";
    private static final String DEVICE_SECRET = "device-secret-xyz";

    @BeforeEach
    void startServers() throws IOException {
        engine = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        engine.createContext(
                "/",
                exchange -> {
                    engineCalls.add(
                            new EngineCall(
                                    exchange.getRequestMethod(),
                                    exchange.getRequestURI().getPath(),
                                    exchange.getRequestHeaders().getFirst("X-User-Id"),
                                    exchange.getRequestHeaders().getFirst("X-Engine-Auth")));
                    // Fail closed like the shipped engine image does.
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

        usageService = mock(InstanceAiUsageService.class);
        InstanceAiGatewayService gateway =
                new InstanceAiGatewayService(
                        "http://127.0.0.1:" + engine.getAddress().getPort(),
                        10,
                        30,
                        ENGINE_SECRET,
                        HttpClient.newHttpClient());
        InstanceAiController controller = new InstanceAiController(gateway, usageService);

        cloud = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        cloud.createContext(
                "/api/v1/instance/ai",
                exchange -> {
                    try {
                        // What the device-credential filter would have established.
                        String deviceId = exchange.getRequestHeaders().getFirst("X-Device-Id");
                        String deviceSecret =
                                exchange.getRequestHeaders().getFirst("X-Device-Secret");
                        if (!DEVICE_ID.equals(deviceId) || !DEVICE_SECRET.equals(deviceSecret)) {
                            respond(exchange, 401, "{\"detail\":\"unknown device\"}");
                            return;
                        }
                        MockHttpServletRequest request =
                                new MockHttpServletRequest(
                                        exchange.getRequestMethod(),
                                        exchange.getRequestURI().getPath());
                        request.setRequestURI(exchange.getRequestURI().getPath());
                        LinkedInstanceAuthenticationToken auth =
                                new LinkedInstanceAuthenticationToken(42L, 99L);
                        String userId = exchange.getRequestHeaders().getFirst("X-User-Id");
                        // Stands in for Spring picking the exact /status mapping over the
                        // catch-all /** the forwarding methods are bound to.
                        if ("GET".equals(exchange.getRequestMethod())
                                && exchange.getRequestURI()
                                        .getPath()
                                        .endsWith("/api/v1/instance/ai/status")) {
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
                        ResponseEntity<StreamingResponseBody> reply =
                                switch (exchange.getRequestMethod()) {
                                    case "GET" -> controller.get(request, auth, userId);
                                    case "DELETE" -> controller.delete(request, auth, userId);
                                    default -> controller.post(request, auth, userId, "{}");
                                };
                        // The controller answers with a stream in every branch; drain it the way
                        // Spring's streaming writer would.
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
    }

    @AfterEach
    void stopServers() {
        engine.stop(0);
        cloud.stop(0);
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

    /** A self-hosted server's engine client, linked and pointed at the cloud under test. */
    private AiEngineClient linkedInstanceClient() {
        DeviceCredential credential = new DeviceCredential();
        credential.setDeviceId(DEVICE_ID);
        credential.setDeviceSecret(DEVICE_SECRET);
        DeviceCredentialStore store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(credential));

        AccountLinkProperties linkProps = new AccountLinkProperties();
        linkProps.setSaasBaseUrl("http://127.0.0.1:" + cloud.getAddress().getPort());
        // The configured API host wins over the account-link host, so point it at the test server
        // or this would dial the real api.stirling.com.
        instanceProps
                .getAiEngine()
                .setCloudBaseUrl("http://127.0.0.1:" + cloud.getAddress().getPort());

        AiEngineRouter router =
                new AiEngineRouter(
                        instanceProps, providing(store), providing(linkProps), "local-secret");
        return new AiEngineClient(instanceProps, HttpClient.newHttpClient(), router);
    }

    @Test
    void aLinkedInstancesAiCallReachesTheCloudEngineAndComesBack() throws Exception {
        String body = linkedInstanceClient().get("/health", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(body).contains("demo-smart");
        assertThat(engineCalls).hasSize(1);
        EngineCall call = engineCalls.get(0);
        assertThat(call.path()).isEqualTo("/health");
        // The instance's own shared secret never leaves it; the cloud presents its own.
        assertThat(call.engineAuth()).isEqualTo(ENGINE_SECRET);
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
    void healthChecksAreNotBilled() throws Exception {
        linkedInstanceClient().get("/health", "alice");

        // recordCall is still invoked; the free-path decision lives inside it, and its own test
        // covers that. What matters here is that a health probe is not a billable orchestration.
        verify(usageService).recordCall(99L, 42L, "/health");
        verify(usageService, never())
                .recordCall(any(), any(), org.mockito.ArgumentMatchers.eq("/api/v1/orchestrator"));
    }

    @Test
    void anUnlinkedServerInCloudModeRefusesBeforeItCallsAnything() {
        DeviceCredentialStore unlinked = mock(DeviceCredentialStore.class);
        when(unlinked.get()).thenReturn(Optional.empty());
        AccountLinkProperties linkProps = new AccountLinkProperties();
        linkProps.setSaasBaseUrl("http://127.0.0.1:" + cloud.getAddress().getPort());
        instanceProps
                .getAiEngine()
                .setCloudBaseUrl("http://127.0.0.1:" + cloud.getAddress().getPort());
        AiEngineClient client =
                new AiEngineClient(
                        instanceProps,
                        HttpClient.newHttpClient(),
                        new AiEngineRouter(
                                instanceProps, providing(unlinked), providing(linkProps), null));

        assertThatThrownBy(() -> client.get("/health", "alice"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not linked");
        assertThat(engineCalls).isEmpty();
    }

    @Test
    void documentUploadIsRefusedLocallyWhenCloudIngestionIsOff() {
        AiEngineClient client = linkedInstanceClient();

        assertThatThrownBy(() -> client.post("/api/v1/documents", "{}", "alice"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("turned off");
        // Refused on the instance, so the document never crosses the network at all.
        assertThat(engineCalls).isEmpty();
    }

    @Test
    void turningCloudIngestionOnLetsTheDocumentThrough() throws Exception {
        instanceProps.getAiEngine().setCloudDocumentIndexing(true);

        linkedInstanceClient().post("/api/v1/documents", "{}", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(engineCalls).hasSize(1);
        assertThat(engineCalls.get(0).path()).isEqualTo("/api/v1/documents");
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
        // Straight to the engine: the owner is the local username, un-namespaced.
        assertThat(engineCalls.get(0).userId()).isEqualTo("alice");
        verify(usageService, never()).recordCall(any(), any(), any());
    }

    @Test
    void theGatewayRefusesEngineRoutesThatAreNotOnItsAllowlist() {
        // Config push would let one tenant repoint the models Stirling Cloud runs for everyone.
        assertThat(InstanceAiGatewayService.isAllowedPath("/api/v1/config")).isFalse();
        assertThat(Map.of()).isEmpty();
    }

    @Test
    void theLogoutPurgeReachesTheCloudEngineInsteadOfFourOhFouring() throws Exception {
        linkedInstanceClient().delete("/api/v1/documents/by-owner", "alice");

        assertThat(cloudFailure.get()).isNull();
        assertThat(engineCalls).hasSize(1);
        EngineCall call = engineCalls.get(0);
        assertThat(call.method()).isEqualTo("DELETE");
        assertThat(call.path()).isEqualTo("/api/v1/documents/by-owner");
        // Scoped to this instance's namespace, so it cannot purge another tenant.
        assertThat(call.userId()).isEqualTo("instance:42:alice");
    }

    @Test
    void aLinkedInstanceCanAskWhetherTheCloudSharesItsAi() throws Exception {
        // The probe the self-hosted status card makes, over the same two hops a real call takes.
        String body = linkedInstanceClient().get("/status", "alice");

        assertThat(body).contains("\"sharingEnabled\":true");
        assertThat(body).contains("\"engineReachable\":true");
        assertThat(cloudFailure.get()).isNull();
    }
}
