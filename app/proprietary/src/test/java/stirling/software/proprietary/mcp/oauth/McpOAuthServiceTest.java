package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.invocation.InvocationOnMock;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthClient;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;
import stirling.software.proprietary.mcp.oauth.model.McpRefreshToken;
import stirling.software.proprietary.mcp.oauth.repository.McpAuthorizationRequestRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthClientRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthGrantRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpRefreshTokenRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/** Security-critical behaviour of the built-in MCP authorization server. */
class McpOAuthServiceTest {

    private static final String USER = "alice";
    private static final String REDIRECT = "http://localhost:33418/callback";
    private static final String ISSUER = "https://pdf.example.com";
    private static final String CIMD_ID = "https://chatgpt.com/oauth/client.json";
    private static final String CHATGPT_REDIRECT =
            "https://chatgpt.com/connector_platform_oauth_redirect";
    private static final String VERIFIER = "verifier-verifier-verifier-verifier-1234";

    private ApplicationProperties applicationProperties;
    private McpOAuthClientRepository clients;
    private McpAuthorizationRequestRepository authorizations;
    private McpOAuthGrantRepository grants;
    private McpRefreshTokenRepository refreshTokens;
    private McpTokenMinter tokenMinter;
    private McpClientMetadataFetcher metadataFetcher;
    private UserRepository userRepository;
    private ObjectProvider<UserRepository> users;
    private User alice;
    private McpOAuthService service;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getMcp().getAuth().setMode("builtin");
        applicationProperties.getMcp().getAuth().setResourceId(ISSUER + "/mcp");

        clients = mock(McpOAuthClientRepository.class);
        authorizations = mock(McpAuthorizationRequestRepository.class);
        grants = mock(McpOAuthGrantRepository.class);
        refreshTokens = mock(McpRefreshTokenRepository.class);
        tokenMinter = mock(McpTokenMinter.class);
        metadataFetcher = mock(McpClientMetadataFetcher.class);
        userRepository = mock(UserRepository.class);
        alice = new User();
        alice.setId(7L);
        alice.setUsername(USER);
        alice.setEnabled(true);
        when(userRepository.findByUsernameIgnoreCase(USER)).thenReturn(Optional.of(alice));
        users = providerOf(userRepository);

        when(clients.save(any())).thenAnswer(McpOAuthServiceTest::firstArg);
        when(clients.findById(anyString())).thenReturn(Optional.empty());
        when(authorizations.save(any())).thenAnswer(McpOAuthServiceTest::firstArg);
        when(grants.save(any()))
                .thenAnswer(
                        i -> {
                            McpOAuthGrant grant = i.getArgument(0);
                            grant.setId(1L);
                            return grant;
                        });
        when(refreshTokens.consume(anyString(), any())).thenReturn(1);
        when(grants.touch(anyLong(), any())).thenReturn(1);
        when(grants.findByUsernameAndClientId(anyString(), anyString()))
                .thenReturn(Optional.empty());
        when(authorizations.transition(any(), any(), any())).thenReturn(1);
        when(tokenMinter.mintAccessToken(
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyLong(),
                        anyInt()))
                .thenReturn("signed.jwt.value");

        service =
                new McpOAuthService(
                        applicationProperties,
                        clients,
                        authorizations,
                        grants,
                        refreshTokens,
                        tokenMinter,
                        metadataFetcher,
                        users);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<UserRepository> providerOf(UserRepository repository) {
        ObjectProvider<UserRepository> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(repository);
        return provider;
    }

    @SuppressWarnings("unchecked")
    private static <T> T firstArg(InvocationOnMock invocation) {
        return (T) invocation.getArgument(0);
    }

    @Test
    void issuerIsDerivedByStrippingTheMcpSuffix() {
        assertEquals(ISSUER, service.issuer());
        assertEquals(ISSUER + "/mcp", service.audience());
    }

    @Test
    void configuredIssuerWins() {
        applicationProperties.getMcp().getAuth().getBuiltin().setIssuer("https://other.example/");
        assertEquals("https://other.example", service.issuer());
    }

    @Test
    void httpsAndLoopbackRedirectUrisAreAccepted() {
        McpOAuthClient client =
                service.register(
                        "Claude",
                        List.of("https://claude.ai/callback", REDIRECT, "http://127.0.0.1:9/cb"));
        assertEquals(3, client.getRedirectUris().size());
        assertTrue(client.isDynamicallyRegistered());
        assertFalse(client.isMetadataDocument());
        assertEquals("Claude", client.getClientName());
    }

