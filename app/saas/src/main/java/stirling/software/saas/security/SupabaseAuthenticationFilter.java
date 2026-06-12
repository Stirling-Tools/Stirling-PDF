package stirling.software.saas.security;

import static org.apache.commons.lang3.StringUtils.isBlank;
import static org.apache.commons.lang3.StringUtils.isNotBlank;
import static stirling.software.common.model.enumeration.Role.LIMITED_API_USER;
import static stirling.software.common.model.enumeration.Role.USER;
import static stirling.software.common.util.RequestUriUtils.isPublicAuthEndpoint;
import static stirling.software.common.util.RequestUriUtils.isStaticResource;
import static stirling.software.proprietary.security.model.AuthenticationType.ANONYMOUS;
import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.WEB;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.eclipse.microprofile.jwt.JsonWebToken;

import jakarta.persistence.PersistenceException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.transaction.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.AuthenticationException;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.AmrMethod;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.model.exception.AuthenticationFailureException;
import stirling.software.saas.model.exception.UserNotFoundException;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;
import stirling.software.saas.util.LogRedactionUtils;

/**
 * Stateless JWT authentication filter for the saas profile.
 *
 * <p>// TODO: Migration required - this was a Spring {@code OncePerRequestFilter}. It must be
 * re-registered as a JAX-RS {@code @jakarta.ws.rs.container.ContainerRequestFilter} with
 * {@code @jakarta.ws.rs.ext.Provider} (or a {@code jakarta.servlet.Filter}) and ordered before the
 * Quarkus OIDC/auth processing. The {@code doFilterInternal}/{@code shouldNotFilter} servlet
 * signatures are retained here; the request/response handling and entry-point error path
 * (previously Spring's {@code BearerTokenAuthenticationEntryPoint}) must be reattached during that
 * conversion. JWT decoding/validation (previously Spring {@code JwtDecoder}/{@code NimbusJwtDecoder})
 * must move to Quarkus OIDC; the {@link JwtDecoder} functional interface below is a placeholder so
 * the decode call site keeps compiling.
 */
@Slf4j
public class SupabaseAuthenticationFilter {

    public static final String BEARER_PREFIX = "Bearer ";
    public static final String ANON_PREFIX = "anon_";

    /**
     * // TODO: Migration required - placeholder for Spring's {@code
     * org.springframework.security.oauth2.jwt.JwtDecoder}. Replace with Quarkus OIDC token parsing
     * that yields a verified {@link JsonWebToken} (or throws on invalid token).
     */
    @FunctionalInterface
    public interface JwtDecoder {
        JsonWebToken decode(String token);
    }

    private final TeamService teamService;
    private final UserService userService;
    private final SupabaseUserService supabaseUserService;
    private final stirling.software.saas.service.CreditService creditService;
    private final SaasTeamService saasTeamService;
    private final JwtDecoder jwtDecoder;

    // TODO: Migration required - the Spring AuthenticationEntryPoint
    // (BearerTokenAuthenticationEntryPoint) that wrote the 401 challenge has no Quarkus equivalent
    // here. When converting to a JAX-RS @Provider filter, emit the 401 / WWW-Authenticate response
    // directly (or delegate to Quarkus OIDC) in place of authenticationEntryPoint.commence(...).

    public SupabaseAuthenticationFilter(
            TeamService teamService,
            UserService userService,
            SupabaseUserService supabaseUserService,
            stirling.software.saas.service.CreditService creditService,
            SaasTeamService saasTeamService,
            JwtDecoder jwtDecoder) {
        this.teamService = teamService;
        this.userService = userService;
        this.supabaseUserService = supabaseUserService;
        this.creditService = creditService;
        this.saasTeamService = saasTeamService;
        this.jwtDecoder = jwtDecoder;
    }

