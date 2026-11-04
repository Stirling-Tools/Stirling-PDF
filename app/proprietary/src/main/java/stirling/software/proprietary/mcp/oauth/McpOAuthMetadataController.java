package stirling.software.proprietary.mcp.oauth;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Conditional;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import stirling.software.common.model.ApplicationProperties;

/** RFC 8414 metadata and the signing JWKS; public because clients read them before any login. */
@Hidden
@RestController
@Conditional(McpBuiltinModeCondition.class)
public class McpOAuthMetadataController {

    public static final String METADATA_PATH = "/.well-known/oauth-authorization-server";
    public static final String OPENID_PATH = "/.well-known/openid-configuration";
    public static final String JWKS_PATH = "/.well-known/jwks.json";

    private final McpOAuthService oauthService;
    private final McpTokenMinter tokenMinter;
    private final ApplicationProperties applicationProperties;

    public McpOAuthMetadataController(
            McpOAuthService oauthService,
            McpTokenMinter tokenMinter,
            ApplicationProperties applicationProperties) {
        this.oauthService = oauthService;
        this.tokenMinter = tokenMinter;
        this.applicationProperties = applicationProperties;
    }

    /** The authorize step is an SPA route, so it lives wherever the UI is served. */
    private String appBaseUrl(String issuer) {
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (frontendUrl != null && !frontendUrl.isBlank()) {
            String trimmed = frontendUrl.trim();
            return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
        }
        return issuer;
    }

    @GetMapping(value = METADATA_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> authorizationServerMetadata() {
        String issuer = oauthService.issuer();
        ApplicationProperties.Mcp.Auth.Builtin builtin =
                applicationProperties.getMcp().getAuth().getBuiltin();
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("issuer", issuer);
        doc.put("authorization_endpoint", appBaseUrl(issuer) + McpOAuthController.AUTHORIZE_PATH);
        doc.put("token_endpoint", issuer + McpOAuthController.TOKEN_PATH);
        if (builtin.isAllowDynamicRegistration()) {
            doc.put("registration_endpoint", issuer + McpOAuthController.REGISTER_PATH);
        }
        doc.put("jwks_uri", issuer + JWKS_PATH);
        doc.put("response_types_supported", List.of("code"));
        doc.put("response_modes_supported", List.of("query"));
        doc.put("grant_types_supported", List.of("authorization_code", "refresh_token"));
        doc.put("code_challenge_methods_supported", List.of("S256"));
        doc.put("token_endpoint_auth_methods_supported", List.of("none"));
        doc.put("scopes_supported", oauthService.supportedScopes());
        // RFC 9207: redirects carry iss so a client can detect authorization-server mix-up.
        doc.put("authorization_response_iss_parameter_supported", true);
        doc.put("client_id_metadata_document_supported", builtin.isAllowClientMetadataDocuments());
        return ResponseEntity.ok(doc);
    }

    /** Same document under the OIDC path, which some clients probe first. */
    @GetMapping(value = OPENID_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> openidConfiguration() {
        return authorizationServerMetadata();
    }

    @GetMapping(value = JWKS_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok(tokenMinter.publicJwks().toJSONObject(true));
    }
}
