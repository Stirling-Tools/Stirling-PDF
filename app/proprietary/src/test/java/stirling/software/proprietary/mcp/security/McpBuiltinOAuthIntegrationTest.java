package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpAnalytics;
import stirling.software.proprietary.mcp.McpServerController;
import stirling.software.proprietary.mcp.McpWidget;
import stirling.software.proprietary.mcp.oauth.McpClientMetadataFetcher;
import stirling.software.proprietary.mcp.oauth.McpOAuthController;
import stirling.software.proprietary.mcp.oauth.McpOAuthMetadataController;
import stirling.software.proprietary.mcp.oauth.McpOAuthRegistrationLimiter;
import stirling.software.proprietary.mcp.oauth.McpOAuthService;
import stirling.software.proprietary.mcp.oauth.McpTokenMinter;
import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;
import stirling.software.proprietary.mcp.oauth.repository.McpAuthorizationRequestRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthClientRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthGrantRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpRefreshTokenRepository;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.KeyPersistenceServiceInterface;
import stirling.software.proprietary.security.service.UserService;

/** The real MCP chain in builtin mode: public discovery, and only our own MCP tokens accepted. */
@SpringBootTest(
        classes = McpBuiltinOAuthIntegrationTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpBuiltinOAuthIntegrationTest {

    private static final String ISSUER = "http://localhost";
    private static final String RESOURCE_ID = ISSUER + "/mcp";
    private static final String KEY_ID = "builtin-test-key";

    private static KeyPair keyPair;

    @LocalServerPort private int port;
    @Autowired private McpTokenMinter tokenMinter;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeAll
    static void keys() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        keyPair = gen.generateKeyPair();
    }

    @DynamicPropertySource
    static void mcpProperties(DynamicPropertyRegistry registry) {
        registry.add("mcp.enabled", () -> "true");
        registry.add("mcp.auth.mode", () -> "builtin");
        registry.add("mcp.auth.resource-id", () -> RESOURCE_ID);
    }

    @Test
    void authorizationServerMetadataIsPublicAndAdvertisesWhatChatGptNeeds() throws Exception {
        HttpResponse<String> response = get("/.well-known/oauth-authorization-server");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"issuer\":\"" + ISSUER + "\"")
                .contains("\"client_id_metadata_document_supported\":true")
                .contains("\"authorization_response_iss_parameter_supported\":true")
                .contains("\"code_challenge_methods_supported\":[\"S256\"]")
                .contains("offline_access")
                .contains("/oauth/authorize")
                .contains("/api/v1/mcp/oauth/register");
    }

    @Test
    void protectedResourceMetadataPointsAtTheBuiltinIssuer() throws Exception {
        HttpResponse<String> response = get("/.well-known/oauth-protected-resource/mcp");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("authorization_servers").contains(ISSUER);
    }

    @Test
    void jwksPublishesTheSigningKey() throws Exception {
        HttpResponse<String> response = get("/.well-known/jwks.json");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(KEY_ID);
    }

    @Test
    void mintedTokenCallsTools() throws Exception {
        String token =
                tokenMinter.mintAccessToken(
                        ISSUER,
                        "test-user",
                        RESOURCE_ID,
                        "mcp.tools.read mcp.tools.write",
                        "c",
                        1L,
                        5);
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("stirling_describe_operation");
    }

    @Test
    void tokenForARevokedAppIsRejected() throws Exception {
        String token =
                tokenMinter.mintAccessToken(
                        ISSUER,
                        "test-user",
                        RESOURCE_ID,
                        "mcp.tools.read mcp.tools.write",
                        "revoked",
                        1L,
                        5);
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void appSessionStyleTokenSignedWithTheSameKeyIsRejected() throws Exception {
        JWTClaimsSet claims =
                new JWTClaimsSet.Builder()
                        .issuer(ISSUER)
                        .subject("test-user")
                        .audience(List.of(RESOURCE_ID))
                        .claim("scope", "mcp.tools.read mcp.tools.write")
                        .issueTime(Date.from(Instant.now().minusSeconds(5)))
                        .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                        .build();
        SignedJWT jwt =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY_ID).build(), claims);
        jwt.sign(new RSASSASigner(keyPair.getPrivate()));

        HttpResponse<String> response =
                postMcp(jwt.serialize(), "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Autowired private McpOAuthService oauth;
    @Autowired private McpOAuthGrantRepository grants;

    @Test
    void reconnectingTheSameClientDoesNotReviveItsRevokedJwt() throws Exception {
        String clientId = "reconnect";
        var original =
                McpOAuthGrant.builder().id(40L).username("test-user").clientId(clientId).build();
        var current = new java.util.concurrent.atomic.AtomicReference<McpOAuthGrant>(original);
        when(grants.findByUsernameAndClientId("test-user", clientId))
                .thenAnswer(i -> Optional.ofNullable(current.get()));
        when(grants.findById(40L)).thenReturn(Optional.of(original));
        org.mockito.Mockito.doAnswer(
                        i -> {
                            current.set(null);
                            return null;
                        })
                .when(grants)
                .delete(original);
        String old =
                tokenMinter.mintAccessToken(
                        ISSUER,
                        "test-user",
                        RESOURCE_ID,
                        "mcp.tools.read mcp.tools.write",
                        clientId,
                        40L,
                        5);
        String list = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}";
        assertThat(postMcp(old, list).statusCode()).isEqualTo(200);
        assertThat(oauth.revokeGrant("test-user", 40L)).isTrue();
        assertThat(postMcp(old, list).statusCode()).isEqualTo(401);
        when(grants.save(any()))
                .thenAnswer(
                        i -> {
                            McpOAuthGrant granted = i.getArgument(0);
                            granted.setId(41L);
                            current.set(granted);
                            return granted;
                        });
        oauth.approve(
                McpAuthorizationRequest.builder()
                        .username("test-user")
                        .clientId(clientId)
                        .scope("mcp.tools.read mcp.tools.write")
                        .redirectUri("https://client.example/callback")
                        .status(McpAuthorizationRequest.Status.PENDING)
                        .build());
        assertThat(postMcp(old, list).statusCode()).isEqualTo(401);
        String fresh =
                tokenMinter.mintAccessToken(
                        ISSUER,
                        "test-user",
                        RESOURCE_ID,
                        "mcp.tools.read mcp.tools.write",
                        clientId,
                        41L,
                        5);
        assertThat(postMcp(fresh, list).statusCode()).isEqualTo(200);
    }

    @Test
    void anAccessTokenWithoutItsGrantIdentityIsRejected() throws Exception {
        String valid =
                tokenMinter.mintAccessToken(
                        ISSUER, "test-user", RESOURCE_ID, "mcp.tools.read", "c", 1L, 5);
        SignedJWT source = SignedJWT.parse(valid);
        var claims =
                new JWTClaimsSet.Builder(source.getJWTClaimsSet())
                        .claim(McpTokenMinter.GRANT_ID_CLAIM, null)
                        .build();
        var old = new SignedJWT(source.getHeader(), claims);
        old.sign(new RSASSASigner(keyPair.getPrivate()));
        assertThat(
                        postMcp(
                                        old.serialize(),
                                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}")
                                .statusCode())
                .isEqualTo(401);
    }

    @Test
    void tokenForAnotherAudienceIsRejected() throws Exception {
        String token =
                tokenMinter.mintAccessToken(
                        ISSUER, "test-user", "https://elsewhere/mcp", "mcp.tools.read", "c", 1L, 5);
        HttpResponse<String> response =
                postMcp(token, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void dynamicRegistrationReturnsAPublicClient() throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/api/v1/mcp/oauth/register"))
                        .header("Content-Type", "application/json")
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        "{\"client_name\":\"Claude\",\"redirect_uris\":"
                                                + "[\"https://claude.ai/api/mcp/auth_callback\"]}"))
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body())
                .contains("\"token_endpoint_auth_method\":\"none\"")
                .contains("offline_access");
    }

    @Test
    void unknownGrantTypeIsAnOAuthError() throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/api/v1/mcp/oauth/token"))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString("grant_type=password"))
                        .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("unsupported_grant_type");
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(
                HttpRequest.newBuilder().uri(URI.create(base() + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> postMcp(String token, String body) throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(base() + "/mcp"))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer " + token)
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private String base() {
        return "http://localhost:" + port;
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
        McpSecurityConfig.class,
        McpServerController.class,
        McpWidget.class,
        McpAnalytics.class,
        DescribeOperationTool.class,
        StirlingConvertTool.class,
        StirlingPagesTool.class,
        StirlingMiscTool.class,
        StirlingSecurityTool.class,
        StirlingAiTool.class,
        McpTokenMinter.class,
        McpClientMetadataFetcher.class,
        McpOAuthService.class,
        McpOAuthRegistrationLimiter.class,
        McpOAuthController.class,
        McpOAuthMetadataController.class
    })
    static class TestApp {

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties props = new ApplicationProperties();
            props.getMcp().setEnabled(true);
            props.getMcp().getAuth().setMode("builtin");
            props.getMcp().getAuth().setResourceId(RESOURCE_ID);
            props.getAutomaticallyGenerated().setAppVersion("test");
            return props;
        }

        @Bean
        KeyPersistenceServiceInterface keyPersistenceService() {
            KeyPersistenceServiceInterface keys = mock(KeyPersistenceServiceInterface.class);
            JwtVerificationKey active =
                    new JwtVerificationKey(
                            KEY_ID,
                            Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded()));
            when(keys.getActiveKey()).thenReturn(active);
            when(keys.getKeyPair(KEY_ID)).thenReturn(Optional.of(keyPair));
            return keys;
        }

        @Bean
        McpOAuthClientRepository mcpOAuthClientRepository() {
            McpOAuthClientRepository repo = mock(McpOAuthClientRepository.class);
            when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
            return repo;
        }

        @Bean
        McpAuthorizationRequestRepository mcpAuthorizationRequestRepository() {
            return mock(McpAuthorizationRequestRepository.class);
        }

        @Bean
        McpOAuthGrantRepository mcpOAuthGrantRepository() {
            // test-user has connected client "c"; client "revoked" has no standing grant.
            McpOAuthGrantRepository repo = mock(McpOAuthGrantRepository.class);
            when(repo.findByUsernameAndClientId(anyString(), anyString()))
                    .thenReturn(Optional.empty());
            when(repo.findByUsernameAndClientId("test-user", "c"))
                    .thenReturn(
                            Optional.of(
                                    McpOAuthGrant.builder()
                                            .id(1L)
                                            .username("test-user")
                                            .clientId("c")
                                            .build()));
            return repo;
        }

        @Bean
        McpRefreshTokenRepository mcpRefreshTokenRepository() {
            return mock(McpRefreshTokenRepository.class);
        }

        /** Only 'test-user' is a provisioned, enabled account. */
        @Bean
        UserService userService() {
            UserService users = mock(UserService.class);
            User account = mock(User.class);
            when(account.isEnabled()).thenReturn(true);
            when(account.getUsername()).thenReturn("test-user");
            when(users.findByUsernameIgnoreCase(anyString())).thenReturn(Optional.empty());
            when(users.findByUsernameIgnoreCase("test-user")).thenReturn(Optional.of(account));
            return users;
        }
    }
}
