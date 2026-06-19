package stirling.software.proprietary.security.configuration;

import java.util.List;
import java.util.regex.Pattern;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.database.repository.JPATokenRepositoryImpl;
import stirling.software.proprietary.security.database.repository.PersistentLoginRepository;
import stirling.software.proprietary.security.filter.IPRateLimitingFilter;
import stirling.software.proprietary.security.filter.JwtAuthenticationFilter;
import stirling.software.proprietary.security.filter.UserAuthenticationFilter;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

/**
 * Security configuration migrated from a Spring {@code @Configuration}/{@code @EnableWebSecurity}
 * class to a Quarkus CDI bean.
 *
 * <p>TODO: Migration required - This class was built entirely around the Spring Security {@code
 * HttpSecurity} DSL and {@code SecurityFilterChain} beans, which have NO direct Quarkus equivalent.
 * The HTTP security model must be re-expressed declaratively/imperatively:
 *
 * <ul>
 *   <li><b>HTTP path policies / authorization</b> (the {@code authorizeHttpRequests} rules: permit
 *       static resources + public auth endpoints via {@code RequestUriUtils}, authenticate
 *       everything else; permit-all when login is disabled) -> configure {@code
 *       quarkus.http.auth.*} permission sets in {@code application.properties}, or implement a
 *       {@code jakarta.ws.rs.container.ContainerRequestFilter} that reuses {@link
 *       stirling.software.common.util.RequestUriUtils#isStaticResource} and {@code
 *       isPublicAuthEndpoint}.
 *   <li><b>Two ordered filter chains</b> ({@code samlFilterChain} {@code @Order(1)} matching {@code
 *       /saml2/**} + {@code /login/saml2/**} with {@code IF_REQUIRED} sessions when SAML2 is active
 *       on pro+, and the catch-all {@code filterChain} {@code @Order(2)} STATELESS) -> Quarkus has
 *       a single request pipeline; path-specific behaviour must be keyed off the request path
 *       inside filters/policies. Session creation policy maps to {@code quarkus.http.auth.*} +
 *       {@code quarkus-undertow} session config.
 *   <li><b>CSRF disabled / CORS</b> -> {@code quarkus.http.cors.*} (see {@link #buildCorsConfig()}
 *       which preserves the original origins/methods/headers values) and {@code quarkus.http.csrf}
 *       config.
 *   <li><b>X-Frame-Options</b> (DENY / SAMEORIGIN / DISABLED driven by {@code
 *       securityProperties.getXFrameOptions()}, auto-disabled when login is off) -> a response
 *       filter or {@code quarkus.http.header."X-Frame-Options"} config; the decision logic is kept
 *       in {@link #resolveXFrameOptions()}.
 *   <li><b>Servlet filters</b> ({@link UserAuthenticationFilter}, {@link JwtAuthenticationFilter},
 *       {@link IPRateLimitingFilter}) -> register as {@code jakarta.servlet.Filter} via
 *       quarkus-undertow or convert to {@code ContainerRequestFilter}; ordering (userAuth before
 *       UsernamePasswordAuthenticationFilter, jwt before userAuth) must be reproduced via
 *       {@code @jakarta.annotation.Priority}. Note IPRateLimitingFilter was already disabled in the
 *       Spring chain (see original TODO about async-dispatch / StreamingResponseBody).
 *   <li><b>Form login / logout / remember-me</b> ({@code formLogin} -> {@code /login} page + {@code
 *       /perform_login}, {@code CustomAuthenticationSuccessHandler}/{@code FailureHandler}, {@code
 *       logout} -> {@code CustomLogoutSuccessHandler} clearing JSESSIONID/remember-me/ stirling_jwt
 *       cookies, {@code rememberMe} -> {@link JPATokenRepositoryImpl} with 14-day validity) ->
 *       there is no Quarkus equivalent of the form-login/remember-me machinery. Since this is a v2
 *       API-driven auth flow ({@code /api/v1/auth/login}), reimplement as custom JAX-RS endpoints +
 *       the existing handlers, or wire quarkus-oidc/custom IdentityProvider.
 *   <li><b>OAuth2 login</b> ({@code oauth2Login} -> {@code TauriAuthorizationRequestResolver},
 *       {@code CustomOAuth2UserService}, {@code CustomOAuth2Authentication*Handler}, {@code
 *       GrantedAuthoritiesMapper}, {@code ClientRegistrationRepository}) -> migrate to quarkus-oidc
 *       ({@code quarkus.oidc.*}, {@code @io.quarkus.oidc.IdToken}, {@code
 *       SecurityIdentityAugmentor}); keep the claim/user-mapping logic in the existing services.
 *   <li><b>SAML2 login</b> ({@code saml2Login} -> {@code OpenSaml5AuthenticationProvider}, {@code
 *       CustomSaml2ResponseAuthenticationConverter}, {@code CustomSaml2Authentication*Handler},
 *       {@code RelyingPartyRegistrationRepository}, {@code OpenSaml5AuthenticationRequestResolver},
 *       {@code saml2Metadata}) -> there is NO Quarkus SAML extension. Keep all OpenSAML 5 logic and
 *       rehost the SP on a Jakarta {@code @WebServlet} (dnulnets/quarkus-saml pattern). The Spring
 *       {@code org.springframework.security.saml2.*} glue has been removed here.
 *   <li><b>HttpFirewall</b> ({@code StrictHttpFirewall} relaxed to allow non-ASCII header/param
 *       values for reverse proxies like Authelia) -> Spring-Security-only; Quarkus/Vert.x performs
 *       its own request validation. The allowed-character patterns are preserved in {@link
 *       #HEADER_VALUE_PATTERN}/{@link #PARAM_VALUE_PATTERN} for reuse if a custom validator is
 *       added.
 *   <li><b>DaoAuthenticationProvider</b> + {@code PasswordEncoder} ({@code @EnableMethodSecurity},
 *       {@code ProviderManager}) -> replace with a Quarkus {@code IdentityProvider} backed by
 *       {@link CustomUserDetailsService}; method-level security maps to {@code
 *       jakarta.annotation.security.@RolesAllowed}.
 * </ul>
 *
 * <p>The collaborators are still injected so the wiring is preserved for the reimplementation. The
 * reusable, non-Spring helper logic (CORS values, X-Frame-Options decision, firewall char patterns,
 * filter/repository factories) is retained as plain methods/producers below.
 *
 * <p>TODO: Migration required - this bean was {@code @DependsOn("runningProOrHigher")} and
 * {@code @Profile("!saas")}. The dependency ordering is approximated by injecting the {@code
 * runningProOrHigher} flag; the {@code !saas} profile gate maps to a Quarkus build profile - use
 * {@code @io.quarkus.arc.profile.UnlessBuildProfile("saas")} or
 * {@code @io.quarkus.arc.lookup.LookupIfProperty} (adjust to the actual saas profile/property
 * toggle).
 */