    @Test
    void loopbackRedirectsMayUseAnyPortLikeCodexAndClaudeCode() {
        List<String> codex = List.of("http://127.0.0.1/callback", "http://localhost/callback");

        assertTrue(McpOAuthService.redirectAllowed(codex, "http://127.0.0.1:55274/callback"));
        assertTrue(McpOAuthService.redirectAllowed(codex, "http://localhost:3118/callback"));
        assertFalse(McpOAuthService.redirectAllowed(codex, "http://127.0.0.1:55274/other"));
        assertFalse(McpOAuthService.redirectAllowed(codex, "http://evil.example.com/callback"));
        assertFalse(
                McpOAuthService.redirectAllowed(
                        List.of("https://claude.ai/callback"), "https://claude.ai:8443/callback"));
    }

    @Test
    void plainHttpRedirectUriOffLoopbackIsRejected() {
        McpOAuthException e =
                assertThrows(
                        McpOAuthException.class,
                        () -> service.register("bad", List.of("http://evil.example.com/cb")));
        assertEquals("invalid_request", e.getError());
        verify(clients, never()).save(any());
    }

    @Test
    void redirectUriWithFragmentIsRejected() {
        assertThrows(
                McpOAuthException.class,
                () -> service.register("bad", List.of("https://claude.ai/cb#frag")));
    }

    @Test
    void registrationRequiresAtLeastOneRedirectUri() {
        assertThrows(McpOAuthException.class, () -> service.register("bad", List.of()));
    }

    @Test
    void registrationCanBeTurnedOff() {
        applicationProperties.getMcp().getAuth().getBuiltin().setAllowDynamicRegistration(false);
        McpOAuthException e =
                assertThrows(
                        McpOAuthException.class,
                        () -> service.register("Claude", List.of(REDIRECT)));
        assertEquals(403, e.getStatus());
    }

    @Test
    void authorizationRequiresAKnownClient() {
        McpOAuthException e =
                assertThrows(
                        McpOAuthException.class,
                        () -> authorize("nope", REDIRECT, null, "challenge", "S256"));
        assertEquals("invalid_client", e.getError());
    }

    @Test
    void authorizationRejectsARedirectUriTheClientDidNotRegister() {
        stubClient();
        McpOAuthException e =
                assertThrows(
                        McpOAuthException.class,
                        () ->
                                authorize(
                                        "client-1",
                                        "https://evil.example.com/cb",
                                        null,
                                        "challenge",
                                        "S256"));
        assertEquals("invalid_request", e.getError());
    }

    @Test
    void authorizationRequiresPkceS256Only() {
        stubClient();
        assertThrows(
                McpOAuthException.class, () -> authorize("client-1", REDIRECT, null, null, "S256"));
        assertThrows(
                McpOAuthException.class,
                () -> authorize("client-1", REDIRECT, null, "challenge", "plain"));
        assertThrows(
                McpOAuthException.class,
                () -> authorize("client-1", REDIRECT, null, "challenge", null));
    }

    @Test
    void authorizationGrantsBothToolScopesAndBindsTheAudienceToThisServer() {
        stubClient();
        McpAuthorizationRequest request =
                service.createAuthorization(
                        "client-1",
                        USER,
                        REDIRECT,
                        "state-1",
                        "ignored",
                        "HTTPS://PDF.example.com/mcp/",
                        "challenge",
                        "S256");
        assertEquals(
                McpOAuthService.SCOPE_READ
                        + " "
                        + McpOAuthService.SCOPE_WRITE
                        + " "
                        + McpOAuthService.SCOPE_OFFLINE,
                request.getScope());
        assertEquals(ISSUER + "/mcp", request.getResource());
        assertEquals(McpAuthorizationRequest.Status.PENDING, request.getStatus());
    }

    @Test
    void aResourceNamingAnotherServerIsRefused() {
        // RFC 8707 token redirection: a hostile MCP server names us as its authorization server.
        stubClient();
        McpOAuthException e =
                assertThrows(
                        McpOAuthException.class,
                        () ->
                                service.createAuthorization(
                                        "client-1",
                                        USER,
                                        REDIRECT,
                                        "s",
                                        null,
                                        "https://evil.example/mcp",
                                        "challenge",
                                        "S256"));
        assertEquals("invalid_target", e.getError());
        verify(authorizations, never()).save(any());
    }

