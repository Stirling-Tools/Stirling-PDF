package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Drives {@link ExternalApiCaller} against a real local HTTP server shaped like ConsignO Cloud's
 * auth: credentials in headers plus a JSON body, and the token handed back only in the {@code
 * X-Auth-Token} <em>response header</em>.
 *
 * <p>A real server rather than a mock, because what is being tested is the wire behaviour - that
 * the token is found in a header, reused rather than re-fetched, and re-obtained on a 401.
 */
class ExternalApiCallerTokenLoginTest {

    private HttpServer server;
    private String baseUrl;
    private final AtomicInteger logins = new AtomicInteger();
    private final List<Map<String, String>> callHeaders = new ArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile String issuedToken = "token-1";
    private volatile boolean rejectToken;
    private volatile String workflowBody;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext(
                "/api/v1/auth/login",
                exchange -> {
                    logins.incrementAndGet();
                    String body =
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8);
                    // The vendor authenticates the app by header and the user by body.
                    if (!"client-abc".equals(exchange.getRequestHeaders().getFirst("X-Client-Id"))
                            || !"client-xyz"
                                    .equals(
                                            exchange.getRequestHeaders()
                                                    .getFirst("X-Client-Secret"))
                            || !body.contains("\"password\":\"s3cr3t\"")
                            || !body.contains("\"tenantId\":\"acme\"")) {
                        respond(exchange, 401, "{}");
                        return;
                    }
                    exchange.getResponseHeaders().add("X-Auth-Token", issuedToken);
                    respond(exchange, 200, "{\"msg\":\"ok\"}");
                });

        server.createContext(
                "/api/v1/documents",
                exchange -> {
                    Map<String, String> headers = new LinkedHashMap<>();
                    exchange.getRequestHeaders()
                            .forEach((name, values) -> headers.put(name, values.get(0)));
                    callHeaders.add(headers);
                    String token = exchange.getRequestHeaders().getFirst("X-Auth-Token");
                    if (rejectToken || token == null || !token.equals(issuedToken)) {
                        respond(exchange, 401, "{\"msg\":\"expired\"}");
                        return;
                    }
                    respond(
                            exchange,
                            201,
                            "{\"response\":{\"metadata\":{\"documentId\":\"doc-9\"}}}");
                });

        server.createContext(
                "/api/v1/workflows",
                exchange -> {
                    if (!issuedToken.equals(
                            exchange.getRequestHeaders().getFirst("X-Auth-Token"))) {
                        respond(exchange, 401, "{\"msg\":\"expired\"}");
                        return;
                    }
                    workflowBody =
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8);
                    respond(exchange, 201, "{\"response\":{\"id\":\"wf-7\",\"status\":1}}");
                });

        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/api/v1";
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
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

    /** The ConsignO connection an operator would configure. */
    private ApiConnectionSettings consignoConnection() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", baseUrl);
        config.put("authType", "TOKEN_LOGIN");
        config.put("loginPath", "/auth/login");
        config.put(
                "loginBody",
                Map.of("username", "api@acme.test", "password", "s3cr3t", "tenantId", "acme"));
        config.put(
                "loginHeaders",
                Map.of("X-Client-Id", "client-abc", "X-Client-Secret", "client-xyz"));
        config.put("tokenResponseHeader", "X-Auth-Token");
        config.put("tokenHeaderName", "X-Auth-Token");
        return ApiConnectionSettings.from(config);
    }

    private ExternalApiCaller.Response upload(ExternalApiCaller caller) throws IOException {
        return caller.postFile(
                consignoConnection(),
                "/documents",
                "file",
                "contract.pdf",
                "application/pdf",
                "%PDF-1.7".getBytes(StandardCharsets.UTF_8),
                Map.of());
    }

    @Test
    void logsInAndSendsTheTokenFromTheResponseHeader() throws IOException {
        ExternalApiCaller.Response response = upload(caller());

        assertThat(response.status()).isEqualTo(201);
        assertThat(response.bodyAsText()).contains("doc-9");
        assertThat(logins.get()).isEqualTo(1);
        // The token was found in a response header and presented on the next call.
        assertThat(callHeaders)
                .singleElement()
                .extracting(h -> h.get("X-auth-token"))
                .isEqualTo("token-1");
    }

    @Test
    void reusesTheTokenAcrossCallsRatherThanLoggingInPerDocument() throws IOException {
        ExternalApiCaller caller = caller();
        upload(caller);
        upload(caller);
        upload(caller);

        // A 100-document policy must not perform 100 logins.
        assertThat(logins.get()).isEqualTo(1);
        assertThat(callHeaders).hasSize(3);
    }

    @Test
    void reAuthenticatesOnceWhenTheTokenIsRejected() throws IOException {
        ExternalApiCaller caller = caller();
        upload(caller);
        assertThat(logins.get()).isEqualTo(1);

        // The vendor expires the token early and starts issuing a new one.
        issuedToken = "token-2";
        ExternalApiCaller.Response response = upload(caller);

        assertThat(response.status()).isEqualTo(201);
        assertThat(logins.get()).isEqualTo(2);
        assertThat(callHeaders).last().extracting(h -> h.get("X-auth-token")).isEqualTo("token-2");
    }

    @Test
    void aPersistent401SurfacesRatherThanLoopingForever() throws IOException {
        rejectToken = true;

        ExternalApiCaller.Response response = upload(caller());

        assertThat(response.status()).isEqualTo(401);
        // Exactly one retry: the initial login plus one re-auth, then give up.
        assertThat(logins.get()).isEqualTo(2);
    }

    /**
     * The whole ConsignO submit, as an operator would configure it: log in, then post their real
     * workflow shape with the PDF base64'd into {@code documents[0].data}. Their API takes the
     * document inline, so {@code POST /documents} is not needed and the submit is a single call -
     * which is what brings it within reach of the generic step.
     */
    @Test
    void submitsAConsignoSignatureWorkflowEndToEnd() throws IOException {
        byte[] pdf = "%PDF-1.7 contract".getBytes(StandardCharsets.UTF_8);
        ObjectNode context = objectMapper.createObjectNode();
        ObjectNode document = context.putObject("document");
        document.put("filename", "contract.pdf");
        document.put("base64", Base64.getEncoder().encodeToString(pdf));

        String template =
                """
                {
                  "name": "{{document.filename}}",
                  "status": 1,
                  "documents": [
                    {"name": "{{document.filename}}", "data": "{{document.base64}}"}
                  ],
                  "actions": [
                    {"mode":"remote","ref":"1",
                     "signer":{"type":"certifio","email":"notary@example.test","lang":"en"}}
                  ]
                }
                """;
        JsonNode body = Placeholders.resolveTree(objectMapper.readTree(template), context);

        ExternalApiCaller.Response response =
                caller().dispatch(
                                consignoConnection(),
                                "POST",
                                "/workflows",
                                ExternalApiCaller.raw(
                                        "application/json", objectMapper.writeValueAsBytes(body)),
                                Map.of());

        assertThat(response.status()).isEqualTo(201);
        // The workflow id the vendor hands back - the thing a later fetch would need, and which a
        // step currently has no way to carry to the next step.
        assertThat(objectMapper.readTree(response.bodyAsText()).at("/response/id").asString())
                .isEqualTo("wf-7");
        assertThat(logins.get()).isEqualTo(1);

        // The document really arrived, nested where ConsignO expects it.
        JsonNode received = objectMapper.readTree(workflowBody);
        assertThat(received.at("/actions/0/signer/type").asString()).isEqualTo("certifio");
        assertThat(Base64.getDecoder().decode(received.at("/documents/0/data").asString()))
                .isEqualTo(pdf);
    }

    @Test
    void badCredentialsFailTheStepWithoutEchoingThem() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("baseUrl", baseUrl);
        config.put("authType", "TOKEN_LOGIN");
        config.put("loginPath", "/auth/login");
        config.put("loginBody", Map.of("username", "api@acme.test", "password", "wrong"));
        config.put("loginHeaders", Map.of("X-Client-Id", "client-abc", "X-Client-Secret", "nope"));
        config.put("tokenResponseHeader", "X-Auth-Token");
        config.put("tokenHeaderName", "X-Auth-Token");
        ApiConnectionSettings settings = ApiConnectionSettings.from(config);

        assertThatThrownBy(
                        () ->
                                caller().postFile(
                                                settings,
                                                "/documents",
                                                "file",
                                                "c.pdf",
                                                "application/pdf",
                                                "%PDF".getBytes(StandardCharsets.UTF_8),
                                                Map.of()))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("returned HTTP 401")
                // The login body is echoed by some vendors; the message must not carry it onward.
                .hasMessageNotContaining("wrong");
    }
}