@Slf4j
@ApplicationScoped
public class SecurityConfiguration {

    // Allowed-character patterns preserved from the original StrictHttpFirewall relaxation
    // (non-ASCII allowed for reverse proxies, control chars rejected). See class-level TODO.
    static final Pattern HEADER_VALUE_PATTERN =
            Pattern.compile("[\\p{IsAssigned}&&[^\\p{IsControl}]]*");
    static final Pattern PARAM_VALUE_PATTERN =
            Pattern.compile("[\\p{IsAssigned}&&[^\\p{IsControl}]\\r\\n]*");

    private final CustomUserDetailsService userDetailsService;
    private final UserService userService;
    private final boolean loginEnabledValue;
    private final boolean runningProOrHigher;

    private final ApplicationProperties applicationProperties;
    private final ApplicationProperties.Security securityProperties;
    private final AppConfig appConfig;
    private final UserAuthenticationFilter userAuthenticationFilter;
    private final JwtServiceInterface jwtService;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    private final LoginAttemptService loginAttemptService;
    private final SessionPersistentRegistry sessionRegistry;
    private final PersistentLoginRepository persistentLoginRepository;
    private final stirling.software.proprietary.service.UserLicenseSettingsService
            licenseSettingsService;
    private final stirling.software.proprietary.service.AiUserDataService aiUserDataService;

