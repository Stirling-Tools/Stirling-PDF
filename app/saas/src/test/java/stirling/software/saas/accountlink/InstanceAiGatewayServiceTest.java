package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineReply;

/** What a linked instance's AI call becomes by the time the cloud engine sees it. */
class InstanceAiGatewayServiceTest {

    private HttpClient httpClient;
    private InstanceAiGatewayService gateway;
    private ArgumentCaptor<HttpRequest> sent;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        httpClient = mock(HttpClient.class);
        gateway =
                new InstanceAiGatewayService(
                        "http://cloud-engine:5001/", 30, 600, "cloud-secret", httpClient);
        HttpResponse<String> ok = mock(HttpResponse.class);
        when(ok.statusCode()).thenReturn(200);
        when(ok.body()).thenReturn("{\"status\":\"ok\"}");
        sent = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(sent.capture(), any(HttpResponse.BodyHandler.class))).thenReturn(ok);
    }

    @Test
    void theOwnerTheEngineSeesIsNamespacedByInstance() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", "{}", 7L, "admin");

        assertThat(sent.getValue().headers().firstValue("X-User-Id")).contains("instance:7:admin");
    }

    @Test
    void twoInstancesWithTheSameUsernameDoNotCollide() {
        assertThat(InstanceAiGatewayService.namespacedOwner(1L, "admin"))
                .isNotEqualTo(InstanceAiGatewayService.namespacedOwner(2L, "admin"));
    }

    @Test
    void anInstanceCannotClaimAnotherTenantByForgingTheUserHeader() throws Exception {
        // The instance supplies only the suffix; the prefix comes from the credential it
        // authenticated with, so a forged value lands inside its own namespace.
        gateway.forward("POST", "/api/v1/orchestrator", "{}", 7L, "instance:9:admin");

        assertThat(sent.getValue().headers().firstValue("X-User-Id"))
                .contains("instance:7:instance:9:admin");
    }

    @Test
    void amissingUserHeaderStillLandsInsideTheInstanceNamespace() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", "{}", 7L, null);

        assertThat(sent.getValue().headers().firstValue("X-User-Id"))
                .contains("instance:7:anonymous");
    }

    @Test
    void theCloudSharedSecretIsAttachedAndTheBaseUrlIsNotDoubleSlashed() throws Exception {
        gateway.forward("GET", "/health", null, 7L, "admin");

        HttpRequest request = sent.getValue();
        assertThat(request.uri().toString()).isEqualTo("http://cloud-engine:5001/health");
        assertThat(request.headers().firstValue("X-Engine-Auth")).contains("cloud-secret");
    }

    @Test
    void theReplyIsPassedBackVerbatim() throws Exception {
        EngineReply reply = gateway.forward("GET", "/health", null, 7L, "admin");

        assertThat(reply.status()).isEqualTo(200);
        assertThat(reply.body()).isEqualTo("{\"status\":\"ok\"}");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                // Would let an instance repoint the models Stirling Cloud runs for everyone.
                "/api/v1/config",
                "/api/v1/documents/by-id/abc",
                // Not an engine route at all.
                "/api/v1/admin/settings",
                "/../api/v1/config"
            })
    void routesOutsideTheAllowlistAreRefused(String path) {
        assertThatThrownBy(() -> gateway.forward("POST", path, "{}", 7L, "admin"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/health",
                "/api/v1/orchestrator",
                "/api/v1/pdf/questions",
                "/api/v1/documents",
                "/api/v1/ai/pdf-comment-agent/generate"
            })
    void theReasoningRoutesAnInstanceActuallyUsesAreForwarded(String path) {
        assertThat(InstanceAiGatewayService.isAllowedPath(path)).isTrue();
    }

    @Test
    void documentIngestIsTheOnlyUploadPath() {
        assertThat(InstanceAiGatewayService.isDocumentUpload("/api/v1/documents")).isTrue();
        assertThat(InstanceAiGatewayService.isDocumentUpload("/api/v1/orchestrator")).isFalse();
    }

    @Test
    void theLogoutPurgeIsForwardedAsADelete() throws Exception {
        gateway.forward("DELETE", "/api/v1/documents/by-owner", null, 7L, "alice");

        HttpRequest request = sent.getValue();
        assertThat(request.method()).isEqualTo("DELETE");
        // Safe only because the owner is this gateway's namespace, not one the instance supplied.
        assertThat(request.headers().firstValue("X-User-Id")).contains("instance:7:alice");
    }

    @Test
    void longRunningPathsGetTheLongerTimeout() throws Exception {
        gateway.forward("POST", "/api/v1/orchestrator", "{}", 7L, "alice");
        assertThat(sent.getValue().timeout()).contains(java.time.Duration.ofSeconds(600));

        gateway.forward("POST", "/api/v1/pdf/questions", "{}", 7L, "alice");
        assertThat(sent.getValue().timeout()).contains(java.time.Duration.ofSeconds(30));
    }

    @Test
    void onlyTheOrchestratorStreams() {
        // Its NDJSON progress frames are the only response worth not buffering.
        assertThat(InstanceAiGatewayService.isStreaming("/api/v1/orchestrator")).isTrue();
        assertThat(InstanceAiGatewayService.isStreaming("/api/v1/pdf/questions")).isFalse();
    }

    @Test
    void aDocumentUploadIsReownedToTheInstanceRegardlessOfWhatItAsksFor() throws Exception {
        // The engine keys tenancy off the body's owner, not X-User-Id, so an instance that names
        // another tenant here would otherwise write - and, since ingest replaces by owner, purge -
        // that tenant's corpus. Both the camelCase and snake_case spellings the engine accepts are
        // in the attempt; both must lose.
        String forged =
                "{\"documentId\":\"d1\",\"ownerId\":\"instance:9:victim\","
                        + "\"read_principals\":[\"instance:9:victim\"],\"pageText\":\"hi\"}";

        gateway.forward("POST", "/api/v1/documents", forged, 7L, "alice");

        JsonNode body = MAPPER.readTree(bodyOf(sent.getValue()));
        assertThat(body.get("ownerId").asText()).isEqualTo("instance:7:alice");
        assertThat(body.get("readPrincipals")).hasSize(1);
        assertThat(body.get("readPrincipals").get(0).asText()).isEqualTo("instance:7:alice");
        // The snake_case attempt does not survive alongside the stamped camelCase field.
        assertThat(body.has("owner_id")).isFalse();
        assertThat(body.has("read_principals")).isFalse();
        // The rest of the payload is left as the instance sent it.
        assertThat(body.get("documentId").asText()).isEqualTo("d1");
        assertThat(body.get("pageText").asText()).isEqualTo("hi");
    }

    @Test
    void aNonUploadPostIsForwardedWithItsBodyUntouched() throws Exception {
        // Only the ingest path names an owner in its body; reasoning routes must pass through
        // as-is.
        String question = "{\"documentId\":\"d1\",\"question\":\"what changed?\"}";

        gateway.forward("POST", "/api/v1/pdf/questions", question, 7L, "alice");

        assertThat(bodyOf(sent.getValue())).isEqualTo(question);
    }

    @Test
    void anEmptyUploadBodyStillCarriesTheInstanceOwner() throws Exception {
        gateway.forward("POST", "/api/v1/documents", null, 7L, "alice");

        JsonNode body = MAPPER.readTree(bodyOf(sent.getValue()));
        assertThat(body.get("ownerId").asText()).isEqualTo("instance:7:alice");
        assertThat(body.get("readPrincipals").get(0).asText()).isEqualTo("instance:7:alice");
    }

    @Test
    void aMalformedUploadBodyIsRefusedRatherThanForwarded() {
        assertThatThrownBy(
                        () -> gateway.forward("POST", "/api/v1/documents", "not json", 7L, "alice"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

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
