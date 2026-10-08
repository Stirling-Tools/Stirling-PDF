package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.service.AiEngineRouter;
import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineReply;
import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineRoute;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** What a linked instance's AI call becomes by the time the cloud engine sees it. */
class InstanceAiGatewayServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** The engine's OpenAPI document, trimmed to a few marked and unmarked operations. */
    private static final String OPEN_API =
            """
            {"paths": {
              "/health": {"get": {"x-linked-instance": true}},
              "/api/v1/orchestrator": {"post": {"x-linked-instance": true}},
              "/api/v1/pdf/questions": {"post": {"x-linked-instance": true}},
              "/api/v1/documents": {"post": {"x-linked-instance": true}},
              "/api/v1/documents/by-owner": {"delete": {"x-linked-instance": true}},
              "/api/v1/documents/by-id/{document_id}": {"delete": {}},
              "/api/v1/ai/math-auditor-agent/deliberate": {"post": {"x-linked-instance": true}},
              "/api/v1/config": {"post": {}, "parameters": []}
            }}
            """;

    private HttpClient httpClient;
    private InstanceAiGatewayService gateway;
    private final List<HttpRequest> sent = new ArrayList<>();

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getAiEngine().setUrl("http://cloud-engine:5001/");
        props.getAiEngine().setLongRunningTimeoutSeconds(600);
        httpClient = mock(HttpClient.class);
        gateway =
                new InstanceAiGatewayService(
                        props, AiEngineRouter.selfHosted(props, "cloud-secret"), httpClient);

        HttpResponse<String> openApi = mock(HttpResponse.class);
        when(openApi.statusCode()).thenReturn(200);
        when(openApi.body()).thenReturn(OPEN_API);
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class)))
                .thenAnswer(
                        invocation -> {
                            HttpRequest request = invocation.getArgument(0);
                            if (request.uri().getPath().equals("/openapi.json")) {
                                return openApi;
                            }
                            sent.add(request);
                            return engineReply();
                        });
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<Object> engineReply() {
        HttpResponse<Object> reply = mock(HttpResponse.class);
        when(reply.statusCode()).thenReturn(200);
        when(reply.headers())
                .thenReturn(
                        HttpHeaders.of(
                                Map.of("Content-Type", List.of("application/x-ndjson")),
                                (name, value) -> true));
        when(reply.body())
                .thenReturn(
                        new ByteArrayInputStream(
                                "{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8)));
        return reply;
    }

    private HttpRequest lastSent() {
        return sent.get(sent.size() - 1);
    }

    @Test
    void theOwnerTheEngineSeesIsNamespacedByInstance() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", null, "{}", 7L, "admin");

        assertThat(lastSent().headers().firstValue("X-User-Id")).contains("instance:7:admin");
    }

    @Test
    void twoInstancesWithTheSameUsernameDoNotCollide() {
        assertThat(InstanceAiGatewayService.namespacedOwner(1L, "admin"))
                .isNotEqualTo(InstanceAiGatewayService.namespacedOwner(2L, "admin"));
    }

    @Test
    void anInstanceCannotClaimAnotherTenantByForgingTheUserHeader() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", null, "{}", 7L, "instance:9:admin");

        // The forged value only ever becomes a suffix inside the caller's own namespace.
        assertThat(lastSent().headers().firstValue("X-User-Id"))
                .contains("instance:7:instance:9:admin");
    }

    @Test
    void aMissingUserHeaderStillLandsInsideTheInstanceNamespace() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", null, "{}", 7L, null);

        assertThat(lastSent().headers().firstValue("X-User-Id")).contains("instance:7:anonymous");
    }

    @Test
    void theEngineSecretIsAttachedAndTheBaseUrlIsNotDoubleSlashed() throws Exception {
        gateway.forward("GET", "/health", null, null, 7L, "admin");

        assertThat(lastSent().uri().toString()).isEqualTo("http://cloud-engine:5001/health");
        assertThat(lastSent().headers().firstValue("X-Engine-Auth")).contains("cloud-secret");
    }

    @Test
    void theQueryStringTravelsWithAnAllowedPath() throws Exception {
        gateway.forward(
                "POST",
                "/api/v1/ai/math-auditor-agent/deliberate",
                "tolerance=0.01",
                "{}",
                7L,
                "admin");

        assertThat(lastSent().uri().toString())
                .isEqualTo(
                        "http://cloud-engine:5001/api/v1/ai/math-auditor-agent/deliberate?tolerance=0.01");
    }

    @Test
    void theReplyIsPassedBackWithItsContentType() throws Exception {
        EngineReply reply = gateway.forward("GET", "/health", null, null, 7L, "admin");

        assertThat(reply.status()).isEqualTo(200);
        assertThat(reply.contentType()).isEqualTo("application/x-ndjson");
        assertThat(new String(reply.body().readAllBytes(), StandardCharsets.UTF_8))
                .isEqualTo("{\"status\":\"ok\"}");
    }

    @ParameterizedTest
    @CsvSource({
        // Would let an instance repoint the models Stirling Cloud runs for everyone.
        "POST, /api/v1/config",
        "DELETE, /api/v1/documents/by-id/abc",
        "POST, /api/v1/admin/settings",
        "POST, /../api/v1/config",
        // A marked route is forwarded only for the method the engine marked.
        "GET, /api/v1/orchestrator"
    })
    void operationsTheEngineDoesNotMarkAreRefused(String method, String path) {
        assertThatThrownBy(() -> gateway.forward(method, path, null, "{}", 7L, "admin"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
        assertThat(sent).isEmpty();
    }

    @Test
    void theEngineRouteListIsFetchedOnceAndReused() throws Exception {
        gateway.forward("GET", "/health", null, null, 7L, "admin");
        gateway.forward("POST", "/api/v1/orchestrator", null, "{}", 7L, "admin");

        verify(httpClient, times(1))
                .send(
                        argThat(request -> request.uri().getPath().equals("/openapi.json")),
                        any(HttpResponse.BodyHandler.class));
    }

    @Test
    void aTemplatedRouteMatchesExactlyOneRealSegment() {
        EngineRoute route = EngineRoute.of("delete", "/api/v1/documents/by-id/{document_id}");

        assertThat(route.matches("DELETE", "/api/v1/documents/by-id/abc")).isTrue();
        assertThat(route.matches("DELETE", "/api/v1/documents/by-id/a/b")).isFalse();
        assertThat(route.matches("DELETE", "/api/v1/documents/by-id/..")).isFalse();
        assertThat(route.matches("GET", "/api/v1/documents/by-id/abc")).isFalse();
    }

    @Test
    void onlyMarkedOperationsAreParsedFromTheOpenApiDocument() {
        List<EngineRoute> routes = InstanceAiGatewayService.parseRoutes(MAPPER.readTree(OPEN_API));

        assertThat(routes).hasSize(6);
        assertThat(routes).noneMatch(route -> route.matches("POST", "/api/v1/config"));
    }

    @Test
    void theLogoutPurgeIsForwardedAsADelete() throws Exception {
        gateway.forward("DELETE", "/api/v1/documents/by-owner", null, null, 7L, "alice");

        assertThat(lastSent().method()).isEqualTo("DELETE");
        assertThat(lastSent().headers().firstValue("X-User-Id")).contains("instance:7:alice");
    }

    @Test
    void everyCallGetsTheLongRunningTimeout() throws Exception {
        gateway.forward("POST", "/api/v1/pdf/questions", null, "{}", 7L, "alice");

        assertThat(lastSent().timeout()).contains(Duration.ofSeconds(600));
    }

    @Test
    void aDocumentUploadIsReownedToTheInstanceRegardlessOfWhatItAsksFor() throws Exception {
        // Ingest stores under the body's owner, so both spellings the engine accepts must lose.
        String forged =
                "{\"documentId\":\"d1\",\"ownerId\":\"instance:9:victim\","
                        + "\"read_principals\":[\"instance:9:victim\"],\"pageText\":\"hi\"}";

        gateway.forward("POST", "/api/v1/documents", null, forged, 7L, "alice");

        JsonNode body = MAPPER.readTree(bodyOf(lastSent()));
        assertThat(body.get("ownerId").asText()).isEqualTo("instance:7:alice");
        assertThat(body.get("readPrincipals")).hasSize(1);
        assertThat(body.get("readPrincipals").get(0).asText()).isEqualTo("instance:7:alice");
        assertThat(body.has("owner_id")).isFalse();
        assertThat(body.has("read_principals")).isFalse();
        assertThat(body.get("documentId").asText()).isEqualTo("d1");
        assertThat(body.get("pageText").asText()).isEqualTo("hi");
    }

    @Test
    void aBodyWithoutOwnerFieldsIsForwardedUntouched() throws Exception {
        String question = "{\"documentId\":\"d1\",\"question\":\"what changed?\"}";

        gateway.forward("POST", "/api/v1/pdf/questions", null, question, 7L, "alice");

        assertThat(bodyOf(lastSent())).isEqualTo(question);
    }

    @Test
    void anEmptyBodyIsSentAsAnEmptyObject() throws Exception {
        gateway.forward("POST", "/api/v1/documents", null, null, 7L, "alice");

        assertThat(bodyOf(lastSent())).isEqualTo("{}");
    }

    @Test
    void aMalformedBodyIsRefusedRatherThanForwarded() {
        assertThatThrownBy(
                        () ->
                                gateway.forward(
                                        "POST", "/api/v1/documents", null, "not json", 7L, "a"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
        assertThat(sent).isEmpty();
    }

    /** Drains a captured request's body publisher, which {@code ofString} emits synchronously. */
    private static String bodyOf(HttpRequest request) throws InterruptedException {
        Flow.Publisher<ByteBuffer> publisher = request.bodyPublisher().orElseThrow();
        StringBuilder out = new StringBuilder();
        CountDownLatch done = new CountDownLatch(1);
        publisher.subscribe(
                new Flow.Subscriber<>() {
                    @Override
                    public void onSubscribe(Flow.Subscription subscription) {
                        subscription.request(Long.MAX_VALUE);
                    }

                    @Override
                    public void onNext(ByteBuffer item) {
                        out.append(StandardCharsets.UTF_8.decode(item));
                    }

                    @Override
                    public void onError(Throwable throwable) {
                        done.countDown();
                    }

                    @Override
                    public void onComplete() {
                        done.countDown();
                    }
                });
        done.await(5, TimeUnit.SECONDS);
        return out.toString();
    }
}