    // TODO: Migration required - the following Spring-Security collaborators were injected as
    // @Autowired(required=false) optional beans and consumed only inside the removed HttpSecurity
    // DSL (GrantedAuthoritiesMapper, RelyingPartyRegistrationRepository,
    // OpenSaml5AuthenticationRequestResolver, ClientRegistrationRepository, PasswordEncoder). They
    // are dropped here because their types are Spring-Security-only; reintroduce equivalents
    // (quarkus-oidc client config, OpenSAML 5 SP wiring, a CDI password hasher) during the
    // OAuth2/SAML2/auth reimplementation described in the class javadoc.

    @Inject
    public SecurityConfiguration(
            PersistentLoginRepository persistentLoginRepository,
            CustomUserDetailsService userDetailsService,
            UserService userService,
            @Named("loginEnabled") boolean loginEnabledValue,
            @Named("runningProOrHigher") boolean runningProOrHigher,
            AppConfig appConfig,
            ApplicationProperties applicationProperties,
            ApplicationProperties.Security securityProperties,
            UserAuthenticationFilter userAuthenticationFilter,
            JwtServiceInterface jwtService,
            JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint,
            LoginAttemptService loginAttemptService,
            SessionPersistentRegistry sessionRegistry,
            stirling.software.proprietary.service.UserLicenseSettingsService licenseSettingsService,
            stirling.software.proprietary.service.AiUserDataService aiUserDataService) {
        this.userDetailsService = userDetailsService;
        this.userService = userService;
        this.loginEnabledValue = loginEnabledValue;
        this.runningProOrHigher = runningProOrHigher;
        this.appConfig = appConfig;
        this.applicationProperties = applicationProperties;
        this.securityProperties = securityProperties;
        this.userAuthenticationFilter = userAuthenticationFilter;
        this.jwtService = jwtService;
        this.jwtAuthenticationEntryPoint = jwtAuthenticationEntryPoint;
        this.loginAttemptService = loginAttemptService;
        this.sessionRegistry = sessionRegistry;
        this.persistentLoginRepository = persistentLoginRepository;
        this.licenseSettingsService = licenseSettingsService;
        this.aiUserDataService = aiUserDataService;
    }

    /**
     * Reusable CORS settings preserved from the original {@code corsConfigurationSource()} bean.
     *
     * <p>TODO: Migration required - the Spring {@code CorsConfigurationSource}/ {@code
     * UrlBasedCorsConfigurationSource} types are removed. Apply these values via {@code
     * quarkus.http.cors.*} in {@code application.properties} (origins, methods, headers,
     * exposed-headers, access-control-allow-credentials=true, access-control-max-age=PT1H) or a
     * {@code ContainerResponseFilter}. The origin resolution from {@code
     * applicationProperties.getSystem().getCorsAllowedOrigins()} (defaulting to "*") is kept here
     * so it can feed whichever mechanism is chosen.
     *
     * @return the resolved allowed origin patterns ("*" when none configured)
     */
    List<String> buildCorsConfig() {
        List<String> configuredOrigins = null;
        if (applicationProperties.getSystem() != null) {
            configuredOrigins = applicationProperties.getSystem().getCorsAllowedOrigins();
        }

        if (configuredOrigins != null && !configuredOrigins.isEmpty()) {
            log.debug(
                    "CORS configured with allowed origin patterns from settings.yml: {}",
                    configuredOrigins);
            return configuredOrigins;
        }
        // Default to allowing all origins when nothing is configured
        log.info(
                "No CORS allowed origins configured in settings.yml"
                        + " (system.corsAllowedOrigins); allowing all origins.");
        return List.of("*");
    }

