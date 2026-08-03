package stirling.software.proprietary.mcp.security;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.UserService;

/**
 * MCP security chain: validates JWTs (JWKS + RFC 8707 audience), maps scope claims to authorities,
 * and fails closed when the issuer is unset.
 */
@Slf4j
@ApplicationScoped
public class McpSecurityConfig {

    private final ApplicationProperties applicationProperties;

    private final UserService userService;

    private static final String BASE_PATH = "/mcp";

    public McpSecurityConfig(ApplicationProperties applicationProperties, UserService userService) {
        this.applicationProperties = applicationProperties;
        this.userService = userService;
    }

    @PostConstruct
    void validateConfigOnStartup() {
        log.info("MCP server enabled - validating configuration:");
        for (McpConfigValidator.Finding finding :
                McpConfigValidator.validate(applicationProperties.getMcp())) {
            if (finding.severity() == McpConfigValidator.Severity.WARN) {
                log.warn("MCP config: {}", finding.message());
            } else {
                log.info("MCP config: {}", finding.message());
            }
        }
    }

    private boolean isApiKeyMode() {
        return "apikey".equalsIgnoreCase(applicationProperties.getMcp().getAuth().getMode());
    }

    // API-key chain (mcp.auth.mode=apikey): securityMatcher(BASE_PATH, BASE_PATH + "/**");
    //   CSRF disabled (stateless JSON-RPC, X-API-KEY / Bearer <key>, no cookies/session);
    //   SessionCreationPolicy.STATELESS; anyRequest().authenticated();
    //   authenticationEntryPoint -> 401 with header WWW-Authenticate: Bearer realm="Stirling MCP
    //     (API key)", Content-Type application/json, body
    //     {"error":"unauthorized","message":"Provide a valid Stirling API key via the X-API-KEY
    //     header (or Authorization: Bearer <key>)."};
    //   addFilterBefore(new McpRequestSizeFilter(maxRequestBytes), AuthorizationFilter.class);
    //   addFilterBefore(new McpApiKeyAuthFilter(userService), AnonymousAuthenticationFilter.class)
    //     (authenticate before any anonymous token is set).

    // OAuth2 resource-server chain: metadataPath = "/.well-known/oauth-protected-resource";
    //   securityMatcher(BASE_PATH, BASE_PATH + "/**", metadataPath, metadataPath + "/**");
    //   CSRF disabled; SessionCreationPolicy.STATELESS;
    //   GET metadataPath (+ "/**") permitAll, anyRequest().authenticated();
    //   addFilterBefore(new McpRequestSizeFilter(maxRequestBytes),
    //     BearerTokenAuthenticationFilter.class);
    //   addFilterAfter(new McpUserBindingFilter(userService, auth.getUsernameClaim(),
    //     auth.isRequireExistingAccount()), BearerTokenAuthenticationFilter.class);
    //   oauth2ResourceServer: authenticationEntryPoint = new
    //     McpAuthenticationEntryPoint(metadataPath + BASE_PATH);
    //     RFC 9728 protected-resource metadata -> resource=auth.getResourceId() (if non-blank),
    //       authorizationServer=auth.getIssuerUri() (if non-blank), scopes mcp.tools.read +
    //       mcp.tools.write only when mcp.scopes-enabled;
    //     jwt: decoder=mcpJwtDecoder, jwtAuthenticationConverter=mcpJwtAuthenticationConverter.

    // JWT decoder (was @Bean JwtDecoder mcpJwtDecoder): fail-closed when auth.getIssuerUri() is
    //   blank (reject every token); else NimbusJwtDecoder.withJwkSetUri(jwksUri) when jwks-uri set,
    //   otherwise NimbusJwtDecoder.withIssuerLocation(issuerUri); validators =
    //   DelegatingOAuth2TokenValidator(default-with-issuer, new McpAudienceValidator(resourceId,
    //   acceptedAudiences)).
    //   -> Replace with quarkus-oidc/quarkus-smallrye-jwt config (auth-server-url=issuer-uri,
    //   token.audience=resource-id, jwks via discovery or quarkus.oidc.jwks-path). Keep
    //   McpAudienceValidator's audience logic in a custom validator if OIDC's audience check is
    //   insufficient. Do NOT configure when issuer-uri is blank to preserve fail-closed behaviour.

    // JWT authentication converter (scope -> authority mapping): map the "scope" claim to
    //   authorities with prefix "SCOPE_", and additionally add "AUDIENCE_<aud>" for each audience
    //   entry on the token. -> Re-implement in a
    //   io.quarkus.security.identity.SecurityIdentityAugmentor that adds roles "SCOPE_<scope>" and
    //   "AUDIENCE_<aud>" to the SecurityIdentity.
}
