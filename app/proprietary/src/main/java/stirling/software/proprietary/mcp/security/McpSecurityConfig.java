package stirling.software.proprietary.mcp.security;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.OAuth2ProtectedResourceMetadata;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.service.UserService;

/**
 * MCP security chain: validates JWTs (JWKS + RFC 8707 audience), maps scope claims to authorities,
 * and fails closed when the issuer is unset.
 */
@Slf4j
@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpSecurityConfig {

    private final ApplicationProperties applicationProperties;
    private final UserService userService;

    // Reuse the app's CORS config; ObjectProvider so the chain still wires when no CORS bean
    // exists.
    private final ObjectProvider<CorsConfigurationSource> corsConfigurationSource;

    private static final String BASE_PATH = "/mcp";

    public McpSecurityConfig(
            ApplicationProperties applicationProperties,
            @Lazy UserService userService,
            ObjectProvider<CorsConfigurationSource> corsConfigurationSource) {
        this.applicationProperties = applicationProperties;
        this.userService = userService;
        this.corsConfigurationSource = corsConfigurationSource;
    }

    /** Enable CORS on the MCP chain using the app-wide source when available. */
    private void applyCors(HttpSecurity http) throws Exception {
        CorsConfigurationSource source = corsConfigurationSource.getIfAvailable();
        if (source != null) {
            http.cors(cors -> cors.configurationSource(source));
        }
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

    @Bean
    @Order(0)
    SecurityFilterChain mcpSecurityFilterChain(HttpSecurity http, JwtDecoder mcpJwtDecoder)
            throws Exception {
        ApplicationProperties.Mcp.Auth auth = applicationProperties.getMcp().getAuth();
        if (isApiKeyMode()) {
            return apiKeyFilterChain(http);
        }
        return oauthFilterChain(http, mcpJwtDecoder, auth);
    }

    private boolean isApiKeyMode() {
        return "apikey".equalsIgnoreCase(applicationProperties.getMcp().getAuth().getMode());
    }

    /**
     * API-key chain: a Stirling per-user API key is validated by {@link McpApiKeyAuthFilter};
     * otherwise 401.
     */
    private SecurityFilterChain apiKeyFilterChain(HttpSecurity http) throws Exception {
        applyCors(http);
        http.securityMatcher(BASE_PATH, BASE_PATH + "/**")
                // CSRF intentionally disabled: /mcp is a stateless JSON-RPC API authenticated by an
                // out-of-band X-API-KEY header (or Authorization: Bearer <key>). No cookies, no
                // session, no form submissions; a browser cannot trick a victim into sending the
                // header cross-origin, so the CSRF attack model does not apply. CodeQL flags this
                // generically; the SessionCreationPolicy.STATELESS below is the relevant guarantee.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a.anyRequest().authenticated())
                .exceptionHandling(
                        e ->
                                e.authenticationEntryPoint(
                                        (request, response, ex) -> {
                                            response.setStatus(401);
                                            response.setHeader(
                                                    "WWW-Authenticate",
                                                    "Bearer realm=\"Stirling MCP (API key)\"");
                                            response.setContentType("application/json");
                                            response.getWriter()
                                                    .write(
                                                            "{\"error\":\"unauthorized\",\"message\":\"Provide a valid Stirling API key via the X-API-KEY header (or Authorization: Bearer <key>).\"}");
                                        }))
                .addFilterBefore(
                        new McpRequestSizeFilter(
                                applicationProperties.getMcp().getMaxRequestBytes()),
                        AuthorizationFilter.class)
                // Authenticate before the anonymous filter sets an anonymous token.
                .addFilterBefore(
                        new McpApiKeyAuthFilter(userService), AnonymousAuthenticationFilter.class);
        return http.build();
    }

    /** OAuth2 resource-server chain (JWT, RFC 8707 audience, RFC 9728 metadata). */
    private SecurityFilterChain oauthFilterChain(
            HttpSecurity http, JwtDecoder mcpJwtDecoder, ApplicationProperties.Mcp.Auth auth)
            throws Exception {
        String metadataPath = "/.well-known/oauth-protected-resource";
        applyCors(http);
        // RFC 9728 section 3.1: clients derive the metadata URL by inserting the well-known
        // segment before the resource path, so /mcp is discovered at {metadataPath}/mcp. Claim
        // the subpaths too; otherwise they fall through to another filter chain whose default
        // Spring Security metadata filter serves a document without authorization_servers.
        http.securityMatcher(BASE_PATH, BASE_PATH + "/**", metadataPath, metadataPath + "/**")
                // CSRF intentionally disabled: /mcp is a stateless JSON-RPC resource server
                // authenticated by OAuth2 Bearer JWTs (Authorization header). No cookies, no
                // session, no form submissions; CSRF requires browser-attached ambient credentials
                // and the bearer token is supplied per-request by the MCP client. CodeQL flags
                // this generically; the SessionCreationPolicy.STATELESS below is the actual
                // guarantee, and the .well-known metadata endpoint only serves GET.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        a ->
                                a.requestMatchers(
                                                HttpMethod.GET, metadataPath, metadataPath + "/**")
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                // Cap body size pre-auth, then bind the validated token to a Stirling user after
                // the bearer filter.
                .addFilterBefore(
                        new McpRequestSizeFilter(
                                applicationProperties.getMcp().getMaxRequestBytes()),
                        BearerTokenAuthenticationFilter.class)
                .addFilterAfter(
                        new McpUserBindingFilter(
                                userService,
                                auth.getUsernameClaim(),
                                auth.isRequireExistingAccount()),
                        BearerTokenAuthenticationFilter.class)
                .oauth2ResourceServer(
                        oauth2 ->
                                oauth2.authenticationEntryPoint(
                                                // Advertise the path-inserted form; RFC 9728 makes
                                                // it the canonical location for a resource with a
                                                // path component.
                                                new McpAuthenticationEntryPoint(
                                                        metadataPath + BASE_PATH))
                                        // RFC 9728 protected-resource metadata for OAuth discovery.
                                        .protectedResourceMetadata(
                                                prm ->
                                                        prm.protectedResourceMetadataCustomizer(
                                                                builder ->
                                                                        buildResourceMetadata(
                                                                                builder, auth)))
                                        .jwt(
                                                jwt ->
                                                        jwt.decoder(mcpJwtDecoder)
                                                                .jwtAuthenticationConverter(
                                                                        mcpJwtAuthenticationConverter())));
        return http.build();
    }

    /** Populate the RFC 9728 protected-resource metadata document from the configured auth. */
    private void buildResourceMetadata(
            OAuth2ProtectedResourceMetadata.Builder builder, ApplicationProperties.Mcp.Auth auth) {
        if (!auth.getResourceId().isBlank()) {
            builder.resource(auth.getResourceId());
        }
        if (!auth.getIssuerUri().isBlank()) {
            builder.authorizationServer(auth.getIssuerUri());
        }
        // Only advertise the granular tool scopes when we actually enforce them. When scopes are
        // disabled (e.g. the IdP only mints coarse tokens, like Supabase), advertising scopes the
        // authorization server can't issue makes spec-compliant clients request them and get
        // rejected with invalid_request.
        if (applicationProperties.getMcp().isScopesEnabled()) {
            builder.scope("mcp.tools.read");
            builder.scope("mcp.tools.write");
        }
    }

    @Bean
    JwtDecoder mcpJwtDecoder() {
        ApplicationProperties.Mcp.Auth auth = applicationProperties.getMcp().getAuth();
        if (auth.getIssuerUri().isBlank()) {
            // Fail-closed decoder: rejects every token until the issuer is set.
            return token -> {
                throw new org.springframework.security.oauth2.jwt.BadJwtException(
                        "mcp.auth.issuer-uri is not configured");
            };
        }
        String jwksUri = auth.getJwksUri();
        NimbusJwtDecoder decoder =
                jwksUri.isBlank()
                        ? NimbusJwtDecoder.withIssuerLocation(auth.getIssuerUri()).build()
                        : NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
        OAuth2TokenValidator<Jwt> defaultValidators =
                JwtValidators.createDefaultWithIssuer(auth.getIssuerUri());
        OAuth2TokenValidator<Jwt> combined =
                new DelegatingOAuth2TokenValidator<>(
                        defaultValidators,
                        new McpAudienceValidator(
                                auth.getResourceId(), auth.getAcceptedAudiences()));
        decoder.setJwtValidator(combined);
        return decoder;
    }

    private Converter<Jwt, AbstractAuthenticationToken> mcpJwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter scopes = new JwtGrantedAuthoritiesConverter();
        scopes.setAuthorityPrefix("SCOPE_");
        scopes.setAuthoritiesClaimName("scope");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(
                jwt -> {
                    Collection<GrantedAuthority> out = new ArrayList<>(scopes.convert(jwt));
                    List<String> aud = jwt.getAudience();
                    if (aud != null) {
                        for (String a : aud) {
                            out.add(new SimpleGrantedAuthority("AUDIENCE_" + a));
                        }
                    }
                    return out;
                });
        return converter;
    }
}