    // Preserved CORS value sets (apply via quarkus.http.cors.* - see buildCorsConfig() TODO).
    static final List<String> CORS_ALLOWED_METHODS =
            List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
    static final List<String> CORS_ALLOWED_HEADERS =
            List.of(
                    "Authorization",
                    "Content-Type",
                    "X-Requested-With",
                    "Accept",
                    "Origin",
                    "X-API-KEY",
                    "X-CSRF-TOKEN",
                    "X-XSRF-TOKEN");
    static final List<String> CORS_EXPOSED_HEADERS =
            List.of(
                    "WWW-Authenticate",
                    "X-Total-Count",
                    "X-Page-Number",
                    "X-Page-Size",
                    "Content-Disposition",
                    "Content-Type");

    /**
     * Resolves the desired X-Frame-Options header value, preserving the original decision logic.
     *
     * <p>TODO: Migration required - apply the returned value via a response filter or {@code
     * quarkus.http.header} config (Spring's {@code HeadersConfigurer} is gone).
     *
     * @return "DISABLED", "SAMEORIGIN" or "DENY"
     */
    String resolveXFrameOptions() {
        // When login is disabled, X-Frame-Options is disabled to allow embedding.
        if (!loginEnabledValue) {
            return "DISABLED";
        }
        String xFrameOption = securityProperties.getXFrameOptions();
        if (xFrameOption == null) {
            return "DENY";
        }
        if ("DISABLED".equalsIgnoreCase(xFrameOption)) {
            return "DISABLED";
        }
        if ("SAMEORIGIN".equalsIgnoreCase(xFrameOption)) {
            return "SAMEORIGIN";
        }
        return "DENY";
    }

    // TODO: Migration required - samlFilterChain/filterChain/configureSecurity built the Spring
    // SecurityFilterChain instances. Their behaviour is summarised in the class javadoc and must be
    // reimplemented via Quarkus HTTP auth config + filters/IdentityProviders. The full original DSL
    // is preserved in version control. No fabricated SecurityFilterChain is produced here.

    /**
     * Produces the IP rate-limiting filter (plain {@code jakarta.servlet.Filter}, not a
     * Spring-specific type, so it remains a CDI producer).
     *
     * <p>TODO: Migration required - registration/ordering must be handled by quarkus-undertow
     * ({@code @WebFilter}) or a {@code ContainerRequestFilter}. This filter was already disabled in
     * the original chain (limit is effectively a no-op at 1,000,000) pending conversion.
     */
    @Produces
    @ApplicationScoped
    public IPRateLimitingFilter rateLimitingFilter() {
        // Example limit TODO add config level
        int maxRequestsPerIp = 1000000;
        return new IPRateLimitingFilter(maxRequestsPerIp, maxRequestsPerIp);
    }

    /**
     * Produces the persistent remember-me token repository.
     *
     * <p>TODO: Migration required - {@link JPATokenRepositoryImpl} implements the Spring Security
     * {@code PersistentTokenRepository} interface (collaborator not yet migrated). The remember-me
     * feature itself has no Quarkus equivalent (see class javadoc); the repository is still
     * produced so the persistence logic is available to the reimplementation. Producer return type
     * narrowed to the concrete class to avoid importing the Spring interface here.
     */
    @Produces
    @ApplicationScoped
    public JPATokenRepositoryImpl persistentTokenRepository() {
        return new JPATokenRepositoryImpl(persistentLoginRepository);
    }

    // TODO: Migration required - JwtAuthenticationFilter is @ApplicationScoped with CDI field
    // injection; CDI manages it directly. The @Produces factory was removed because constructing
    // it here with explicit args is incompatible with how the bean is declared. Inject
    // JwtAuthenticationFilter directly wherever it is needed.
}