    // TODO: Migration required - this retains the original OncePerRequestFilter.doFilterInternal
    // behavior. Wire it into a JAX-RS ContainerRequestFilter / servlet Filter. The error branch
    // previously called authenticationEntryPoint.commence(request, response, e); emit the 401
    // response directly during that conversion.
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (isStaticResource(request.getContextPath(), request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        if (isPublicAuthEndpoint(request.getRequestURI(), request.getContextPath())) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication existingAuth = SecurityContextHolder.getContext().getAuthentication();
        if (existingAuth != null && existingAuth.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            if (apiKeyAuthenticated(request)) {
                filterChain.doFilter(request, response);
                return;
            }
            processJwtAuthentication(request);
        } catch (AuthenticationException e) {
            SecurityContextHolder.clearContext();
            // TODO: Migration required - was authenticationEntryPoint.commence(request, response, e)
            // (Spring BearerTokenAuthenticationEntryPoint). Emit the 401 challenge response here when
            // converting to a JAX-RS @Provider filter.
            log.debug("JWT authentication failed: {}", e.getMessage());
            return;
        }

        filterChain.doFilter(request, response);
    }

    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();

        if ("GET".equalsIgnoreCase(request.getMethod())
                || "HEAD".equalsIgnoreCase(request.getMethod())) {
            if (RequestUriUtils.isStaticResource(contextPath, uri)
                    || RequestUriUtils.isFrontendRoute(contextPath, uri)) {
                return true;
            }
        }
        return isPublicAuthEndpoint(uri, contextPath);
    }

