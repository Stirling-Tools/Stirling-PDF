package stirling.software.saas.store.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** OpenAI's moderation API is spoken correctly, against a local stand-in for it. */
class OpenAiModerationTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private final AtomicReference<String> requestBody = new AtomicReference<>();
    private final AtomicReference<String> requestAuth = new AtomicReference<>();
    private final AtomicReference<String> requestPath = new AtomicReference<>();
    private HttpServer server;
    private volatile int status = 200;
    private volatile String responseBody = "{}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    requestPath.set(exchange.getRequestURI().toString());
                    requestBody.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    requestAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
                    byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, bytes.length);
                    try (OutputStream out = exchange.getResponseBody()) {
                        out.write(bytes);
                    }
                });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private String base() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Test
    void openAiSendsEveryTextInOneRequestAndReadsTheTopCategory() throws Exception {
        responseBody =
                """
                {"results": [
                  {"flagged": false, "categories": {"hate": false}, "category_scores": {"hate": 0.01}},
                  {"flagged": true,
                   "categories": {"harassment": true, "self-harm/intent": true, "hate": false},
                   "category_scores": {"harassment": 0.4, "self-harm/intent": 0.9, "hate": 0.2}}
                ]}
                """;
        OpenAiModeration openAi = new OpenAiModeration(http, base() + "/v1/", "sk-test");

        List<StoreModeration.Verdict> verdicts = openAi.check(List.of("fine", "not fine"));

        assertThat(verdicts.get(0).flagged()).isFalse();
        assertThat(verdicts.get(1)).isEqualTo(new StoreModeration.Verdict(true, "self harm"));
        assertThat(requestPath.get()).isEqualTo("/v1/moderations");
        assertThat(requestAuth.get()).isEqualTo("Bearer sk-test");
        JsonNode sent = mapper.readTree(requestBody.get());
        assertThat(sent.path("model").asString()).isEqualTo("omni-moderation-latest");
        assertThat(sent.path("input").size()).isEqualTo(2);
    }

    @Test
    void openAiErrorsAreUnavailableNotClean() {
        status = 429;
        OpenAiModeration openAi = new OpenAiModeration(http, base(), "sk-test");

        assertThatThrownBy(() -> openAi.check(List.of("text")))
                .isInstanceOf(StoreModeration.UnavailableException.class)
                .hasMessageContaining("429");
    }
}
