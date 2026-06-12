package stirling.software.proprietary.mcp.security;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.UserService;

/**
 * MCP security chain: validates JWTs (JWKS + RFC 8707 audience), maps scope claims to authorities,
 * and fails closed when the issuer is unset.
 *
 * <p>TODO: Migration required - this class was a Spring Security {@code SecurityFilterChain} /
 * {@code HttpSecurity} DSL configuration, which has NO direct Quarkus equivalent. The Spring
 * security DSL has been removed; the equivalent behaviour must be rebuilt on Quarkus primitives:
 *
 * <ul>
 *   <li>HTTP path matching ({@code /mcp}, {@code /mcp/**}, {@code /.well-known/oauth-protected-resource})
 *       and authenticated-vs-permitAll policy -> declare via {@code quarkus.http.auth.permission.*}
 *       in application.properties (permit GET on the metadata path, authenticate the rest), or via a
 *       {@code jakarta.ws.rs.container.ContainerRequestFilter}.
 *   <li>Stateless session ({@code SessionCreationPolicy.STATELESS}) and CSRF-disabled -> Quarkus REST
 *       is stateless by default; no CSRF filter is added unless quarkus-csrf-reactive is enabled.
 *   <li>OAuth2 resource-server JWT validation (issuer/JWKS + RFC 8707 audience + scope->authority
 *       mapping) -> quarkus-oidc in {@code service} application type, or quarkus-smallrye-jwt for
 *       bearer validation. Wire {@code quarkus.oidc.auth-server-url}=issuer-uri,
 *       {@code quarkus.oidc.token.audience}=resource-id; map the {@code scope} claim to roles via a
 *       {@code io.quarkus.security.identity.SecurityIdentityAugmentor} (replacing
 *       {@code JwtGrantedAuthoritiesConverter} with prefix {@code SCOPE_} and the {@code AUDIENCE_}
 *       authorities added below). The fail-closed behaviour when issuer-uri is blank is preserved by
 *       NOT configuring quarkus.oidc when blank (every bearer request then 401s).
 *   <li>API-key mode ({@code mcp.auth.mode=apikey}) -> register {@link McpApiKeyAuthFilter} as a
 *       {@code jakarta.ws.rs.container.ContainerRequestFilter @Provider} (or a jakarta.servlet
 *       Filter via quarkus-undertow) that validates the X-API-KEY / Bearer key against
 *       {@link UserService} and returns the 401 + {@code WWW-Authenticate} response below.
 *   <li>RFC 9728 protected-resource metadata ({@code /.well-known/oauth-protected-resource} with
 *       resource/authorizationServer/scopes mcp.tools.read + mcp.tools.write) -> serve from a small
 *       JAX-RS resource returning the JSON document.
 *   <li>Pre-auth body-size cap ({@link McpRequestSizeFilter}) and post-auth user binding
 *       ({@link McpUserBindingFilter}) -> register as ContainerRequestFilters with explicit
 *       {@code @Priority} so size-cap runs before auth and user-binding runs after; ordering matters.
 *   <li>Reused CORS source ({@code corsConfigurationSource}) -> configure via {@code quarkus.http.cors.*}.
 * </ul>
 *
 * The helper components ({@link McpApiKeyAuthFilter}, {@link McpUserBindingFilter},
 * {@link McpRequestSizeFilter}, {@link McpAudienceValidator}, {@link McpAuthenticationEntryPoint})
 * are preserved unchanged and should be wired in by the new Quarkus security plumbing. The
 * configuration-reading and fail-closed warning logic below is kept verbatim.
 */
@Slf4j
@ApplicationScoped
// TODO: Migration required - @Order(Ordered.HIGHEST_PRECEDENCE) and
// @ConditionalOnProperty(name = "mcp.enabled", havingValue = "true") were removed. Gate MCP
// security wiring on the runtime property mcp.enabled=true (the value is a runtime toggle, not a
// build profile, so prefer a runtime guard in the new ContainerRequestFilter/augmentor rather than
// @IfBuildProfile). Filter ordering (highest precedence) must be re-expressed via JAX-RS @Priority
// or quarkus.http.auth.permission ordering.
public class McpSecurityConfig {

