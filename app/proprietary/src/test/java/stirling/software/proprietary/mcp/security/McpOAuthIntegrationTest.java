package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpServerController;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.security.service.UserService;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * End-to-end OAuth test against the real {@link McpSecurityConfig} chain. A real RSA keypair signs
 * JWTs; the public key is served as JWKS over HTTP (mockwebserver) and the resource server fetches
 * and validates against it. The JDK HttpClient drives a live Jetty instance on a random port.
 */
@SpringBootTest(
        classes = McpOAuthIntegrationTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpOAuthIntegrationTest {

    private static final String ISSUER = "https://test-issuer.example.com";
    private static final String RESOURCE_ID = "http://localhost/mcp";

    private static MockWebServer jwksServer;
    private static RSAPrivateKey privateKey;
    private static final String KEY_ID = "mcp-test-key";

    @LocalServerPort private int port;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeAll
    static void startJwks() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair kp = gen.generateKeyPair();
        privateKey = (RSAPrivateKey) kp.getPrivate();
        RSAPublicKey publicKey = (RSAPublicKey) kp.getPublic();

        RSAKey jwk = new RSAKey.Builder(publicKey).keyID(KEY_ID).build();
        String jwksJson = new JWKSet(jwk).toString();

        jwksServer = new MockWebServer();
        jwksServer.setDispatcher(
                new Dispatcher() {
                    @Override
                    public MockResponse dispatch(RecordedRequest request) {
                        return new MockResponse()
                                .setHeader("Content-Type", "application/json")
                                .setBody(jwksJson);
                    }
                });
        jwksServer.start();
    }

    @AfterAll
    static void stopJwks() throws Exception {
        if (jwksServer != null) {
            jwksServer.shutdown();
        }
    }

    @DynamicPropertySource
    static void mcpProperties(DynamicPropertyRegistry registry) {
        registry.add("mcp.enabled", () -> "true");
        registry.add("mcp.auth.issuer-uri", () -> ISSUER);
        registry.add("mcp.auth.jwks-uri", () -> jwksServer.url("/jwks").toString());
        registry.add("mcp.auth.resource-id", () -> RESOURCE_ID);
    }

    @Test
    void noToken_returns401WithResourceMetadataHeader() throws Exception {
        HttpResponse<String> response =
                postMcp(null, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
        String wwwAuth = response.headers().firstValue("WWW-Authenticate").orElse("");
        assertThat(wwwAuth).contains("resource_metadata=");
        // The advertised URL must be the RFC 9728 path-inserted form for the /mcp resource.
        assertThat(wwwAuth).contains("/.well-known/oauth-protected-resource/mcp");
    }

    @Test
    void validToken_callsToolsListSuccessfully() throws Exception {
        String token =
                mintToken(
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read mcp.tools.write",
                        Instant.now().plusSeconds(300));
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("stirling_describe_operation");
    }

    @Test
    void wrongAudience_isRejected() throws Exception {
        String token =
                mintToken(
                        ISSUER,
                        List.of("https://some-other-resource.example.com"),
                        "mcp.tools.read",
                        Instant.now().plusSeconds(300));
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void expiredToken_isRejected() throws Exception {
        String token =
                mintToken(
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read",
                        Instant.now().minusSeconds(60));
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void validTokenButNoStirlingAccount_isRejectedWith403() throws Exception {
        // 'ghost-user' is not provisioned, so account-binding rejects an otherwise-valid token.
        String token =
                mintToken(
                        "ghost-user",
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read mcp.tools.write",
                        Instant.now().plusSeconds(300));
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void oversizedBody_isRejectedWith413() throws Exception {
        String token =
                mintToken(
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read mcp.tools.write",
                        Instant.now().plusSeconds(300));
        StringBuilder big =
                new StringBuilder("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"x\",\"params\":\"");
        big.append("A".repeat(300 * 1024));
        big.append("\"}");
        HttpResponse<String> response = postMcp(token, big.toString());
        assertThat(response.statusCode()).isEqualTo(413);
    }

    @Test
    void oversizedChunkedBody_isRejectedWith413() throws Exception {
        // No Content-Length (chunked transfer) exercises the streaming cap rather than the fast
        // check.
        String token =
                mintToken(
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read mcp.tools.write",
                        Instant.now().plusSeconds(300));
        byte[] big =
                ("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"x\",\"params\":\""
                                + "A".repeat(300 * 1024)
                                + "\"}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/mcp"))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer " + token)
                        .POST(
                                HttpRequest.BodyPublishers.ofInputStream(
                                        () -> new java.io.ByteArrayInputStream(big)))
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(413);
    }

    @Test
    void malformedJson_returnsJsonRpcParseErrorEnvelope() throws Exception {
        // Unparseable JSON must be wrapped as a JSON-RPC Parse error (-32700), not Spring's HTML
        // 400.
        String token =
                mintToken(
                        ISSUER,
                        List.of(RESOURCE_ID),
                        "mcp.tools.read mcp.tools.write",
                        Instant.now().plusSeconds(300));
        HttpResponse<String> response = postMcp(token, "{ this is not valid json ");
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("-32700");
    }

    @Test
    void metadataEndpoint_isReachableWithoutToken() throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/.well-known/oauth-protected-resource"))
                        .GET()
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(RESOURCE_ID);
        assertThat(response.body()).contains(ISSUER);
        assertThat(response.body()).contains("mcp.tools.read");
    }

    @Test
    void pathInsertedMetadataEndpoint_servesCustomizedMetadata() throws Exception {
        // RFC 9728 path-inserted form for the /mcp resource. Must be served by the MCP chain
        // with authorization_servers populated; a default/uncustomized document here makes MCP
        // clients fall back to treating this server as its own authorization server.
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/.well-known/oauth-protected-resource/mcp"))
                        .GET()
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(RESOURCE_ID);
        assertThat(response.body()).contains("authorization_servers");
        assertThat(response.body()).contains(ISSUER);
        assertThat(response.body()).contains("mcp.tools.read");
    }

    private HttpResponse<String> postMcp(String token, String body) throws Exception {
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/mcp"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String base() {
        return "http://localhost:" + port;
    }

    private static String mintToken(
            String issuer, List<String> audience, String scope, Instant expiry) {
        return mintToken("test-user", issuer, audience, scope, expiry);
    }

    private static String mintToken(
            String subject, String issuer, List<String> audience, String scope, Instant expiry) {
        try {
            JWTClaimsSet claims =
                    new JWTClaimsSet.Builder()
                            .issuer(issuer)
                            .subject(subject)
                            .audience(audience)
                            .claim("scope", scope)
                            .issueTime(Date.from(Instant.now().minusSeconds(5)))
                            .expirationTime(Date.from(expiry))
                            .build();
            SignedJWT jwt =
                    new SignedJWT(
                            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY_ID).build(),
                            claims);
            jwt.sign(new RSASSASigner(privateKey));
            return jwt.serialize();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
        McpSecurityConfig.class,
        McpServerController.class,
        DescribeOperationTool.class,
        StirlingConvertTool.class,
        StirlingPagesTool.class,
        StirlingMiscTool.class,
        StirlingSecurityTool.class,
        StirlingAiTool.class
    })
    static class TestApp {

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties props = new ApplicationProperties();
            props.getMcp().setEnabled(true);
            props.getMcp().setMaxRequestBytes(256L * 1024);
            props.getMcp().getAuth().setIssuerUri(ISSUER);
            props.getMcp().getAuth().setJwksUri(jwksServer.url("/jwks").toString());
            props.getMcp().getAuth().setResourceId(RESOURCE_ID);
            props.getAutomaticallyGenerated().setAppVersion("test");
            return props;
        }

        /** Stub UserService: only 'test-user' is a provisioned, enabled account. */
        @Bean
        UserService userService() {
            UserService mock = org.mockito.Mockito.mock(UserService.class);
            stirling.software.proprietary.security.model.User account =
                    org.mockito.Mockito.mock(
                            stirling.software.proprietary.security.model.User.class);
            org.mockito.Mockito.when(account.isEnabled()).thenReturn(true);
            org.mockito.Mockito.when(account.getUsername()).thenReturn("test-user");
            org.mockito.Mockito.when(
                            mock.findByUsernameIgnoreCase(org.mockito.ArgumentMatchers.anyString()))
                    .thenReturn(java.util.Optional.empty());
            org.mockito.Mockito.when(mock.findByUsernameIgnoreCase("test-user"))
                    .thenReturn(java.util.Optional.of(account));
            return mock;
        }
    }
}
