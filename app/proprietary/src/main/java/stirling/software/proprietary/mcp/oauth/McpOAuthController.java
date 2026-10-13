package stirling.software.proprietary.mcp.oauth;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Conditional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthClient;
import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Built-in MCP authorization server endpoints. Register and token are public (clients have no
 * credentials yet); authorizations, consent and grants need a normal Stirling session.
 */
@Hidden
@RestController
@RequestMapping(McpOAuthController.BASE)
@Conditional(McpBuiltinModeCondition.class)
public class McpOAuthController {

    public static final String BASE = "/api/v1/mcp/oauth";
    public static final String TOKEN_PATH = BASE + "/token";
    public static final String REGISTER_PATH = BASE + "/register";

    /** SPA route that fronts the authorization request; see {@link #createAuthorization}. */
    public static final String AUTHORIZE_PATH = "/oauth/authorize";

    static final int MAX_REGISTRATION_BYTES = 16 * 1024;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final McpOAuthService oauthService;
    private final McpOAuthRegistrationLimiter registrationLimiter;

    public McpOAuthController(
            McpOAuthService oauthService, McpOAuthRegistrationLimiter registrationLimiter) {
        this.oauthService = oauthService;
        this.registrationLimiter = registrationLimiter;
    }

    /** RFC 7591 dynamic client registration. Anonymous, rate-limited per IP. */
    @PostMapping(value = "/register", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> register(HttpServletRequest request)
            throws IOException {
        if (!registrationLimiter.tryConsume(request.getRemoteAddr())) {
            return ResponseEntity.status(429)
                    .body(
                            Map.of(
                                    "error",
                                    "temporarily_unavailable",
                                    "error_description",
                                    "Too many client registrations from this address."));
        }
        Map<String, Object> payload = readRegistration(request);
        List<String> redirectUris = new ArrayList<>();
        if (payload.get("redirect_uris") instanceof List<?> list) {
            list.forEach(u -> redirectUris.add(String.valueOf(u)));
        }
        McpOAuthClient client =
                oauthService.register(str(payload.get("client_name")), redirectUris);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("client_id", client.getClientId());
        response.put("client_id_issued_at", client.getCreatedAt().getEpochSecond());
        response.put("client_name", client.getClientName());
        response.put("redirect_uris", client.getRedirectUris());
        response.put("grant_types", List.of("authorization_code", "refresh_token"));
        response.put("response_types", List.of("code"));
        response.put("token_endpoint_auth_method", "none");
        response.put("scope", String.join(" ", oauthService.supportedScopes()));
        return ResponseEntity.status(201).body(response);
    }

    /** Reads at most {@link #MAX_REGISTRATION_BYTES}; anonymous callers can't send more. */
    private Map<String, Object> readRegistration(HttpServletRequest request) throws IOException {
        byte[] bytes;
        try (InputStream in = request.getInputStream()) {
            bytes = in.readNBytes(MAX_REGISTRATION_BYTES + 1);
        }
        if (bytes.length > MAX_REGISTRATION_BYTES) {
            throw new McpOAuthException(
                    "invalid_client_metadata", "Registration request is too large.", 413);
        }
        if (bytes.length == 0) {
            return Map.of();
        }
        try {
            JsonNode node = MAPPER.readTree(bytes);
            if (!node.isObject()) {
                throw new McpOAuthException(
                        "invalid_client_metadata", "Registration must be a JSON object.", 400);
            }
            return MAPPER.convertValue(node, new TypeReference<Map<String, Object>>() {});
        } catch (JacksonException e) {
            throw new McpOAuthException(
                    "invalid_client_metadata", "Registration is not valid JSON.", 400);
        }
    }

    /**
     * Records an authorization request for the signed-in user. The SPA route at /oauth/authorize
     * owns the sign-in round-trip, then calls this and forwards to the consent screen.
     */
    @PostMapping(value = "/authorizations", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> createAuthorization(
            @RequestBody(required = false) Map<String, Object> body,
            Authentication authentication) {
        String username = requireUser(authentication);
        Map<String, Object> params = body == null ? Map.of() : body;
        if (!"code".equals(str(params.get("response_type")))) {
            throw McpOAuthException.invalidRequest("response_type must be 'code'.");
        }
        McpAuthorizationRequest pending =
                oauthService.createAuthorization(
                        str(params.get("client_id")),
                        username,
                        str(params.get("redirect_uri")),
                        str(params.get("state")),
                        str(params.get("scope")),
                        str(params.get("resource")),
                        str(params.get("code_challenge")),
                        str(params.get("code_challenge_method")));
        return ResponseEntity.ok(Map.of("authorization_id", pending.getAuthorizationId()));
    }

    /** Consent details, or a ready-made redirect when this user already granted the client. */
    @GetMapping(value = "/authorizations/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> authorizationDetails(
            @PathVariable("id") String id, Authentication authentication) {
        String username = requireUser(authentication);
        McpAuthorizationRequest pending = requirePending(id, username);

        if (oauthService.hasGrant(username, pending.getClientId())) {
            return ResponseEntity.ok(Map.of("redirect_url", oauthService.approve(pending)));
        }

        McpOAuthClient client =
                oauthService
                        .findClient(pending.getClientId())
                        .orElseThrow(() -> McpOAuthException.invalidClient("Unknown client."));
        Map<String, Object> clientInfo = new LinkedHashMap<>();
        clientInfo.put("id", client.getClientId());
        clientInfo.put("name", client.getClientName());
        // Metadata clients prove their domain by hosting the document; others only name themselves.
        if (client.isMetadataDocument()) {
            clientInfo.put("domain", URI.create(client.getClientId()).getHost());
        }
        clientInfo.put("verified", client.isMetadataDocument());
        clientInfo.put("redirectHost", URI.create(pending.getRedirectUri()).getHost());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authorization_id", pending.getAuthorizationId());
        body.put("redirect_uri", pending.getRedirectUri());
        body.put("client", clientInfo);
        body.put("scope", pending.getScope());
        return ResponseEntity.ok(body);
    }

    /** Record the user's decision and return where to send the browser next. */
    @PostMapping(
            value = "/authorizations/{id}/consent",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> consent(
            @PathVariable("id") String id,
            @RequestBody(required = false) Map<String, Object> body,
            Authentication authentication) {
        String username = requireUser(authentication);
        McpAuthorizationRequest pending = requirePending(id, username);
        String action = body == null ? null : str(body.get("action"));
        if ("approve".equals(action)) {
            return ResponseEntity.ok(Map.of("redirect_url", oauthService.approve(pending)));
        }
        if ("deny".equals(action)) {
            return ResponseEntity.ok(Map.of("redirect_url", oauthService.deny(pending)));
        }
        throw McpOAuthException.invalidRequest("action must be 'approve' or 'deny'.");
    }

    private McpAuthorizationRequest requirePending(String id, String username) {
        McpAuthorizationRequest pending =
                oauthService
                        .findAuthorization(id, username)
                        .orElseThrow(
                                () ->
                                        McpOAuthException.invalidRequest(
                                                "Unknown or expired authorization request."));
        if (pending.getStatus() != McpAuthorizationRequest.Status.PENDING) {
            throw McpOAuthException.invalidRequest("This authorization is no longer pending.");
        }
        return pending;
    }

    @PostMapping(
            value = "/token",
            consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> token(
            @RequestParam(name = "grant_type", required = false) String grantType,
            @RequestParam(name = "code", required = false) String code,
            @RequestParam(name = "client_id", required = false) String clientId,
            @RequestParam(name = "redirect_uri", required = false) String redirectUri,
            @RequestParam(name = "code_verifier", required = false) String codeVerifier,
            @RequestParam(name = "refresh_token", required = false) String refreshToken,
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false)
                    String authorization) {
        String effectiveClientId = clientId != null ? clientId : basicClientId(authorization);
        Map<String, Object> body;
        if ("authorization_code".equals(grantType)) {
            body = oauthService.exchangeCode(code, effectiveClientId, redirectUri, codeVerifier);
        } else if ("refresh_token".equals(grantType)) {
            body = oauthService.refresh(refreshToken, effectiveClientId);
        } else {
            throw McpOAuthException.unsupported(
                    "grant_type must be 'authorization_code' or 'refresh_token'.");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(body);
    }

    /** Some public clients still send client_id as HTTP Basic with an empty secret. */
    static String basicClientId(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Basic ", 0, 6)) {
            return null;
        }
        try {
            String decoded =
                    new String(
                            Base64.getDecoder().decode(authorization.substring(6).trim()),
                            StandardCharsets.UTF_8);
            int colon = decoded.indexOf(':');
            String id = colon < 0 ? decoded : decoded.substring(0, colon);
            return id.isBlank() ? null : URLDecoder.decode(id, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Apps this user has connected, for the "connected apps" list. */
    @GetMapping(value = "/grants", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<Map<String, Object>>> grants(Authentication authentication) {
        String username = requireUser(authentication);
        List<Map<String, Object>> out = new ArrayList<>();
        for (McpOAuthGrant grant : oauthService.listGrants(username)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", grant.getId());
            row.put("clientId", grant.getClientId());
            row.put(
                    "clientName",
                    oauthService
                            .findClient(grant.getClientId())
                            .map(McpOAuthClient::getClientName)
                            .orElse(grant.getClientId()));
            row.put("scope", grant.getScope());
            row.put("createdAt", toIso(grant.getCreatedAt()));
            row.put("lastUsedAt", toIso(grant.getLastUsedAt()));
            out.add(row);
        }
        return ResponseEntity.ok(out);
    }

    @DeleteMapping(value = "/grants/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> revokeGrant(
            @PathVariable("id") Long id, Authentication authentication) {
        String username = requireUser(authentication);
        if (!oauthService.revokeGrant(username, id)) {
            return ResponseEntity.status(404)
                    .body(Map.of("error", "not_found", "error_description", "No such grant."));
        }
        return ResponseEntity.ok(Map.of("revoked", true));
    }

    @ExceptionHandler(McpOAuthException.class)
    public ResponseEntity<Map<String, Object>> handleOAuthError(McpOAuthException e) {
        return ResponseEntity.status(e.getStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(
                        Map.of(
                                "error",
                                e.getError(),
                                "error_description",
                                String.valueOf(e.getMessage())));
    }

    private static String requireUser(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new McpOAuthException("login_required", "Sign in to continue.", 401);
        }
        return authentication.getName();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String toIso(Instant instant) {
        return Optional.ofNullable(instant).map(Instant::toString).orElse(null);
    }
}
