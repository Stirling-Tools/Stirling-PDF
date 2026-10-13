package stirling.software.proprietary.mcp.oauth;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Conditional;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthClient;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;
import stirling.software.proprietary.mcp.oauth.model.McpRefreshToken;
import stirling.software.proprietary.mcp.oauth.repository.McpAuthorizationRequestRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthClientRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpOAuthGrantRepository;
import stirling.software.proprietary.mcp.oauth.repository.McpRefreshTokenRepository;

/**
 * Stirling's own OAuth 2.1 authorization server for /mcp: DCR, Client ID Metadata Documents, PKCE
 * codes, consent, and token issue/refresh. Scopes are fixed so an admin configures nothing.
 */
@Slf4j
@Service
@Conditional(McpBuiltinModeCondition.class)
public class McpOAuthService {

    public static final String SCOPE_READ = "mcp.tools.read";
    public static final String SCOPE_WRITE = "mcp.tools.write";
    public static final String SCOPE_OFFLINE = "offline_access";
    private static final String TOOL_SCOPES = SCOPE_READ + " " + SCOPE_WRITE;

    static final int MAX_REDIRECT_URIS = 10;
    private static final int MAX_URI_LENGTH = 2048;
    private static final int MAX_NAME_LENGTH = 100;
    // Registered clients nobody ever connected are dropped after this.
    private static final Duration UNUSED_CLIENT_TTL = Duration.ofDays(7);

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final ApplicationProperties applicationProperties;
    private final McpOAuthClientRepository clients;
    private final McpAuthorizationRequestRepository authorizations;
    private final McpOAuthGrantRepository grants;
    private final McpRefreshTokenRepository refreshTokens;
    private final McpTokenMinter tokenMinter;
    private final McpClientMetadataFetcher metadataFetcher;
    private final Cache<String, Boolean> activeGrants =
            Caffeine.newBuilder()
                    .maximumSize(10_000)
                    .expireAfterWrite(Duration.ofSeconds(10))
                    .build();

    public McpOAuthService(
            ApplicationProperties applicationProperties,
            McpOAuthClientRepository clients,
            McpAuthorizationRequestRepository authorizations,
            McpOAuthGrantRepository grants,
            McpRefreshTokenRepository refreshTokens,
            McpTokenMinter tokenMinter,
            McpClientMetadataFetcher metadataFetcher) {
        this.applicationProperties = applicationProperties;
        this.clients = clients;
        this.authorizations = authorizations;
        this.grants = grants;
        this.refreshTokens = refreshTokens;
        this.tokenMinter = tokenMinter;
        this.metadataFetcher = metadataFetcher;
    }

    private ApplicationProperties.Mcp.Auth auth() {
        return applicationProperties.getMcp().getAuth();
    }

    private ApplicationProperties.Mcp.Auth.Builtin builtin() {
        return auth().getBuiltin();
    }

    /** Issuer for minted tokens: configured value, else the resource id minus its /mcp suffix. */
    public String issuer() {
        String configured = builtin().getIssuer();
        if (configured != null && !configured.isBlank()) {
            return trimTrailingSlash(configured);
        }
        String resourceId = trimTrailingSlash(auth().getResourceId());
        if (resourceId.endsWith("/mcp")) {
            return resourceId.substring(0, resourceId.length() - "/mcp".length());
        }
        return resourceId;
    }

    /** Audience for minted tokens; the MCP resource itself (RFC 8707). */
    public String audience() {
        return trimTrailingSlash(auth().getResourceId());
    }

    public boolean refreshTokensEnabled() {
        return builtin().getRefreshTokenDays() > 0;
    }

    /** Every scope a client may be granted; offline_access only while refresh tokens exist. */
    public List<String> supportedScopes() {
        List<String> scopes = new ArrayList<>(List.of(SCOPE_READ, SCOPE_WRITE));
        if (refreshTokensEnabled()) {
            scopes.add(SCOPE_OFFLINE);
        }
        return scopes;
    }