    private final ApplicationProperties applicationProperties;

    // TODO: Migration required - UserService was injected @Lazy to break a circular wiring with the
    // security chain. With the Spring chain removed, inject it directly into the new API-key /
    // user-binding ContainerRequestFilters instead of holding it here.
    private final UserService userService;

    private static final String BASE_PATH = "/mcp";

    public McpSecurityConfig(
            ApplicationProperties applicationProperties, UserService userService) {
        this.applicationProperties = applicationProperties;
        this.userService = userService;
    }

    @PostConstruct
    void warnIfMisconfigured() {
        ApplicationProperties.Mcp mcp = applicationProperties.getMcp();
        if (isApiKeyMode()) {
            log.info(
                    "MCP auth mode = apikey: clients authenticate with a Stirling per-user API key"
                            + " (X-API-KEY header). No OAuth issuer required.");
        } else {
            if (mcp.getAuth().getIssuerUri().isBlank()) {
                log.warn(
                        "MCP enabled but mcp.auth.issuer-uri is blank - JWT decoder will reject"
                                + " every token (fail-closed). Set mcp.auth.issuer-uri and"
                                + " mcp.auth.resource-id before exposing /mcp to clients.");
            }
            if (mcp.getAuth().getResourceId().isBlank()) {
                log.warn(
                        "MCP enabled but mcp.auth.resource-id is blank - audience validator will"
                                + " reject every token. Set this to the public URL of the MCP"
                                + " endpoint (RFC 8707).");
            }
        }
    }

    private boolean isApiKeyMode() {
        return "apikey".equalsIgnoreCase(applicationProperties.getMcp().getAuth().getMode());
    }

    // TODO: Migration required - the following describe the original chain wiring so the Quarkus
    // re-implementation can reproduce it faithfully. They are documented as constants/notes rather
    // than executable HttpSecurity DSL (which does not exist in Quarkus).

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
    //   securityMatcher(BASE_PATH, BASE_PATH + "/**", metadataPath);
    //   CSRF disabled; SessionCreationPolicy.STATELESS;
    //   GET metadataPath permitAll, anyRequest().authenticated();
    //   addFilterBefore(new McpRequestSizeFilter(maxRequestBytes), BearerTokenAuthenticationFilter.class);
    //   addFilterAfter(new McpUserBindingFilter(userService, auth.getUsernameClaim(),
    //     auth.isRequireExistingAccount()), BearerTokenAuthenticationFilter.class);
    //   oauth2ResourceServer: authenticationEntryPoint = new McpAuthenticationEntryPoint(metadataPath);
    //     RFC 9728 protected-resource metadata -> resource=auth.getResourceId() (if non-blank),
    //       authorizationServer=auth.getIssuerUri() (if non-blank), scopes mcp.tools.read +
    //       mcp.tools.write;
    //     jwt: decoder=mcpJwtDecoder, jwtAuthenticationConverter=mcpJwtAuthenticationConverter.

    // JWT decoder (was @Bean JwtDecoder mcpJwtDecoder): fail-closed when auth.getIssuerUri() is
    //   blank (reject every token); else NimbusJwtDecoder.withJwkSetUri(jwksUri) when jwks-uri set,
    //   otherwise NimbusJwtDecoder.withIssuerLocation(issuerUri); validators =
    //   DelegatingOAuth2TokenValidator(default-with-issuer, new McpAudienceValidator(resourceId)).
    //   -> Replace with quarkus-oidc/quarkus-smallrye-jwt config (auth-server-url=issuer-uri,
    //   token.audience=resource-id, jwks via discovery or quarkus.oidc.jwks-path). Keep
    //   McpAudienceValidator's audience logic in a custom validator if OIDC's audience check is
    //   insufficient. Do NOT configure when issuer-uri is blank to preserve fail-closed behaviour.

    // JWT authentication converter (scope -> authority mapping): map the "scope" claim to authorities
    //   with prefix "SCOPE_", and additionally add "AUDIENCE_<aud>" for each audience entry on the
    //   token. -> Re-implement in a io.quarkus.security.identity.SecurityIdentityAugmentor that adds
    //   roles "SCOPE_<scope>" and "AUDIENCE_<aud>" to the SecurityIdentity.
}
