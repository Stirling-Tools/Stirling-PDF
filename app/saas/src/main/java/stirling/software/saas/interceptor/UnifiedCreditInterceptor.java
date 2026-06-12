package stirling.software.saas.interceptor;

import java.lang.reflect.Method;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.UserCredit;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.ErrorTrackingService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.SaasUserExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Pre-flight credit validation for {@code @AutoJobPostMapping} endpoints.
 *
 * <p>// TODO: Migration required - was a Spring {@code @Component} ({@code @Profile("saas")})
 * implementing {@code org.springframework.web.servlet.AsyncHandlerInterceptor} (preHandle /
 * postHandle / afterCompletion / afterConcurrentHandlingStarted). Spring MVC {@code
 * HandlerInterceptor}, {@code HandlerMethod} and {@code ModelAndView} have no Quarkus equivalent.
 * Convert this to a JAX-RS {@code @jakarta.ws.rs.ext.Provider ContainerRequestFilter} (preHandle ->
 * filter, with abort responses replacing the {@code return false} short-circuits). The handler
 * introspection that read {@code @AutoJobPostMapping} off the resolved {@code HandlerMethod} must be
 * replaced by JAX-RS {@code ResourceInfo#getResourceMethod()} (injected via {@code @Context}). The
 * method bodies are preserved; {@code handler} is now an opaque {@code Object} and the
 * {@code HandlerMethod} cast has been replaced by a reflective {@link Method} fallback (see TODOs).
 */
@ApplicationScoped
@Slf4j
public class UnifiedCreditInterceptor {

    private final CreditService creditService;
    private final ErrorTrackingService errorTrackingService;
    private final CreditsProperties creditsProperties;
    private final UserRepository userRepository;
    private final TeamCreditService teamCreditService;
    private final TeamMembershipRepository membershipRepository;
    private final SaasUserExtensionService saasUserExtensionService;
    private final SaasTeamExtensionService saasTeamExtensionService;

    private final Counter creditsCheckedCounter;
    private final Counter creditsRejectedCounter;
    private final Counter jwtBypassCounter;
    private final Timer creditCheckTimer;

    private static final String ATTR_CREDIT_ELIGIBLE = "CREDIT_ELIGIBLE";
    private static final String ATTR_API_KEY = "CREDIT_API_KEY";
    private static final String ATTR_RESOURCE_WEIGHT = "CREDIT_RESOURCE_WEIGHT";
    private static final String ATTR_CHARGED = "CREDIT_CHARGED";

    public UnifiedCreditInterceptor(
            CreditService creditService,
            ErrorTrackingService errorTrackingService,
            CreditsProperties creditsProperties,
            UserRepository userRepository,
            TeamCreditService teamCreditService,
            TeamMembershipRepository membershipRepository,
            SaasUserExtensionService saasUserExtensionService,
            SaasTeamExtensionService saasTeamExtensionService,
            MeterRegistry meterRegistry) {
        this.creditService = creditService;
        this.errorTrackingService = errorTrackingService;
        this.creditsProperties = creditsProperties;
        this.userRepository = userRepository;
        this.teamCreditService = teamCreditService;
        this.membershipRepository = membershipRepository;
        this.saasUserExtensionService = saasUserExtensionService;
        this.saasTeamExtensionService = saasTeamExtensionService;

        this.creditsCheckedCounter =
                Counter.builder("credits.validation.checked")
                        .description("Number of requests that had credit validation performed")
                        .register(meterRegistry);
        this.creditsRejectedCounter =
                Counter.builder("credits.validation.rejected")
                        .description("Number of requests rejected due to insufficient credits")
                        .register(meterRegistry);
        this.jwtBypassCounter =
                Counter.builder("credits.validation.jwt_bypass")
                        .description("Number of JWT requests that bypassed credit validation")
                        .register(meterRegistry);
        this.creditCheckTimer =
                Timer.builder("credits.validation.duration")
                        .description("Time taken to validate credits")
                        .register(meterRegistry);
    }

    // TODO: Migration required - was @Override HandlerInterceptor#preHandle(request, response,
    // handler). Convert to ContainerRequestFilter#filter; replace each `return false` (with the
    // response already written) by ContainerRequestContext.abortWith(Response...).
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        log.debug(
                "[CREDIT-DEBUG] UnifiedCreditInterceptor.preHandle() - handler: {}",
                handler == null ? "null" : handler.getClass().getSimpleName());

        // Credits system disabled - allow all requests
        if (!creditsProperties.isEnabled()) {
            log.debug("[CREDIT-DEBUG] Credits system disabled - allowing request");
            return true;
        }

        // Only apply to @AutoJobPostMapping endpoints and extract resource weight
        // TODO: Migration required - originally `handler instanceof HandlerMethod hm` and
        // hm.getMethod(). Resolve the JAX-RS resource Method via @Context ResourceInfo instead. The
        // reflective Method fallback below preserves the @AutoJobPostMapping gating semantics.
        Method resourceMethod = resolveResourceMethod(handler);
        if (resourceMethod == null
                || !resourceMethod.isAnnotationPresent(AutoJobPostMapping.class)) {
            log.debug(
                    "[CREDIT-DEBUG] Handler not eligible for credit validation (no @AutoJobPostMapping)");
            return true;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        log.debug(
                "[CREDIT-DEBUG] Authentication: {}",
                auth != null ? auth.getClass().getSimpleName() : "null");

        User currentUser = null;

        // API key authentication always needs credit validation
        if (auth instanceof ApiKeyAuthenticationToken) {
            // API key users - proceed with normal credit validation
            currentUser = (User) auth.getPrincipal();
        } else if (auth != null && auth.isAuthenticated()) {
            // JWT users - get user from authentication details
            // JwtAuthenticationToken.getPrincipal() might not be a User object
            // so we need to look up the user by the Supabase ID from auth.getName()

            String supabaseId = AuthenticationUtils.extractSupabaseId(auth);
            log.debug("[CREDIT-DEBUG] JWT authentication detected, Supabase ID: {}", supabaseId);

            // Look up the User object that should exist (authentication succeeded)
            try {
                java.util.UUID supabaseUuid = java.util.UUID.fromString(supabaseId);
                java.util.Optional<User> userOpt = userRepository.findBySupabaseId(supabaseUuid);
                if (userOpt.isEmpty()) {
                    log.error(
                            "[CREDIT-DEBUG] JWT authenticated but no User found for Supabase ID: {}",
                            supabaseId);
                    response.setStatus(500);
                    response.setContentType("application/json");
                    response.getWriter()
                            .write(
                                    "{\"error\":\"USER_NOT_FOUND\",\"message\":\"Authenticated user not found in database\",\"status\":500}");
                    return false;
                }
                currentUser = userOpt.get();

                if (shouldApplyCreditsToJwtUser(currentUser)) {
                    // Anonymous users or other limited JWT users should consume credits
                    log.debug(
                            "[CREDIT-DEBUG] JWT user {} subject to credit validation due to limited role",
                            currentUser.getUsername());
                } else {
                    jwtBypassCounter.increment();
                    log.debug(
                            "[CREDIT-DEBUG] JWT user {} bypassing credit validation (unlimited role)",
                            currentUser.getUsername());
                    return true;
                }
            } catch (IllegalArgumentException e) {
                log.error("[CREDIT-DEBUG] Invalid Supabase ID format: {}", supabaseId);
                response.setStatus(400);
                response.setContentType("application/json");
                response.getWriter()
                        .write(
                                "{\"error\":\"INVALID_USER_ID\",\"message\":\"Invalid user identifier format\",\"status\":400}");
                return false;
            }
        } else {
            // SECURITY: Block all non-authenticated requests
            log.warn(
                    "[CREDIT-DEBUG] Non-authenticated request blocked - authentication required for credit-controlled endpoints");
            response.setStatus(401); // 401 Unauthorized
            response.setContentType("application/json");
            response.getWriter()
                    .write(
                            "{\"error\":\"AUTHENTICATION_REQUIRED\",\"message\":\"Authentication required to access this endpoint\",\"status\":401}");
            return false;
        }

        // Extract resource weight from annotation
        AutoJobPostMapping annotation = resourceMethod.getAnnotation(AutoJobPostMapping.class);
        int resourceWeight =
                Math.max(1, Math.min(100, annotation.resourceWeight())); // Clamp to 1-100

        String apiKey = getApiKeyForUser(auth, currentUser);
        String maskedApiKey = maskApiKey(apiKey);

        log.debug(
                "[CREDIT-DEBUG] Credit validation for user: {}, API key: {}, resource weight: {}",
                currentUser.getUsername(),
                maskedApiKey,
                resourceWeight);

        // Track that we're performing credit validation
        creditsCheckedCounter.increment();

        // Check if user has SUFFICIENT credits for this operation (with timing)
        Timer.Sample sample = Timer.start();
        boolean hasSufficientCredits;
        int availableCredits = 0;

        // Check if user is a limited API user (anonymous, extra limited)
        // Limited API users always use personal credits, never team credits
        boolean isLimitedApiUser =
                currentUser.getAuthorities().stream()
                        .anyMatch(
                                authority ->
                                        "ROLE_LIMITED_API_USER".equals(authority.getAuthority())
                                                || "ROLE_EXTRA_LIMITED_API_USER"
                                                        .equals(authority.getAuthority()));

        if (auth instanceof ApiKeyAuthenticationToken) {
            // API key auth - get credit balance
            java.util.Optional<UserCredit> userCreditsOpt =
                    creditService.getUserCreditsByApiKey(apiKey);
            availableCredits = userCreditsOpt.map(UserCredit::getTotalAvailableCredits).orElse(0);
            hasSufficientCredits = availableCredits >= resourceWeight;
        } else {
            // JWT user - check team credits if user is in a non-personal team, otherwise personal
            // credits
            Long teamId = null;
            if (!isLimitedApiUser
                    && currentUser.getTeam() != null
                    && !saasTeamExtensionService.isPersonal(currentUser.getTeam())) {
                teamId = currentUser.getTeam().getId();
            }

            if (teamId != null) {
                // User is in a non-personal team - check team credits + leader overage billing
                java.util.Optional<TeamCredit> teamCredits =
                        teamCreditService.getTeamCredits(teamId);
                availableCredits = teamCredits.map(TeamCredit::getTotalAvailableCredits).orElse(0);

                // Check if sufficient credits OR team leader has metered billing
                boolean hasTeamCredits = availableCredits >= resourceWeight;
                boolean leaderHasMetered = checkTeamLeaderMeteredBilling(currentUser.getTeam());

                hasSufficientCredits = hasTeamCredits || leaderHasMetered;

                log.debug(
                        "[CREDIT-DEBUG] Checking team {} credits for user {}: available={}"
                                + " required={} hasCredits={} leaderMetered={} sufficient={}",
                        teamId,
                        currentUser.getUsername(),
                        availableCredits,
                        resourceWeight,
                        hasTeamCredits,
                        leaderHasMetered,
                        hasSufficientCredits);
            } else {
                // Personal team or no team - check personal credits
                UserCredit userCredits = creditService.getOrCreateUserCredits(currentUser);
                availableCredits = userCredits.getTotalAvailableCredits();
                hasSufficientCredits = availableCredits >= resourceWeight;
                log.debug(
                        "[CREDIT-DEBUG] Checking personal credits for user {}: available={} required={} sufficient={}",
                        currentUser.getUsername(),
                        availableCredits,
                        resourceWeight,
                        hasSufficientCredits);
            }
        }
        sample.stop(creditCheckTimer);

        // Check if user has metered billing enabled (they can use overage credits even with
        // insufficient free credits)
        boolean hasMeteredBilling = saasUserExtensionService.isMeteredBillingEnabled(currentUser);

        if (!hasSufficientCredits && !hasMeteredBilling) {
            creditsRejectedCounter.increment();

            // Enhanced message for team members
            // Note: Limited API users always use personal credits, so they get personal message
            String message;
            if (!isLimitedApiUser
                    && currentUser.getTeam() != null
                    && !saasTeamExtensionService.isPersonal(currentUser.getTeam())) {
                message =
                        "Insufficient team credits. Team leader must enable overage billing for"
                                + " uninterrupted service.";
            } else {
                message =
                        "Insufficient API credits. Please purchase more credits or wait for your"
                                + " monthly cycle credits to reset.";
            }

            log.warn(
                    "[CREDIT-DEBUG] Credit validation rejected - Method: {}, URI: {}, IP: {},"
                            + " User-Agent: {}, User: {}, Supabase ID: {}, Reason: {}",
                    request.getMethod(),
                    request.getRequestURI(),
                    getClientIpAddress(request),
                    request.getHeader("User-Agent"),
                    currentUser.getUsername(),
                    currentUser.getSupabaseId(),
                    message);

            response.setStatus(429); // 429 Too Many Requests
            response.setContentType("application/json");
            response.getWriter()
                    .write(
                            String.format(
                                    "{\"error\":\"INSUFFICIENT_CREDITS\",\"message\":\"%s\",\"status\":429}",
                                    message));
            response.getWriter().flush();
            return false;
        }

        // Log when metered billing users are using overage credits
        if (!hasSufficientCredits && hasMeteredBilling) {
            log.info(
                    "[CREDIT-DEBUG] Metered billing user {} proceeding with insufficient free credits (have: {}, need: {}) - will use overage credits (billed monthly)",
                    currentUser.getUsername(),
                    availableCredits,
                    resourceWeight);
        }

        // Mark request as eligible for credit consumption
        request.setAttribute(ATTR_CREDIT_ELIGIBLE, Boolean.TRUE);
        request.setAttribute(ATTR_API_KEY, apiKey);
        request.setAttribute(ATTR_RESOURCE_WEIGHT, resourceWeight);

        // Store whether this is API key or JWT authentication for advice classes
        boolean isApiKeyAuth = auth instanceof ApiKeyAuthenticationToken;
        request.setAttribute("IS_API_KEY_AUTH", isApiKeyAuth);

        // Store IS_API_REQUEST for waterfall logic (API key requests always consume credits)
        request.setAttribute("IS_API_REQUEST", isApiKeyAuth);

        log.debug(
                "[CREDIT-DEBUG] Credit validation passed - request marked as eligible for consumption (will consume after success/error)");

        return true;
    }

    // TODO: Migration required - was @Override HandlerInterceptor#postHandle(request, response,
    // handler, ModelAndView). Spring's ModelAndView has been dropped from the signature (it was
    // unused). No JAX-RS equivalent of postHandle; the success path is handled by
    // CreditSuccessAdvice.
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // Success path now handled by CreditSuccessAdvice - no spending in postHandle anymore
        log.debug("[CREDIT-DEBUG] postHandle: Success path will be handled by CreditSuccessAdvice");
    }

    // TODO: Migration required - was @Override HandlerInterceptor#afterCompletion(request, response,
    // handler, Exception). Re-wire via a JAX-RS ContainerResponseFilter if afterCompletion semantics
    // are needed; the error path is handled by CreditErrorAdvice.
    public void afterCompletion(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex)
            throws Exception {
        // Error path now handled by CreditErrorAdvice - no spending in afterCompletion anymore
        if (ex != null) {
            log.debug(
                    "[CREDIT-DEBUG] afterCompletion: Error path will be handled by CreditErrorAdvice: {}",
                    ex.getClass().getSimpleName());
        } else {
            log.debug(
                    "[CREDIT-DEBUG] afterCompletion: Success path already handled by CreditSuccessAdvice");
        }
    }

    // TODO: Migration required - was @Override AsyncHandlerInterceptor#afterConcurrentHandlingStarted.
    // JAX-RS handles async dispatch differently; no direct equivalent required.
    public void afterConcurrentHandlingStarted(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // For async requests (Callable, DeferredResult, etc.), prevent duplicate processing
        // The actual postHandle/afterCompletion will be called when async processing completes
        log.debug(
                "[CREDIT-DEBUG] afterConcurrentHandlingStarted: Async processing started - skipping interceptor logic");
    }

    /**
     * // TODO: Migration required - resolves the resource {@link Method} that the original code read
     * from Spring's {@code HandlerMethod}. Until this is wired to JAX-RS {@code ResourceInfo}, it
     * supports a handler that is already a {@link Method} or exposes a no-arg {@code getMethod()}
     * returning one (reflective best-effort), so the {@code @AutoJobPostMapping} gating still works.
     */
    private Method resolveResourceMethod(Object handler) {
        if (handler instanceof Method m) {
            return m;
        }
        if (handler == null) {
            return null;
        }
        try {
            Method getter = handler.getClass().getMethod("getMethod");
            Object result = getter.invoke(handler);
            if (result instanceof Method m) {
                return m;
            }
        } catch (ReflectiveOperationException ignored) {
            // Handler does not expose a resolvable resource method.
        }
        return null;
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }

    private String getClientIpAddress(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }

        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }

        return request.getRemoteAddr();
    }

    /**
     * Determines if credit limits should apply to a JWT user.
     *
     * <p>Rules:
     *
     * <ul>
     *   <li>Metered billing users: always consume (free tier first, then report overage to Stripe)
     *   <li>Anonymous users: consume credits (web/API)
     *   <li>Regular users: consume credits (web/API)
     *   <li>Pro users: unlimited on web UI (waterfall logic handles this), but subject to checks
     *   <li>API users: always consume credits
     *   <li>Internal API users: unlimited everywhere
     *   <li>Admin users: unlimited everywhere
     * </ul>
     */
    private boolean shouldApplyCreditsToJwtUser(User user) {
        String roles = user.getRolesAsString();

        // Internal API users are unlimited everywhere (for backend internal operations)
        if (roles.contains("STIRLING-PDF-BACKEND-API-USER")) {
            log.debug("[CREDIT-DEBUG] Internal API user {} - unlimited usage", user.getUsername());
            return false;
        }

        // Pro users: Let them through to waterfall logic
        // (Pro gets unlimited UI but API still consumes credits)
        if (roles.contains("ROLE_PRO_USER")) {
            log.debug(
                    "[CREDIT-DEBUG] Pro user {} - will be handled by waterfall logic",
                    user.getUsername());
            return true; // Changed from false - let waterfall handle Pro exemption
        }

        // Admin users are unlimited everywhere
        if (roles.contains("ROLE_ADMIN")) {
            log.debug("[CREDIT-DEBUG] Admin user {} - unlimited usage", user.getUsername());
            return false;
        }

        // All other users (anonymous, regular, limited API users, metered billing) consume credits
        log.debug(
                "[CREDIT-DEBUG] User {} with roles {} - subject to credit limits",
                user.getUsername(),
                roles);
        return true;
    }

    /**
     * Gets the identifier for credit consumption. For API key users, use their actual API key. For
     * JWT users, use the Supabase ID as identifier (auth.getName() returns Supabase ID).
     */
    private String getApiKeyForUser(Authentication auth, User user) {
        if (auth instanceof ApiKeyAuthenticationToken) {
            return user.getApiKey();
        } else {
            // For JWT users, return Supabase ID as the credit consumption identifier
            return AuthenticationUtils.extractSupabaseId(auth);
        }
    }

    /**
     * Check if team leader has metered billing enabled. This allows teams to use overage billing
     * when team credits are exhausted.
     *
     * @param team the team to check
     * @return true if team leader has metered billing enabled
     */
    private boolean checkTeamLeaderMeteredBilling(stirling.software.proprietary.model.Team team) {
        if (team == null || team.getId() == null) {
            return false;
        }

        try {
            java.util.List<stirling.software.saas.model.TeamMembership> leaders =
                    membershipRepository.findByTeamIdAndRole(
                            team.getId(),
                            stirling.software.common.model.enumeration.TeamRole.LEADER);

            if (leaders.isEmpty()) {
                return false;
            }

            User leader = leaders.get(0).getUser();
            return saasUserExtensionService.isMeteredBillingEnabled(leader);
        } catch (Exception e) {
            log.error("Error checking team leader metered billing: {}", e.getMessage());
            return false;
        }
    }
}