    /** The tool scopes, plus offline_access whenever refresh tokens are on (consent shows it). */
    String grantedScope(String requested) {
        return refreshTokensEnabled() ? TOOL_SCOPES + " " + SCOPE_OFFLINE : TOOL_SCOPES;
    }

    private static boolean hasScope(String scope, String wanted) {
        return scope != null && Arrays.asList(scope.trim().split("\\s+")).contains(wanted);
    }

    /** True when {@code resource} names this server: the resource id or an accepted audience. */
    boolean isOwnResource(String resource) {
        String wanted = canonical(resource);
        if (wanted.equals(canonical(audience()))) {
            return true;
        }
        List<String> aliases = auth().getAcceptedAudiences();
        return aliases != null && aliases.stream().anyMatch(a -> canonical(a).equals(wanted));
    }

    /** Lower-cased scheme and host, no trailing slash; the path stays case-sensitive. */
    static String canonical(String value) {
        String v = trimTrailingSlash(value);
        try {
            URI uri = URI.create(v);
            if (uri.getScheme() == null || uri.getHost() == null) {
                return v;
            }
            String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            return uri.getScheme().toLowerCase(Locale.ROOT)
                    + "://"
                    + uri.getHost().toLowerCase(Locale.ROOT)
                    + port
                    + path;
        } catch (IllegalArgumentException e) {
            return v;
        }
    }

    private static String trimTrailingSlash(String value) {
        String v = value == null ? "" : value.trim();
        return v.endsWith("/") ? v.substring(0, v.length() - 1) : v;
    }

    /** RFC 7591 dynamic client registration. Public clients only; PKCE is mandatory later. */
    @Transactional
    public McpOAuthClient register(String clientName, List<String> redirectUris) {
        if (!builtin().isAllowDynamicRegistration()) {
            throw new McpOAuthException(
                    "access_denied",
                    "Dynamic client registration is disabled on this server.",
                    403);
        }
        List<String> validated = validateRedirectUris(redirectUris);
        McpOAuthClient client =
                McpOAuthClient.builder()
                        .clientId(randomId())
                        .clientName(nameOrDefault(clientName))
                        .redirectUris(validated)
                        .createdAt(Instant.now())
                        .dynamicallyRegistered(true)
                        .build();
        log.info(
                "MCP dynamic client registration: '{}' with {} redirect URI(s)",
                sanitize(client.getClientName()),
                validated.size());
        return clients.save(client);
    }

    private List<String> validateRedirectUris(List<String> redirectUris) {
        if (redirectUris != null && redirectUris.size() > MAX_REDIRECT_URIS) {
            throw McpOAuthException.invalidRequest(
                    "At most " + MAX_REDIRECT_URIS + " redirect_uris are allowed.");
        }
        List<String> validated = new ArrayList<>();
        for (String uri : redirectUris == null ? List.<String>of() : redirectUris) {
            validated.add(validateRedirectUri(uri));
        }
        if (validated.isEmpty()) {
            throw McpOAuthException.invalidRequest("At least one redirect_uri is required.");
        }
        return validated;
    }