    @Test
    void anAcceptedAudienceAliasIsTreatedAsThisServer() {
        applicationProperties
                .getMcp()
                .getAuth()
                .setAcceptedAudiences(List.of("https://pdf.internal.example/mcp"));
        assertTrue(service.isOwnResource("https://pdf.internal.example/mcp/"));
        assertFalse(service.isOwnResource("https://pdf.example.com/other"));
    }

    @Test
    void registrationCapsRedirectUrisAndTrimsLongNames() {
        List<String> many =
                IntStream.range(0, McpOAuthService.MAX_REDIRECT_URIS + 1)
                        .mapToObj(i -> "https://a.example/" + i)
                        .toList();
        assertThrows(McpOAuthException.class, () -> service.register("x", many));
        McpOAuthClient client =
                service.register("n".repeat(500), List.of("https://claude.ai/callback"));
        assertEquals(100, client.getClientName().length());
    }

    @Test
    void offlineAccessIsGrantedWhenRequestedAndAdvertised() {
        stubClient();
        McpAuthorizationRequest request =
                service.createAuthorization(
                        "client-1",
                        USER,
                        REDIRECT,
                        null,
                        "mcp.tools.read offline_access",
                        null,
                        "challenge",
                        "S256");
        assertTrue(request.getScope().contains(McpOAuthService.SCOPE_OFFLINE));
        assertTrue(service.supportedScopes().contains(McpOAuthService.SCOPE_OFFLINE));
    }

    @Test
    void offlineAccessIsDroppedWhenRefreshTokensAreOff() {
        applicationProperties.getMcp().getAuth().getBuiltin().setRefreshTokenDays(0);
        assertFalse(service.grantedScope("offline_access").contains("offline_access"));
        assertFalse(service.supportedScopes().contains(McpOAuthService.SCOPE_OFFLINE));
    }

    @Test
    void offlineAccessTokenExchangeIssuesARefreshTokenAndEchoesTheScope() {
        McpAuthorizationRequest request = approvedWithVerifier();
        request.setScope(service.grantedScope("offline_access"));
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        Map<String, Object> token =
                service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER);