    private void processJwtAuthentication(HttpServletRequest request)
            throws AuthenticationException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            return;
        }

        String token = authHeader.substring(BEARER_PREFIX.length()).trim();

        try {
            JsonWebToken jwt = jwtDecoder.decode(token);
            String supabaseId = jwt.getSubject();

            if (!validateRequiredClaims(jwt)) {
                throw new AuthenticationFailureException("Invalid JWT: missing required claims");
            }

            User user = getOrCreateUser(jwt);

            EnhancedJwtAuthenticationToken authToken =
                    new EnhancedJwtAuthenticationToken(
                            jwt, user.getAuthorities(), user.getUsername(), supabaseId);
            SecurityContextHolder.getContext().setAuthentication(authToken);

            // Hot path: runs on every authenticated request (>10 per page on a typical SPA),
            // so keep at DEBUG to avoid log-stream spam. Redact identifiers regardless so they
            // don't leak even when an operator dials logging up. The same outcome (auth granted)
            // is observable from the request/response logs of the controller chain.
            if (log.isDebugEnabled()) {
                log.debug(
                        "User {} authenticated via JWT (principal: {})",
                        LogRedactionUtils.redactSupabaseId(supabaseId),
                        LogRedactionUtils.redactEmail(user.getUsername()));
            }
        } catch (AuthenticationException e) {
            throw e;
        } catch (RuntimeException e) {
            // TODO: Migration required - previously caught Spring's JwtException and rethrew
            // InvalidBearerTokenException("Invalid JWT", e). Adjust to the exception type thrown by
            // the Quarkus OIDC token parser.
            throw new AuthenticationFailureException("Invalid JWT", e);
        }
    }

    private boolean validateRequiredClaims(JsonWebToken jwt) {
        boolean isAnonymous = isAnonymous(jwt);
        if (!isAnonymous && isBlank(claimAsString(jwt, "email"))) {
            return false;
        }

        String[] requiredClaims = {"iss", "aud", "exp", "iat", "sub", "role", "aal", "session_id"};
        for (String claim : requiredClaims) {
            switch (claim) {
                case "iss", "sub", "role", "aal", "session_id" -> {
                    if (isBlank(claimAsString(jwt, claim))) {
                        return false;
                    }
                }
                case "aud" -> {
                    List<String> audience = claimAsStringList(jwt, claim);
                    if (audience == null || audience.isEmpty()) {
                        return false;
                    }
                }
                case "exp", "iat" -> {
                    Instant timestamp = claimAsInstant(jwt, claim);
                    if (timestamp == null) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    private User getOrCreateUser(JsonWebToken jwt) throws AuthenticationException {
        UUID supabaseId = UUID.fromString(jwt.getSubject());
        String email = claimAsString(jwt, "email");
        Object metaObj = jwt.getClaim("app_metadata");
        @SuppressWarnings("unchecked")
        Map<String, Object> appMetadata =
                (metaObj instanceof Map<?, ?>) ? (Map<String, Object>) metaObj : null;

        try {
            // First confirm the SupabaseUser row exists (this is the auth.users mirror).
            // If not present, the JWT references a Supabase user this server hasn't synced.
            SupabaseUser supabaseUser = supabaseUserService.getUser(supabaseId);

            // Resolve to a local User by supabase_id.
            Optional<User> linkedUser = userService.findBySupabaseId(supabaseId);
            if (linkedUser.isPresent()) {
                User user = linkedUser.get();
                if (ANONYMOUS.toString().equalsIgnoreCase(user.getAuthenticationType())
                        && !supabaseUser.isAnonymous()) {
                    user = upgradeAnonymousUser(user, supabaseUser, jwt);
                }
                return user;
            }

            return createUser(jwt, supabaseId, email, appMetadata);
        } catch (UserNotFoundException e) {
            throw new AuthenticationFailureException("User not found", e);
        } catch (AuthenticationException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw new AuthenticationFailureException(
                    "Invalid authentication method: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Failed to process user authentication for {}", supabaseId, e);
            throw new AuthenticationFailureException("Failed to process user authentication", e);
        }
    }

    /** Promote a local anonymous user to the real provider+email carried on the JWT. */
    @Transactional
    protected User upgradeAnonymousUser(User user, SupabaseUser supabaseUser, JsonWebToken jwt) {
        AuthenticationType newType = resolveUpgradedAuthType(jwt);
        log.info(
                "Upgrading anonymous user {} to {} (Supabase email: {})",
                user.getId(),
                newType,
                LogRedactionUtils.redactEmail(supabaseUser.getEmail()));
        user.setAuthenticationType(newType);
        if (isNotBlank(supabaseUser.getEmail())) {
            user.setEmail(supabaseUser.getEmail());
            user.setUsername(supabaseUser.getEmail());
        }
        try {
            return userService.saveUser(user);
        } catch (PersistenceException e) {
            // TODO: Migration required - was Spring's DataIntegrityViolationException (email-collision
            // race). jakarta.persistence.PersistenceException is broader; narrow to the
            // Hibernate/JPA constraint-violation type once the persistence layer is finalized.
            log.warn(
                    "Email collision upgrading anonymous user {} to {}: {}",
                    user.getId(),
                    LogRedactionUtils.redactEmail(supabaseUser.getEmail()),
                    e.getMessage());
            throw new AuthenticationFailureException(
                    "Cannot upgrade anonymous account: email already in use", e);
        }
    }

    /** Maps Supabase's {@code amr} claim to an {@link AuthenticationType}; defaults to WEB. */
    private AuthenticationType resolveUpgradedAuthType(JsonWebToken jwt) {
        try {
            Object raw = jwt.getClaim("amr");
            if (!(raw instanceof List<?> amrList) || amrList.isEmpty()) {
                return WEB;
            }
            Object first = amrList.get(0);
            if (!(first instanceof Map<?, ?> entry)) {
                return WEB;
            }
            Object methodObj = entry.get("method");
            if (methodObj == null) {
                return WEB;
            }
            String method = methodObj.toString().toLowerCase(Locale.ROOT);
            for (AmrMethod amr : AmrMethod.values()) {
                if (amr.getMethod().equals(method)) {
                    return switch (amr) {
                        case OAUTH, SSO_SAML -> OAUTH2;
                        default -> WEB;
                    };
                }
            }
            return WEB;
        } catch (Exception e) {
            log.debug("Could not resolve upgraded auth type from amr claim; defaulting to WEB", e);
            return WEB;
        }
    }

    @Transactional
    protected User createUser(
            JsonWebToken jwt, UUID supabaseId, String email, Map<String, Object> appMetadata) {

        User newUser = new User();
        AuthenticationType authenticationType = WEB;
        String roleId = USER.getRoleId();

        if (isAnonymous(jwt)) {
            email = ANON_PREFIX + jwt.getSubject();
            authenticationType = ANONYMOUS;
            roleId = LIMITED_API_USER.getRoleId();
        } else {
            if (appMetadata == null || !appMetadata.containsKey("provider")) {
                throw new AuthenticationFailureException(
                        "Missing provider in app_metadata for non-anonymous user");
            }

            String provider = String.valueOf(appMetadata.get("provider"));
            // "email" is the password / magic-link flow; everything else Supabase exposes is an
            // external IdP (OAuth or SAML). Treat unknown non-email providers as OAUTH2 rather
            // than silently downgrading to WEB.
            if (provider != null && !provider.isBlank() && !"email".equalsIgnoreCase(provider)) {
                authenticationType = OAUTH2;
            }

            if (isNotBlank(email)) {
                newUser.setEmail(email);
            }
            if (email != null && email.startsWith(ANON_PREFIX)) {
                throw new AuthenticationFailureException(
                        "Invalid email format for non-anonymous user");
            }
        }

        newUser.setUsername(email);
        newUser.setEnabled(true);
        newUser.setFirstLogin(true);
        newUser.setRoleName(roleId);
        newUser.setTeam(teamService.getOrCreateDefaultTeam());
        newUser.setAuthenticationType(authenticationType);
        newUser.setSupabaseId(supabaseId);
        newUser.addAuthority(new Authority(roleId, newUser));

        // Create or fetch the auth.users mirror row.
        try {
            boolean isAnon = isAnonymous(jwt);
            supabaseUserService.createSupabaseUser(supabaseId, isAnon ? null : email, isAnon);
        } catch (PersistenceException ignored) {
            // Concurrent creation; fall through, the row exists.
            // TODO: Migration required - was Spring's DataIntegrityViolationException. Narrow to the
            // Hibernate/JPA constraint-violation type once the persistence layer is finalized.
        } catch (Exception e) {
            throw new AuthenticationFailureException("Failed to create SupabaseUser", e);
        }

        User savedUser;
        boolean weCreatedThisUser = true;
        try {
            savedUser = userService.saveUser(newUser);
        } catch (PersistenceException dup) {
            // Parallel filter won the race; fetch the winning row.
            // TODO: Migration required - was Spring's DataIntegrityViolationException. Narrow to the
            // Hibernate/JPA constraint-violation type once the persistence layer is finalized.
            weCreatedThisUser = false;
            savedUser =
                    userService
                            .findBySupabaseId(supabaseId)
                            .orElseThrow(
                                    () ->
                                            new AuthenticationFailureException(
                                                    "User creation conflict, but unable to find existing user",
                                                    dup));
        }

        // Only the DB-race winner runs first-time init; the losers skip it.
        if (weCreatedThisUser) {
            try {
                creditService.getOrCreateUserCredits(savedUser);
            } catch (Exception e) {
                log.warn(
                        "Failed to initialize credits for new user {} ({}): {}",
                        LogRedactionUtils.redactSupabaseId(supabaseId),
                        LogRedactionUtils.redactEmail(savedUser.getUsername()),
                        e.getMessage());
            }

            try {
                saasTeamService.createPersonalTeam(savedUser);
                savedUser = userService.findBySupabaseId(supabaseId).orElse(savedUser);
            } catch (Exception e) {
                log.warn(
                        "Failed to create personal team for new user {} ({}): {}",
                        LogRedactionUtils.redactSupabaseId(supabaseId),
                        LogRedactionUtils.redactEmail(savedUser.getUsername()),
                        e.getMessage());
            }
        }
        return savedUser;
    }

    private boolean apiKeyAuthenticated(HttpServletRequest request) throws AuthenticationException {
        Authentication existing = SecurityContextHolder.getContext().getAuthentication();
        if (existing != null && existing.isAuthenticated()) {
            return true;
        }

        String apiKey = request.getHeader("X-API-KEY");
        if (isBlank(apiKey)) {
            return false;
        }

        Optional<User> user = userService.getUserByApiKey(apiKey);
        if (user.isEmpty()) {
            throw new AuthenticationFailureException("Invalid API Key.");
        }

        userService.trackApiKeyFirstUse(user.get());

        ApiKeyAuthenticationToken authToken =
                new ApiKeyAuthenticationToken(user.get(), apiKey, user.get().getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authToken);
        return true;
    }

    private static boolean isAnonymous(JsonWebToken jwt) {
        return Boolean.TRUE.equals(jwt.<Boolean>getClaim("is_anonymous"));
    }

    // ---------------------------------------------------------------------------------------------
    // TODO: Migration required - claim accessor adapters. Spring's Jwt exposed typed claim getters
    // (getClaimAsString/getClaimAsStringList/getClaimAsInstant/getClaimAsBoolean). MicroProfile
    // JsonWebToken only exposes a generic getClaim(name); these helpers reproduce the original typed
    // semantics so the validation/user-creation logic is preserved unchanged.
    // ---------------------------------------------------------------------------------------------

    private static String claimAsString(JsonWebToken jwt, String name) {
        Object value = jwt.getClaim(name);
        return value == null ? null : value.toString();
    }

    @SuppressWarnings("unchecked")
    private static List<String> claimAsStringList(JsonWebToken jwt, String name) {
        Object value = jwt.getClaim(name);
        if (value instanceof List<?> list) {
            return (List<String>) list;
        }
        if (value instanceof String s) {
            return List.of(s);
        }
        return null;
    }

    private static Instant claimAsInstant(JsonWebToken jwt, String name) {
        Object value = jwt.getClaim(name);
        if (value instanceof Number n) {
            return Instant.ofEpochSecond(n.longValue());
        }
        if (value instanceof Instant i) {
            return i;
        }
        return null;
    }
}