    /** HTTPS anywhere, HTTP only on loopback (native clients), never a fragment. */
    private String validateRedirectUri(String value) {
        if (value == null || value.isBlank()) {
            throw McpOAuthException.invalidRequest("redirect_uri must not be blank.");
        }
        if (value.length() > MAX_URI_LENGTH) {
            throw McpOAuthException.invalidRequest("redirect_uri is too long.");
        }
        URI uri;
        try {
            uri = URI.create(value.trim());
        } catch (IllegalArgumentException e) {
            throw McpOAuthException.invalidRequest("redirect_uri is not a valid URI.");
        }
        if (!uri.isAbsolute() || uri.getHost() == null) {
            throw McpOAuthException.invalidRequest("redirect_uri must be absolute.");
        }
        if (uri.getFragment() != null) {
            throw McpOAuthException.invalidRequest("redirect_uri must not contain a fragment.");
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        boolean loopback =
                "localhost".equalsIgnoreCase(host)
                        || "127.0.0.1".equals(host)
                        || "[::1]".equals(host)
                        || "::1".equals(host);
        if ("https".equals(scheme) || ("http".equals(scheme) && loopback)) {
            return uri.toString();
        }
        throw McpOAuthException.invalidRequest(
                "redirect_uri must use https, or http on a loopback address.");
    }

    public Optional<McpOAuthClient> findClient(String clientId) {
        return clientId == null ? Optional.empty() : clients.findById(clientId);
    }

    /** A registered client, or for an https client_id its freshly resolved metadata document. */
    public McpOAuthClient resolveClient(String clientId) {
        if (McpClientMetadataFetcher.isMetadataClientId(clientId)
                && builtin().isAllowClientMetadataDocuments()) {
            return upsertMetadataClient(metadataFetcher.fetch(clientId));
        }
        return findClient(clientId)
                .filter(c -> !c.isMetadataDocument())
                .orElseThrow(() -> McpOAuthException.invalidClient("Unknown client_id."));
    }

    private McpOAuthClient upsertMetadataClient(McpClientMetadataFetcher.ClientMetadata metadata) {
        List<String> redirectUris = validateRedirectUris(metadata.redirectUris());
        McpOAuthClient client =
                clients.findById(metadata.clientId())
                        .orElseGet(
                                () ->
                                        McpOAuthClient.builder()
                                                .clientId(metadata.clientId())
                                                .createdAt(Instant.now())
                                                .metadataDocument(true)
                                                .build());
        client.setClientName(nameOrDefault(metadata.clientName()));
        client.setRedirectUris(new ArrayList<>(redirectUris));
        client.setMetadataDocument(true);
        return clients.save(client);
    }

    private static String nameOrDefault(String clientName) {
        if (clientName == null || clientName.isBlank()) {
            return "MCP client";
        }
        String name = clientName.trim();
        return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH) : name;
    }

    /** Validate an /authorize request and record it as pending; no transaction around the fetch. */
    public McpAuthorizationRequest createAuthorization(
            String clientId,
            String username,
            String redirectUri,
            String state,
            String scope,
            String resource,
            String codeChallenge,
            String codeChallengeMethod) {
        McpOAuthClient client = resolveClient(clientId);
        if (!redirectAllowed(client.getRedirectUris(), redirectUri)) {
            log.info(
                    "MCP authorization refused: redirect_uri '{}' is not registered for client '{}'",
                    sanitizeForLog(redirectUri),
                    sanitizeForLog(client.getClientName()));
            // Never redirect to an unregistered URI, so this error stays on our page.
            throw McpOAuthException.invalidRequest(
                    "redirect_uri does not match a registered URI for this client.");
        }
        if (codeChallenge == null || codeChallenge.isBlank()) {
            throw McpOAuthException.invalidRequest("PKCE code_challenge is required.");
        }
        if (!"S256".equals(codeChallengeMethod)) {
            throw McpOAuthException.invalidRequest("code_challenge_method must be S256.");
        }
        String audience = audience();
        if (resource != null && !resource.isBlank() && !isOwnResource(resource)) {
            // RFC 8707: a token for another server must never be minted here (token redirection).
            throw new McpOAuthException(
                    "invalid_target",
                    "resource must be this server's MCP endpoint (" + audience + ").",
                    400);
        }
        Instant now = Instant.now();
        McpAuthorizationRequest request =
                McpAuthorizationRequest.builder()
                        .authorizationId(randomId())
                        .clientId(client.getClientId())
                        .username(username)
                        .redirectUri(redirectUri)
                        .state(state)
                        .scope(grantedScope(scope))
                        .resource(audience)
                        .codeChallenge(codeChallenge)
                        .codeChallengeMethod("S256")
                        .status(McpAuthorizationRequest.Status.PENDING)
                        .createdAt(now)
                        .expiresAt(now.plusSeconds(builtin().getAuthorizationCodeSeconds()))
                        .build();
        return authorizations.save(request);
    }

