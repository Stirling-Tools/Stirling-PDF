package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;

/**
 * Asserts the credential header {@link ExternalApiCaller} actually puts on the wire for each auth
 * shape, against a real local server.
 *
 * <p>The interesting case is {@code headerPrefix}. Vendors disagree about the scheme in front of a
 * token - PandaDoc wants {@code API-Key}, Rossum {@code token}, DeepL {@code DeepL-Auth-Key} - and
 * without it every one of those presets would have to make the operator paste the scheme into the
 * secret field, where a missing space silently becomes a 401.
 */
class ExternalApiCallerAuthHeaderTest {

    private HttpServer server;
    private String baseUrl;
    private final Map<String, String> seen = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/ingest",
                exchange -> {
                    seen.clear();
                    exchange.getRequestHeaders()
                            .forEach(
                                    (name, values) ->
                                            seen.put(
                                                    name.toLowerCase(java.util.Locale.ROOT),
                                                    String.join(", ", values)));
                    exchange.getRequestBody().readAllBytes();
                    byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void headerAuthWithPrefixSendsSchemeAndToken() throws IOException {
        post(
                connection(
                        Map.of(
                                "authType",
                                "HEADER",
                                "headerName",
                                "Authorization",
                                "headerPrefix",
                                "API-Key",
                                "token",
                                "pd-secret")));

        assertThat(seen).containsEntry("authorization", "API-Key pd-secret");
    }

    @Test
    void headerAuthWithoutPrefixSendsTheBareToken() throws IOException {
        post(
                connection(
                        Map.of(
                                "authType",
                                "HEADER",
                                "headerName",
                                "x-api-key",
                                "token",
                                "sk-ant-secret")));

        // No scheme invented: a vendor that wants the raw key must receive exactly that.
        assertThat(seen).containsEntry("x-api-key", "sk-ant-secret");
        assertThat(seen).doesNotContainKey("authorization");
    }

    @Test
    void bearerAuthIsUnaffectedByAPrefix() throws IOException {
        // headerPrefix belongs to HEADER auth; BEARER must keep its own scheme regardless.
        post(
                connection(
                        Map.of(
                                "authType",
                                "BEARER",
                                "headerPrefix",
                                "API-Key",
                                "token",
                                "sk-secret")));

        assertThat(seen).containsEntry("authorization", "Bearer sk-secret");
    }

    private void post(ApiConnectionSettings settings) throws IOException {
        ExternalApiCaller.Response response =
                caller().dispatch(
                                settings,
                                "POST",
                                "/ingest",
                                ExternalApiCaller.raw(
                                        "application/json", "{}".getBytes(StandardCharsets.UTF_8)),
                                Map.of());
        assertThat(response.isSuccess()).isTrue();
    }

    private ApiConnectionSettings connection(Map<String, Object> options) {
        Map<String, Object> config = new LinkedHashMap<>(options);
        config.put("baseUrl", baseUrl);
        return ApiConnectionSettings.from(config);
    }

    private ExternalApiCaller caller() {
        ApplicationProperties properties = new ApplicationProperties();
        // The server is on loopback, which is exactly what the guard blocks by default.
        properties.getPolicies().setAllowPrivateApiEndpoints(true);
        return new ExternalApiCaller(
                HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(),
                properties,
                objectMapper);
    }
}
