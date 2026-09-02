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
 * <p>The collaborators are still injected so the wiring is preserved for the reimplementation. The
 * reusable, non-Spring helper logic (CORS values, X-Frame-Options decision, firewall char patterns,
 * filter/repository factories) is retained as plain methods/producers below.
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
                    "Content-Type",
                    "X-Stirling-Skipped-Field-Edits",
                    "X-Stirling-Skipped-Field-Edits-Total");

    /**
     * Resolves the desired X-Frame-Options header value, preserving the original decision logic.
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

    /**
     * Produces the IP rate-limiting filter (plain {@code jakarta.servlet.Filter}, not a
     * Spring-specific type, so it remains a CDI producer).
     */
    @Produces
    @ApplicationScoped
    public IPRateLimitingFilter rateLimitingFilter() {
        // Example limit TODO add config level
        int maxRequestsPerIp = 1000000;
        return new IPRateLimitingFilter(maxRequestsPerIp, maxRequestsPerIp);
    }

    /** Produces the persistent remember-me token repository. */
    @Produces
    @ApplicationScoped
    public JPATokenRepositoryImpl persistentTokenRepository() {
        return new JPATokenRepositoryImpl(persistentLoginRepository);
    }
}