    /**
     * Exact match, except that a loopback redirect may use any port (RFC 8252 section 7.3): native
     * apps such as Codex or Claude Code register http://127.0.0.1/callback and listen on a free
     * port.
     */
    static boolean redirectAllowed(List<String> registered, String requested) {
        if (requested == null || registered == null) {
            return false;
        }
        if (registered.contains(requested)) {
            return true;
        }
        URI asked = parse(requested);
        if (asked == null || !"http".equals(asked.getScheme()) || !isLoopback(asked.getHost())) {
            return false;
        }
        for (String candidate : registered) {
            URI allowed = parse(candidate);
            if (allowed != null
                    && "http".equals(allowed.getScheme())
                    && asked.getHost().equalsIgnoreCase(allowed.getHost())
                    && java.util.Objects.equals(asked.getRawPath(), allowed.getRawPath())
                    && java.util.Objects.equals(asked.getRawQuery(), allowed.getRawQuery())) {
                return true;
            }
        }
        return false;
    }

    private static URI parse(String uri) {
        try {
            return new URI(uri);
        } catch (java.net.URISyntaxException e) {
            return null;
        }
    }

    private static boolean isLoopback(String host) {
        return "127.0.0.1".equals(host)
                || "[::1]".equals(host)
                || "localhost".equalsIgnoreCase(host);
    }

    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replaceAll("[\r\n\t]", "_");
    }

    /** Look up a pending authorization, scoped to the user who started it. */
    public Optional<McpAuthorizationRequest> findAuthorization(
            String authorizationId, String username) {
        return authorizations
                .findById(authorizationId)
                .filter(r -> r.getUsername().equalsIgnoreCase(username))
                .filter(r -> r.getExpiresAt().isAfter(Instant.now()));
    }

    /** Whether a token's grant still stands; cached briefly as every /mcp call asks. */
    public boolean isGrantActive(String username, String clientId) {
        if (username == null || clientId == null) {
            return false;
        }
        return activeGrants.get(grantKey(username, clientId), k -> hasGrant(username, clientId));
    }

    private static String grantKey(String username, String clientId) {
        return username.toLowerCase(Locale.ROOT) + "\n" + clientId;
    }

    /** True when this user already granted this client, so consent can be skipped. */
    public boolean hasGrant(String username, String clientId) {
        return grants.findByUsernameAndClientId(username, clientId).isPresent();
    }

    /** Record the standing grant, attach a single-use code, and return the client redirect. */
    @Transactional
    public String approve(McpAuthorizationRequest request) {
        if (request.getStatus() != McpAuthorizationRequest.Status.PENDING) {
            throw McpOAuthException.invalidGrant("This authorization is no longer pending.");
        }
        Instant now = Instant.now();
        McpOAuthGrant grant =
                grants.findByUsernameAndClientId(request.getUsername(), request.getClientId())
                        .orElseGet(
                                () ->
                                        McpOAuthGrant.builder()
                                                .username(request.getUsername())
                                                .clientId(request.getClientId())
                                                .createdAt(now)
                                                .build());
        grant.setScope(request.getScope());
        grant.setLastUsedAt(now);
        grants.save(grant);

        request.setCode(randomId());
        request.setStatus(McpAuthorizationRequest.Status.APPROVED);
        authorizations.save(request);

        Map<String, String> params = new LinkedHashMap<>();
        params.put("code", request.getCode());
        params.put("state", request.getState());
        params.put("iss", issuer());
        return appendQuery(request.getRedirectUri(), params);
    }

    /** Deny an authorization and return the error redirect for the client. */
    @Transactional
    public String deny(McpAuthorizationRequest request) {
        request.setStatus(McpAuthorizationRequest.Status.DENIED);
        authorizations.save(request);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("error", "access_denied");
        params.put("error_description", "The user denied the request.");
        params.put("state", request.getState());
        params.put("iss", issuer());
        return appendQuery(request.getRedirectUri(), params);
    }

    /** Form-encodes each value so a client's state round-trips exactly; blanks are dropped. */
    static String appendQuery(String uri, Map<String, String> params) {
        StringBuilder out = new StringBuilder(uri);
        char separator = uri.contains("?") ? '&' : '?';
        for (Map.Entry<String, String> param : params.entrySet()) {
            if (param.getValue() == null || param.getValue().isBlank()) {
                continue;
            }
            out.append(separator)
                    .append(param.getKey())
                    .append('=')
                    .append(URLEncoder.encode(param.getValue(), StandardCharsets.UTF_8));
            separator = '&';
        }
        return out.toString();
    }

    /** Authorization-code grant with PKCE verification. */
    @Transactional
    public Map<String, Object> exchangeCode(
            String code, String clientId, String redirectUri, String codeVerifier) {
        McpAuthorizationRequest request =
                authorizations
                        .findByCode(code == null ? "" : code)
                        .orElseThrow(
                                () ->
                                        McpOAuthException.invalidGrant(
                                                "Unknown authorization code."));
        if (request.getStatus() != McpAuthorizationRequest.Status.APPROVED) {
            throw McpOAuthException.invalidGrant("Authorization code has already been used.");
        }
        if (request.getExpiresAt().isBefore(Instant.now())) {
            throw McpOAuthException.invalidGrant("Authorization code has expired.");
        }
        if (clientId == null || !clientId.equals(request.getClientId())) {
            throw McpOAuthException.invalidClient("client_id does not match the code.");
        }
        if (redirectUri == null || !redirectUri.equals(request.getRedirectUri())) {
            throw McpOAuthException.invalidGrant("redirect_uri does not match the code.");
        }
        if (!verifyPkce(request.getCodeChallenge(), codeVerifier)) {
            throw McpOAuthException.invalidGrant("PKCE verification failed.");
        }
        if (grants.findByUsernameAndClientId(request.getUsername(), clientId).isEmpty()) {
            throw McpOAuthException.invalidGrant("Access for this client has been revoked.");
        }
        // Conditional update, so two concurrent redemptions cannot both mint a token.
        if (authorizations.transition(
                        request.getAuthorizationId(),
                        McpAuthorizationRequest.Status.APPROVED,
                        McpAuthorizationRequest.Status.CONSUMED)
                != 1) {
            throw McpOAuthException.invalidGrant("Authorization code has already been used.");
        }
        request.setStatus(McpAuthorizationRequest.Status.CONSUMED);

        clients.findById(clientId)
                .ifPresent(
                        c -> {
                            c.setLastUsedAt(Instant.now());
                            clients.save(c);
                        });

        return issueTokens(
                request.getUsername(), clientId, request.getScope(), request.getResource());
    }

    /** Refresh-token grant. The presented token is rotated out. */
    // Revocations made before an OAuth error must still commit.
    @Transactional(noRollbackFor = McpOAuthException.class)
    public Map<String, Object> refresh(String refreshToken, String clientId) {
        String hash = sha256Hex(refreshToken == null ? "" : refreshToken);
        McpRefreshToken stored =
                refreshTokens
                        .findById(hash)
                        .orElseThrow(
                                () -> McpOAuthException.invalidGrant("Unknown refresh token."));
        if (stored.getConsumedAt() != null) {
            // A rotated token came back: assume theft and end every session for this client.
            refreshTokens.deleteByUsernameAndClientId(stored.getUsername(), stored.getClientId());
            log.warn(
                    "MCP refresh token reused for client {}; its sessions were revoked",
                    sanitize(stored.getClientId()));
            throw McpOAuthException.invalidGrant("Refresh token has already been used.");
        }
        if (stored.getExpiresAt().isBefore(Instant.now())) {
            refreshTokens.delete(stored);
            throw McpOAuthException.invalidGrant("Refresh token has expired.");
        }
        if (clientId == null || !clientId.equals(stored.getClientId())) {
            throw McpOAuthException.invalidClient("client_id does not match the refresh token.");
        }
        Optional<McpOAuthGrant> grant =
                grants.findByUsernameAndClientId(stored.getUsername(), stored.getClientId());
        if (grant.isEmpty()) {
            // Access was revoked while the client held a refresh token.
            refreshTokens.delete(stored);
            throw McpOAuthException.invalidGrant("Access for this client has been revoked.");
        }
        // Kept as consumed until it expires, so a replay is recognised.
        stored.setConsumedAt(Instant.now());
        refreshTokens.save(stored);
        grant.get().setLastUsedAt(Instant.now());
        grants.save(grant.get());
        return issueTokens(
                stored.getUsername(),
                stored.getClientId(),
                stored.getScope(),
                stored.getResource());
    }

    private Map<String, Object> issueTokens(
            String username, String clientId, String scope, String resource) {
        String audience = (resource == null || resource.isBlank()) ? audience() : resource;
        int minutes = builtin().getAccessTokenMinutes();
        String accessToken =
                tokenMinter.mintAccessToken(issuer(), username, audience, scope, clientId, minutes);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", accessToken);
        body.put("token_type", "Bearer");
        body.put("expires_in", minutes * 60);
        body.put("scope", scope);

        if (refreshTokensEnabled() && hasScope(scope, SCOPE_OFFLINE)) {
            String refreshToken = randomId() + randomId();
            Instant now = Instant.now();
            refreshTokens.save(
                    McpRefreshToken.builder()
                            .tokenHash(sha256Hex(refreshToken))
                            .clientId(clientId)
                            .username(username)
                            .scope(scope)
                            .resource(audience)
                            .createdAt(now)
                            .expiresAt(now.plusSeconds(builtin().getRefreshTokenDays() * 86400L))
                            .build());
            body.put("refresh_token", refreshToken);
        }
        return body;
    }

    public List<McpOAuthGrant> listGrants(String username) {
        return grants.findByUsernameOrderByCreatedAtDesc(username);
    }

    /** Revoke a grant and every refresh token issued under it. */
    @Transactional
    public boolean revokeGrant(String username, Long grantId) {
        Optional<McpOAuthGrant> grant =
                grants.findById(grantId).filter(g -> g.getUsername().equalsIgnoreCase(username));
        if (grant.isEmpty()) {
            return false;
        }
        refreshTokens.deleteByUsernameAndClientId(
                grant.get().getUsername(), grant.get().getClientId());
        authorizations.deleteByUsernameAndClientId(
                grant.get().getUsername(), grant.get().getClientId());
        grants.delete(grant.get());
        activeGrants.invalidate(grantKey(grant.get().getUsername(), grant.get().getClientId()));
        log.info("MCP grant revoked for client {}", sanitize(grant.get().getClientId()));
        return true;
    }

    /** Expired codes and refresh tokens are dead weight; clear them hourly. */
    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 600_000L)
    @Transactional
    public void purgeExpired() {
        Instant now = Instant.now();
        int codes = authorizations.deleteExpired(now);
        int tokens = refreshTokens.deleteExpired(now);
        // Entity deletes, so each client's redirect URI rows go with it.
        List<McpOAuthClient> stale =
                clients.findUnusedRegistrations(
                        now.minus(UNUSED_CLIENT_TTL), PageRequest.of(0, 500));
        clients.deleteAll(stale);
        int unused = stale.size();
        if (codes > 0 || tokens > 0 || unused > 0) {
            log.debug(
                    "MCP OAuth purge removed {} authorization(s), {} refresh token(s) and {}"
                            + " unused client(s)",
                    codes,
                    tokens,
                    unused);
        }
    }

    static boolean verifyPkce(String challenge, String verifier) {
        if (challenge == null || verifier == null || verifier.isBlank()) {
            return false;
        }
        String computed = B64.encodeToString(sha256(verifier.getBytes(StandardCharsets.US_ASCII)));
        return MessageDigest.isEqual(
                computed.getBytes(StandardCharsets.US_ASCII),
                challenge.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String sha256Hex(String value) {
        byte[] digest = sha256(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            out.append(Character.forDigit((b >> 4) & 0xF, 16))
                    .append(Character.forDigit(b & 0xF, 16));
        }
        return out.toString();
    }

    private static String randomId() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return B64.encodeToString(bytes);
    }

    private static String sanitize(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }
}
