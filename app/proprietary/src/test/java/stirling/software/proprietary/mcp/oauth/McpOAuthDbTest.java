package stirling.software.proprietary.mcp.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthClient;
import stirling.software.proprietary.mcp.oauth.model.McpRefreshToken;
import stirling.software.proprietary.mcp.oauth.repository.McpAuthorizationRequestRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthClientRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthGrantRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpRefreshTokenRepository;

/** The OAuth entities and queries against a real (H2) schema, driven through the service. */
@DataJpaTest
class McpOAuthDbTest {

    private static final String USER = "alice";
    private static final String CIMD_ID =
            "https://chatgpt.com/oauth/" + "a".repeat(300) + "/client.json";
    private static final String REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
    private static final String VERIFIER = "verifier-verifier-verifier-verifier-1234";

    @Autowired private McpOAuthClientRepository clients;
    @Autowired private McpAuthorizationRequestRepository authorizations;
    @Autowired private McpOAuthGrantRepository grants;
    @Autowired private McpRefreshTokenRepository refreshTokens;

    private McpOAuthService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().getAuth().setMode("builtin");
        props.getMcp().getAuth().setResourceId("https://pdf.example.com/mcp");
        McpTokenMinter minter = mock(McpTokenMinter.class);
        when(minter.mintAccessToken(
                        anyString(), anyString(), anyString(), anyString(), anyString(), anyInt()))
                .thenReturn("signed.jwt.value");
        McpClientMetadataFetcher fetcher = mock(McpClientMetadataFetcher.class);
        when(fetcher.fetch(CIMD_ID))
                .thenReturn(
                        new McpClientMetadataFetcher.ClientMetadata(
                                CIMD_ID, "ChatGPT", List.of(REDIRECT)));
        service =
                new McpOAuthService(
                        props, clients, authorizations, grants, refreshTokens, minter, fetcher);
    }

    @Test
    void metadataClientRunsTheWholeFlowWithALongUrlClientId() {
        McpAuthorizationRequest pending =
                service.createAuthorization(
                        CIMD_ID,
                        USER,
                        REDIRECT,
                        "state",
                        "mcp.tools.read offline_access",
                        "https://pdf.example.com/mcp",
                        s256(VERIFIER),
                        "S256");
        assertThat(clients.findById(CIMD_ID))
                .get()
                .extracting(McpOAuthClient::isMetadataDocument)
                .isEqualTo(true);

        String redirect = service.approve(pending);
        String code = authorizations.findById(pending.getAuthorizationId()).get().getCode();
        assertThat(redirect).contains("code=" + code).contains("iss=");
        assertThat(service.hasGrant(USER, CIMD_ID)).isTrue();

        Map<String, Object> issued = service.exchangeCode(code, CIMD_ID, REDIRECT, VERIFIER);
        assertThat(issued.get("scope").toString()).contains("offline_access");
        String refresh = issued.get("refresh_token").toString();

        Map<String, Object> refreshed = service.refresh(refresh, CIMD_ID);
        assertThat(refreshed.get("refresh_token")).isNotEqualTo(refresh);
        assertThatThrownBy(() -> service.refresh(refresh, CIMD_ID))
                .isInstanceOf(McpOAuthException.class);

        Long grantId = grants.findByUsernameAndClientId(USER, CIMD_ID).get().getId();
        assertThat(service.revokeGrant(USER, grantId)).isTrue();
        assertThat(refreshTokens.findAll()).isEmpty();
        assertThatThrownBy(
                        () -> service.refresh(refreshed.get("refresh_token").toString(), CIMD_ID))
                .isInstanceOf(McpOAuthException.class);
    }

    @Test
    void dynamicClientKeepsItsRedirectUris() {
        McpOAuthClient client =
                service.register("Claude", List.of("https://claude.ai/api/mcp/auth_callback"));
        assertThat(clients.findById(client.getClientId()).get().getRedirectUris())
                .containsExactly("https://claude.ai/api/mcp/auth_callback");
    }

    @Test
    void purgeRemovesOnlyExpiredRows() {
        Instant now = Instant.now();
        authorizations.save(authorization("old", now.minusSeconds(5)));
        authorizations.save(authorization("live", now.plusSeconds(300)));
        refreshTokens.save(refreshToken("old-hash", now.minusSeconds(5)));
        refreshTokens.save(refreshToken("live-hash", now.plusSeconds(300)));

        service.purgeExpired();

        assertThat(authorizations.findAll())
                .extracting(McpAuthorizationRequest::getAuthorizationId)
                .containsExactly("live");
        assertThat(refreshTokens.findAll())
                .extracting(McpRefreshToken::getTokenHash)
                .containsExactly("live-hash");
    }

    @Test
    void purgeDropsOldRegistrationsNobodyConnected() {
        Instant old = Instant.now().minusSeconds(30L * 86400);
        clients.save(client("abandoned", old, null));
        clients.save(client("used", old, Instant.now()));
        clients.save(client("fresh", Instant.now(), null));

        service.purgeExpired();

        assertThat(clients.findAll())
                .extracting(McpOAuthClient::getClientId)
                .containsExactlyInAnyOrder("used", "fresh");
    }

    private static McpOAuthClient client(String id, Instant createdAt, Instant lastUsedAt) {
        return McpOAuthClient.builder()
                .clientId(id)
                .clientName(id)
                .redirectUris(List.of(REDIRECT))
                .createdAt(createdAt)
                .lastUsedAt(lastUsedAt)
                .dynamicallyRegistered(true)
                .build();
    }

    private static McpAuthorizationRequest authorization(String id, Instant expiresAt) {
        return McpAuthorizationRequest.builder()
                .authorizationId(id)
                .clientId("client-1")
                .username(USER)
                .redirectUri(REDIRECT)
                .status(McpAuthorizationRequest.Status.PENDING)
                .createdAt(Instant.now())
                .expiresAt(expiresAt)
                .build();
    }

    private static McpRefreshToken refreshToken(String hash, Instant expiresAt) {
        return McpRefreshToken.builder()
                .tokenHash(hash)
                .clientId("client-1")
                .username(USER)
                .createdAt(Instant.now())
                .expiresAt(expiresAt)
                .build();
    }

    private static String s256(String value) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