        assertTrue(String.valueOf(token.get("scope")).contains("offline_access"));
        assertTrue(token.containsKey("refresh_token"));
    }

    @Test
    void refreshRotatesTheTokenAndKeepsOfflineAccess() {
        String scope = service.grantedScope("offline_access");
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("old-refresh"))
                        .clientId(CIMD_ID)
                        .username(USER)
                        .scope(scope)
                        .resource(ISSUER + "/mcp")
                        .createdAt(Instant.now())
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(grants.findByUsernameAndClientId(USER, CIMD_ID))
                .thenReturn(Optional.of(McpOAuthGrant.builder().id(1L).username(USER).build()));

        Map<String, Object> token = service.refresh("old-refresh", CIMD_ID);

        verify(refreshTokens).consume(eq(stored.getTokenHash()), any());
        verify(grants).touch(eq(1L), any());
        assertEquals(scope, token.get("scope"));
        assertTrue(token.containsKey("refresh_token"));
        verify(tokenMinter)
                .mintAccessToken(
                        eq(ISSUER),
                        eq(USER),
                        eq(ISSUER + "/mcp"),
                        eq(scope),
                        eq(CIMD_ID),
                        eq(1L),
                        anyInt());
    }

    @Test
    void aReusedRefreshTokenRevokesTheClientsSessions() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("stolen"))
                        .clientId("client-1")
                        .username(USER)
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .consumedAt(Instant.now().minusSeconds(600))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));

        assertThrows(McpOAuthException.class, () -> service.refresh("stolen", "client-1"));
        verify(refreshTokens).deleteByUsernameAndClientId(USER, "client-1");
        verifyNoTokenMinted();
    }

    @Test
    void refreshRequiresTheClientId() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("r"))
                        .clientId("client-1")
                        .username(USER)
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));

        assertThrows(McpOAuthException.class, () -> service.refresh("r", null));
    }

    @Test
    void aCodeLosingTheRedemptionRaceIsRefused() {
        McpAuthorizationRequest request = approvedWithVerifier();
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));
        when(authorizations.transition(any(), any(), any())).thenReturn(0);

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER));
        verifyNoTokenMinted();
    }

    @Test
    void aCodeApprovedBeforeTheGrantWasRevokedIsRefused() {
        McpAuthorizationRequest request = approvedWithVerifier();
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));
        when(grants.findByUsernameAndClientId(USER, "client-1")).thenReturn(Optional.empty());

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER));
    }

    @Test
    void refreshTokensAreOnlyIssuedForOfflineAccess() {
        McpAuthorizationRequest request = approvedWithVerifier();
        request.setScope(McpOAuthService.SCOPE_READ + " " + McpOAuthService.SCOPE_WRITE);
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        Map<String, Object> token =
                service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER);
        assertFalse(token.containsKey("refresh_token"));
    }

    private void verifyNoTokenMinted() {
        verify(tokenMinter, never())
                .mintAccessToken(
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyLong(),
                        anyInt());
    }

    @Test
    void refreshFailsOnceTheGrantIsRevoked() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("old-refresh"))
                        .clientId("client-1")
                        .username(USER)
                        .expiresAt(Instant.now().plusSeconds(3600))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));

        assertThrows(McpOAuthException.class, () -> service.refresh("old-refresh", "client-1"));
        verify(refreshTokens).delete(stored);
    }

    @Test
    void metadataDocumentClientIsFetchedAndStoredWithoutRegistration() {
        when(metadataFetcher.fetch(CIMD_ID))
                .thenReturn(
                        new McpClientMetadataFetcher.ClientMetadata(
                                CIMD_ID, "ChatGPT", List.of(CHATGPT_REDIRECT)));

        McpAuthorizationRequest request =
                service.createAuthorization(
                        CIMD_ID,
                        USER,
                        CHATGPT_REDIRECT,
                        "s",
                        "offline_access",
                        null,
                        "challenge",
                        "S256");

        assertEquals(CIMD_ID, request.getClientId());
        ArgumentCaptor<McpOAuthClient> saved = ArgumentCaptor.forClass(McpOAuthClient.class);
        verify(clients).save(saved.capture());
        assertTrue(saved.getValue().isMetadataDocument());
        assertEquals("ChatGPT", saved.getValue().getClientName());
        assertEquals(List.of(CHATGPT_REDIRECT), saved.getValue().getRedirectUris());
    }

    @Test
    void metadataDocumentRedirectUrisAreValidatedLikeRegistrations() {
        when(metadataFetcher.fetch(CIMD_ID))
                .thenReturn(
                        new McpClientMetadataFetcher.ClientMetadata(
                                CIMD_ID, "Evil", List.of("http://evil.example.com/cb")));
        assertThrows(
                McpOAuthException.class,
                () -> authorize(CIMD_ID, "http://evil.example.com/cb", null, "c", "S256"));
        verify(clients, never()).save(any());
    }

    @Test
    void metadataDocumentsCanBeTurnedOff() {
        applicationProperties
                .getMcp()
                .getAuth()
                .getBuiltin()
                .setAllowClientMetadataDocuments(false);
        assertThrows(
                McpOAuthException.class,
                () -> authorize(CIMD_ID, CHATGPT_REDIRECT, null, "challenge", "S256"));
        verify(metadataFetcher, never()).fetch(anyString());
    }

    @Test
    void aStoredMetadataClientIsNeverTrustedWithoutARefetch() {
        // With CIMD off, a row left from earlier must not authorize from its stale redirect list.
        applicationProperties
                .getMcp()
                .getAuth()
                .getBuiltin()
                .setAllowClientMetadataDocuments(false);
        when(clients.findById(CIMD_ID))
                .thenReturn(
                        Optional.of(
                                McpOAuthClient.builder()
                                        .clientId(CIMD_ID)
                                        .redirectUris(List.of(CHATGPT_REDIRECT))
                                        .metadataDocument(true)
                                        .build()));
        assertThrows(
                McpOAuthException.class,
                () -> authorize(CIMD_ID, CHATGPT_REDIRECT, null, "challenge", "S256"));
    }

    @Test
    void approvalRecordsAGrantAndReturnsCodeStateAndIss() {
        stubClient();
        McpAuthorizationRequest request = pending("state 1&x");

        String redirect = service.approve(request);

        assertTrue(redirect.startsWith(REDIRECT + "?code="));
        assertTrue(redirect.contains("&state=state+1%26x"));
        assertTrue(redirect.endsWith("&iss=https%3A%2F%2Fpdf.example.com"));
        assertEquals(McpAuthorizationRequest.Status.APPROVED, request.getStatus());
        verify(grants).save(any(McpOAuthGrant.class));
    }

    @Test
    void approvalAppendsToARedirectThatAlreadyHasAQuery() {
        McpAuthorizationRequest request = pending(null);
        request.setRedirectUri("https://app.example/cb?tenant=a");
        String redirect = service.approve(request);
        assertTrue(redirect.startsWith("https://app.example/cb?tenant=a&code="));
        assertFalse(redirect.contains("state="));
    }

    @Test
    void approvingTwiceIsRefused() {
        McpAuthorizationRequest request = pending(null);
        service.approve(request);
        assertThrows(McpOAuthException.class, () -> service.approve(request));
    }

    @Test
    void denialReturnsAccessDeniedWithIssAndWithoutAGrant() {
        McpAuthorizationRequest request = pending("state-1");

        String redirect = service.deny(request);

        assertTrue(redirect.contains("error=access_denied"));
        assertTrue(redirect.contains("state=state-1"));
        assertTrue(redirect.contains("iss=https%3A%2F%2Fpdf.example.com"));
        assertEquals(McpAuthorizationRequest.Status.DENIED, request.getStatus());
        verify(grants, never()).save(any());
    }

    @Test
    void codeExchangeVerifiesPkceAndCannotBeReplayed() {
        McpAuthorizationRequest request = approvedWithVerifier();
        String code = request.getCode();
        when(authorizations.findByCode(code)).thenReturn(Optional.of(request));
        when(clients.findById("client-1")).thenReturn(Optional.of(client()));

        Map<String, Object> token = service.exchangeCode(code, "client-1", REDIRECT, VERIFIER);
        assertEquals("signed.jwt.value", token.get("access_token"));
        assertEquals("Bearer", token.get("token_type"));
        assertTrue(token.containsKey("refresh_token"));
        assertEquals(McpAuthorizationRequest.Status.CONSUMED, request.getStatus());

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(code, "client-1", REDIRECT, VERIFIER));
    }

    @Test
    void codeExchangeRejectsAWrongVerifierMismatchedClientAndRedirect() {
        McpAuthorizationRequest request = approvedWithVerifier();
        String code = request.getCode();
        when(authorizations.findByCode(code)).thenReturn(Optional.of(request));

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(code, "client-1", REDIRECT, "wrong-verifier-123456"));
        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(code, "other-client", REDIRECT, VERIFIER));
        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(code, "client-1", "https://elsewhere/cb", VERIFIER));
    }

    @Test
    void expiredCodeIsRefused() {
        McpAuthorizationRequest request = approvedWithVerifier();
        request.setExpiresAt(Instant.now().minusSeconds(1));
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER));
    }

    @Test
    void refreshTokensAreDisabledWhenTheLifetimeIsZero() {
        applicationProperties.getMcp().getAuth().getBuiltin().setRefreshTokenDays(0);
        McpAuthorizationRequest request = approvedWithVerifier();
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        Map<String, Object> token =
                service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER);
        assertFalse(token.containsKey("refresh_token"));
    }

    @Test
    void pkceVerificationRejectsBlanksAndMismatches() {
        String verifier = "abcdefghijklmnopqrstuvwxyz1234567890";
        assertTrue(McpOAuthService.verifyPkce(s256(verifier), verifier));
        assertFalse(McpOAuthService.verifyPkce(s256(verifier), "other"));
        assertFalse(McpOAuthService.verifyPkce(s256(verifier), null));
        assertFalse(McpOAuthService.verifyPkce(null, verifier));
        assertFalse(McpOAuthService.verifyPkce(s256(verifier), " "));
    }

    private McpAuthorizationRequest authorize(
            String clientId, String redirect, String scope, String challenge, String method) {
        return service.createAuthorization(
                clientId, USER, redirect, null, scope, null, challenge, method);
    }

    private void stubClient() {
        when(clients.findById("client-1")).thenReturn(Optional.of(client()));
    }

    private static McpOAuthClient client() {
        return McpOAuthClient.builder()
                .clientId("client-1")
                .clientName("Claude")
                .redirectUris(List.of(REDIRECT))
                .createdAt(Instant.now())
                .dynamicallyRegistered(true)
                .build();
    }

    private McpAuthorizationRequest approvedWithVerifier() {
        McpAuthorizationRequest request = pending(null);
        request.setCodeChallenge(s256(VERIFIER));
        service.approve(request);
        McpOAuthGrant grant =
                McpOAuthGrant.builder().id(1L).username(USER).clientId("client-1").build();
        when(grants.findByUsernameAndClientId(USER, "client-1")).thenReturn(Optional.of(grant));
        return request;
    }

    private McpAuthorizationRequest pending(String state) {
        return McpAuthorizationRequest.builder()
                .authorizationId("auth-1")
                .clientId("client-1")
                .username(USER)
                .redirectUri(REDIRECT)
                .state(state)
                .scope(service.grantedScope(null))
                .resource(ISSUER + "/mcp")
                .codeChallenge("challenge")
                .codeChallengeMethod("S256")
                .status(McpAuthorizationRequest.Status.PENDING)
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
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

    @Test
    void aRefreshLosingTheConsumptionRaceCannotMintTokens() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("raced"))
                        .clientId("client-1")
                        .username(USER)
                        .expiresAt(Instant.now().plusSeconds(300))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(grants.findByUsernameAndClientId(USER, "client-1"))
                .thenReturn(Optional.of(McpOAuthGrant.builder().id(1L).username(USER).build()));
        when(refreshTokens.consume(eq(stored.getTokenHash()), any())).thenReturn(0);
        assertThrows(McpOAuthException.class, () -> service.refresh("raced", "client-1"));
        // The winner of the race just rotated the token, so its new session must survive.
        verify(grants, never()).deleteByUsernameAndClientId(USER, "client-1");
        verifyNoTokenMinted();
    }

    @Test
    void replayingARefreshTokenAlsoRevokesTheAccessGrant() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("replay"))
                        .clientId("client-1")
                        .username(USER)
                        .consumedAt(Instant.now().minusSeconds(600))
                        .expiresAt(Instant.now().plusSeconds(300))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));
        assertThrows(McpOAuthException.class, () -> service.refresh("replay", "client-1"));
        verify(grants).deleteByUsernameAndClientId(USER, "client-1");
        verify(authorizations).deleteByUsernameAndClientId(USER, "client-1");
    }

    @Test
    void aGrantRevokedDuringRefreshCannotBeRecreatedByUpdatingItsLastUse() {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex("revoked"))
                        .clientId("client-1")
                        .username(USER)
                        .expiresAt(Instant.now().plusSeconds(300))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(grants.findByUsernameAndClientId(USER, "client-1"))
                .thenReturn(Optional.of(McpOAuthGrant.builder().id(1L).username(USER).build()));
        when(grants.touch(eq(1L), any())).thenReturn(0);
        assertThrows(McpOAuthException.class, () -> service.refresh("revoked", "client-1"));
        verify(grants, never()).save(any());
        verifyNoTokenMinted();
    }

    private McpRefreshToken liveRefreshToken(String raw) {
        McpRefreshToken stored =
                McpRefreshToken.builder()
                        .tokenHash(McpOAuthService.sha256Hex(raw))
                        .clientId("client-1")
                        .username(USER)
                        .scope(service.grantedScope(null))
                        .expiresAt(Instant.now().plusSeconds(300))
                        .build();
        when(refreshTokens.findById(stored.getTokenHash())).thenReturn(Optional.of(stored));
        return stored;
    }

    private void grantOwnedBy(Long userId) {
        when(grants.findByUsernameAndClientId(USER, "client-1"))
                .thenReturn(
                        Optional.of(
                                McpOAuthGrant.builder()
                                        .id(1L)
                                        .username(USER)
                                        .clientId("client-1")
                                        .userId(userId)
                                        .build()));
    }

    @Test
    void aRefreshRetriedInsideTheGraceWindowIsRefusedWithoutRevokingTheSession() {
        McpRefreshToken stored = liveRefreshToken("retried");
        stored.setConsumedAt(Instant.now().minusSeconds(2));
        assertThrows(McpOAuthException.class, () -> service.refresh("retried", "client-1"));
        verify(grants, never()).deleteByUsernameAndClientId(USER, "client-1");
        verifyNoTokenMinted();
    }

    @Test
    void aDeletedAccountsRefreshTokenIsRefusedAndItsSessionsRemoved() {
        liveRefreshToken("orphan");
        grantOwnedBy(7L);
        when(userRepository.findByUsernameIgnoreCase(USER)).thenReturn(Optional.empty());

        assertThrows(McpOAuthException.class, () -> service.refresh("orphan", "client-1"));
        verify(grants).deleteByUsernameAndClientId(USER, "client-1");
        verifyNoTokenMinted();
    }

    @Test
    void aRecreatedAccountWithTheSameUsernameDoesNotInheritAccess() {
        liveRefreshToken("inherited");
        grantOwnedBy(7L);
        User newcomer = new User();
        newcomer.setId(99L);
        newcomer.setUsername(USER);
        when(userRepository.findByUsernameIgnoreCase(USER)).thenReturn(Optional.of(newcomer));

        assertThrows(McpOAuthException.class, () -> service.refresh("inherited", "client-1"));
        verify(grants).deleteByUsernameAndClientId(USER, "client-1");
        assertFalse(service.isGrantActive(USER, "client-1", "1"));
        assertFalse(service.hasGrant(USER, "client-1"));
        verifyNoTokenMinted();
    }

    @Test
    void aDisabledAccountCannotRefreshButKeepsItsGrantForReEnabling() {
        liveRefreshToken("disabled");
        grantOwnedBy(7L);
        alice.setEnabled(false);

        assertThrows(McpOAuthException.class, () -> service.refresh("disabled", "client-1"));
        verify(grants, never()).deleteByUsernameAndClientId(USER, "client-1");
        assertFalse(service.isGrantActive(USER, "client-1", "1"));
        verifyNoTokenMinted();
    }

    @Test
    void approvalRecordsTheConsentingAccountId() {
        McpAuthorizationRequest request = pending(null);
        ArgumentCaptor<McpOAuthGrant> saved = ArgumentCaptor.forClass(McpOAuthGrant.class);

        service.approve(request);

        verify(grants).save(saved.capture());
        assertEquals(7L, saved.getValue().getUserId());
    }

    @Test
    void aReplayedCodeRevokesTheSessionsItIssued() {
        McpAuthorizationRequest request = approvedWithVerifier();
        request.setStatus(McpAuthorizationRequest.Status.CONSUMED);
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        assertThrows(
                McpOAuthException.class,
                () -> service.exchangeCode(request.getCode(), "client-1", REDIRECT, VERIFIER));
        verify(grants).deleteByUsernameAndClientId(USER, "client-1");
        verify(refreshTokens).deleteByUsernameAndClientId(USER, "client-1");
    }

    @Test
    void codeExchangeAcceptsAnOmittedRedirectUriAsPkceBindsTheCode() {
        McpAuthorizationRequest request = approvedWithVerifier();
        when(authorizations.findByCode(request.getCode())).thenReturn(Optional.of(request));

        Map<String, Object> token =
                service.exchangeCode(request.getCode(), "client-1", null, VERIFIER);
        assertEquals("signed.jwt.value", token.get("access_token"));
    }

    @Test
    void aReadOnlyRequestIsGrantedReadOnly() {
        assertEquals(
                McpOAuthService.SCOPE_READ + " " + McpOAuthService.SCOPE_OFFLINE,
                service.grantedScope("mcp.tools.read"));
        assertTrue(service.grantedScope("mcp.tools.write").contains(McpOAuthService.SCOPE_READ));
        assertTrue(service.grantedScope(null).contains(McpOAuthService.SCOPE_WRITE));
    }

    @Test
    void anOversizedStateIsAnInvalidRequestNotAServerError() {
        stubClient();
        McpOAuthException error =
                assertThrows(
                        McpOAuthException.class,
                        () ->
                                service.createAuthorization(
                                        "client-1",
                                        USER,
                                        REDIRECT,
                                        "x".repeat(3000),
                                        null,
                                        null,
                                        s256(VERIFIER),
                                        "S256"));
        assertEquals("invalid_request", error.getError());
    }

    @Test
    void loopbackRedirectsWithAFragmentOrUserInfoAreNotMatched() {
        List<String> registered = List.of("http://127.0.0.1/callback");
        assertTrue(McpOAuthService.redirectAllowed(registered, "http://127.0.0.1:5555/callback"));
        assertFalse(
                McpOAuthService.redirectAllowed(registered, "http://127.0.0.1:5555/callback#x"));
        assertFalse(
                McpOAuthService.redirectAllowed(registered, "http://evil@127.0.0.1:5555/callback"));
        assertThrows(
                McpOAuthException.class,
                () -> service.register("x", List.of("http://user@127.0.0.1:1234/cb")));
    }
}
