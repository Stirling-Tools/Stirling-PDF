package stirling.software.saas.payg.entitlement;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.cap.AiToolRoutes;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Hot-path entitlement check. Runs after {@code PaygChargeInterceptor} in the MVC chain and short-
 * circuits the request before any handler work happens when the team's snapshot is missing one of
 * the gates the route declared via {@link RequiresFeature}.
 *
 * <p>Scope: routes whose handler method (or bean type) carries either {@link AutoJobPostMapping}
 * (multipart tool POSTs) or {@link RequiresFeature} (AI controllers, future non-multipart gated
 * routes). Admin / info / config endpoints are excluded by the path-pattern in {@code
 * PaygWebMvcConfig} and are additionally skipped here when they carry neither annotation, so non-
 * billable infra never trips the guard.
 *
 * <p>Decision matrix:
 *
 * <table>
 *   <tr><th>auth</th><th>required gates</th><th>snapshot enabled?</th><th>outcome</th></tr>
 *   <tr><td>anonymous</td><td>AUTOMATION or AI_SUPPORT</td><td>n/a</td><td>401 SIGNUP_REQUIRED</td></tr>
 *   <tr><td>anonymous</td><td>OFFSITE_PROCESSING / CLIENT_SIDE</td><td>n/a</td><td>200 (pass through)</td></tr>
 *   <tr><td>authenticated</td><td>required ⊆ enabled</td><td>yes</td><td>200</td></tr>
 *   <tr><td>authenticated</td><td>required ⊄ enabled</td><td>no</td><td>402 FEATURE_DEGRADED</td></tr>
 * </table>
 *
 * <p>Fail-open: any unexpected exception is logged at WARN and the request passes through. The cap
 * pipeline must never block a customer because the guard tripped on a transient DB error.
 */
@Slf4j
@Component
@Profile("saas")
public class EntitlementGuard implements HandlerInterceptor {

    private static final FeatureGate[] DEFAULT_REQUIRED_GATES = {FeatureGate.OFFSITE_PROCESSING};

    private final EntitlementService entitlementService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    private final Counter passCounter;
    private final Counter deniedDegradedCounter;
    private final Counter deniedPaygLimitCounter;
    private final Counter deniedSignupRequiredCounter;
    private final Counter errorsCounter;
    private final Counter skippedNoAnnotationCounter;

    public EntitlementGuard(
            EntitlementService entitlementService,
            UserRepository userRepository,
            MeterRegistry meterRegistry) {
        this.entitlementService = entitlementService;
        this.userRepository = userRepository;
        this.objectMapper = new ObjectMapper();

        this.passCounter =
                Counter.builder("payg.entitlement.guard")
                        .tag("outcome", "pass")
                        .register(meterRegistry);
        this.deniedDegradedCounter =
                Counter.builder("payg.entitlement.guard")
                        .tag("outcome", "denied_degraded")
                        .register(meterRegistry);
        this.deniedPaygLimitCounter =
                Counter.builder("payg.entitlement.guard")
                        .tag("outcome", "denied_payg_limit")
                        .register(meterRegistry);
        this.deniedSignupRequiredCounter =
                Counter.builder("payg.entitlement.guard")
                        .tag("outcome", "denied_signup_required")
                        .register(meterRegistry);
        this.skippedNoAnnotationCounter =
                Counter.builder("payg.entitlement.guard")
                        .tag("outcome", "skipped")
                        .register(meterRegistry);
        this.errorsCounter =
                Counter.builder("payg.entitlement.guard.errors")
                        .description("EntitlementGuard internal failures (fail-open)")
                        .register(meterRegistry);
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }
        // Scope: AutoJobPostMapping routes (multipart tool POSTs) OR routes that explicitly
        // declare @RequiresFeature (e.g. AI controllers — JSON-bodied, no AutoJobPostMapping).
        // Admin / info / config endpoints carry neither annotation and never trip the guard.
        boolean hasAutoJobPostMapping =
                AnnotationUtils.findAnnotation(hm.getMethod(), AutoJobPostMapping.class) != null
                        || AnnotationUtils.findAnnotation(
                                        hm.getBeanType(), AutoJobPostMapping.class)
                                != null;
        boolean hasRequiresFeature =
                AnnotationUtils.findAnnotation(hm.getMethod(), RequiresFeature.class) != null
                        || AnnotationUtils.findAnnotation(hm.getBeanType(), RequiresFeature.class)
                                != null;
        // AI document tools (/api/v1/ai/tools/**) live in the proprietary module and can't carry
        // @RequiresFeature; recognise them by path so they're gated on AI_SUPPORT — see
        // AiToolRoutes and PaygChargeInterceptor, which classify the same routes as AI.
        boolean aiToolRoute = AiToolRoutes.matches(request);
        if (!hasAutoJobPostMapping && !hasRequiresFeature && !aiToolRoute) {
            skippedNoAnnotationCounter.increment();
            return true;
        }

        FeatureGate[] required =
                aiToolRoute ? new FeatureGate[] {FeatureGate.AI_SUPPORT} : resolveRequiredGates(hm);
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        boolean anonymous = isAnonymous(auth);
        boolean billable = isBillable(required);

        if (anonymous) {
            if (billable) {
                return write401SignupRequired(response, required);
            }
            // Anonymous user calling a manual / OFFSITE-only tool — let it through; PAYG only
            // charges authenticated requests.
            passCounter.increment();
            return true;
        }

        Long teamId;
        try {
            teamId = resolveTeamId(auth);
        } catch (RuntimeException e) {
            log.warn("EntitlementGuard resolveTeamId failed; passing through", e);
            errorsCounter.increment();
            return true;
        }
        if (teamId == null) {
            // Defensive: authenticated principal with no team — shouldn't happen post-migration,
            // but we don't want to lock those users out. PaygChargeInterceptor short-circuits the
            // same shape upstream.
            passCounter.increment();
            return true;
        }

        EntitlementSnapshot snapshot;
        try {
            snapshot = entitlementService.getSnapshot(teamId);
        } catch (RuntimeException e) {
            log.warn("EntitlementGuard getSnapshot failed for team {}; passing through", teamId, e);
            errorsCounter.increment();
            return true;
        }

        // API-key calls are always billable usage (BillingCategory.API) — there is no "free
        // manual" path for a programmatic client the way there is for a JWT/web user, whose
        // everyday tool calls are BYPASSED and never reach a gate. So once the team is over its
        // free allowance / spending cap (DEGRADED), every API-key call hard-stops, regardless of
        // which gate the route declares. The gate loop below would otherwise wave through an API
        // call to a plain server tool (it needs only OFFSITE_PROCESSING, which survives DEGRADED),
        // letting an unsubscribed team keep consuming the API for free past its allowance.
        if (auth instanceof ApiKeyAuthenticationToken && snapshot.isDegraded()) {
            return write402PaygLimitReached(response, snapshot);
        }

        List<FeatureGate> enabled = snapshot.enabledGates();
        for (FeatureGate gate : required) {
            if (enabled == null || !enabled.contains(gate)) {
                return write402FeatureDegraded(response, required, snapshot);
            }
        }
        passCounter.increment();
        return true;
    }

    static FeatureGate[] resolveRequiredGates(HandlerMethod hm) {
        RequiresFeature ann = AnnotationUtils.findAnnotation(hm.getMethod(), RequiresFeature.class);
        if (ann == null) {
            ann = AnnotationUtils.findAnnotation(hm.getBeanType(), RequiresFeature.class);
        }
        if (ann != null && ann.value().length > 0) {
            return ann.value();
        }
        return DEFAULT_REQUIRED_GATES;
    }

    private static boolean isAnonymous(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return true;
        }
        // Spring's anonymous filter installs a token whose name is "anonymousUser".
        return "anonymousUser".equals(auth.getName());
    }

    private static boolean isBillable(FeatureGate[] required) {
        for (FeatureGate g : required) {
            if (g == FeatureGate.AUTOMATION || g == FeatureGate.AI_SUPPORT) {
                return true;
            }
        }
        return false;
    }

    private Long resolveTeamId(Authentication auth) {
        if (auth instanceof ApiKeyAuthenticationToken
                && auth.getPrincipal() instanceof User apiUser) {
            return apiUser.getTeam() == null ? null : apiUser.getTeam().getId();
        }
        String supabaseId = AuthenticationUtils.extractSupabaseId(auth);
        if (supabaseId == null) {
            return null;
        }
        UUID supabaseUuid;
        try {
            supabaseUuid = UUID.fromString(supabaseId);
        } catch (IllegalArgumentException e) {
            // Username-style principals (legacy local accounts) — no Supabase ID to look up. Skip.
            return null;
        }
        return userRepository
                .findBySupabaseId(supabaseUuid)
                .map(u -> u.getTeam() == null ? null : u.getTeam().getId())
                .orElse(null);
    }

    private boolean write401SignupRequired(HttpServletResponse response, FeatureGate[] required) {
        deniedSignupRequiredCounter.increment();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "SIGNUP_REQUIRED");
        body.put("category", inferCategory(required));
        writeJson(response, HttpStatus.UNAUTHORIZED, body);
        return false;
    }

    /**
     * 402 for a billable API-key call once the team is over its allowance / cap. The message is
     * tailored by subscription state: an un-subscribed team is told to subscribe (their free
     * allowance is spent); a subscribed team is told it hit its own spending cap. Programmatic
     * clients get a stable {@code error} code plus the spend/cap numbers so they can surface
     * something actionable.
     */
    private boolean write402PaygLimitReached(
            HttpServletResponse response, EntitlementSnapshot snapshot) {
        deniedPaygLimitCounter.increment();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "PAYG_LIMIT_REACHED");
        body.put("subscribed", snapshot.subscribed());
        body.put(
                "message",
                snapshot.subscribed()
                        ? "Your team has reached its monthly spending cap. Raise the cap to"
                                + " continue, or wait for it to reset next billing period."
                        : "Your team has used its free document allowance."
                                + " Subscribe to continue using the API.");
        body.put("state", snapshot.state().name());
        body.put("spendUnits", snapshot.periodSpendUnits());
        body.put("capUnits", snapshot.periodCapUnits());
        body.put(
                "periodEnd",
                Optional.ofNullable(snapshot.periodEnd()).map(Object::toString).orElse(null));
        writeJson(response, HttpStatus.PAYMENT_REQUIRED, body);
        return false;
    }

    private boolean write402FeatureDegraded(
            HttpServletResponse response, FeatureGate[] required, EntitlementSnapshot snapshot) {
        deniedDegradedCounter.increment();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "FEATURE_DEGRADED");
        // subscribed tells the client which usage-limit modal to show: a subscribed team is over
        // its spending cap; an un-subscribed one has spent its free allowance. (PAYG_LIMIT_REACHED
        // already carries this; mirror it here so the JWT/web path can pick the right modal too.)
        body.put("subscribed", snapshot.subscribed());
        body.put("missingGates", missingGates(required, snapshot.enabledGates()));
        body.put("state", snapshot.state().name());
        body.put(
                "periodEnd",
                Optional.ofNullable(snapshot.periodEnd()).map(Object::toString).orElse(null));
        body.put("capUnits", snapshot.periodCapUnits());
        body.put("spendUnits", snapshot.periodSpendUnits());
        writeJson(response, HttpStatus.PAYMENT_REQUIRED, body);
        return false;
    }

    private static List<String> missingGates(FeatureGate[] required, List<FeatureGate> enabled) {
        List<FeatureGate> enabledOrEmpty = enabled == null ? Collections.emptyList() : enabled;
        return Arrays.stream(required)
                .filter(g -> !enabledOrEmpty.contains(g))
                .map(Enum::name)
                .toList();
    }

    private static String inferCategory(FeatureGate[] required) {
        // Mirrors PaygChargeInterceptor.determineCategory precedence: AUTOMATION dominates AI.
        for (FeatureGate g : required) {
            if (g == FeatureGate.AUTOMATION) {
                return "AUTOMATION";
            }
        }
        for (FeatureGate g : required) {
            if (g == FeatureGate.AI_SUPPORT) {
                return "AI";
            }
        }
        return "OFFSITE_PROCESSING";
    }

    private void writeJson(
            HttpServletResponse response, HttpStatus status, Map<String, Object> body) {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        try {
            byte[] payload = objectMapper.writeValueAsBytes(body);
            response.setHeader(HttpHeaders.CONTENT_LENGTH, Integer.toString(payload.length));
            response.getOutputStream().write(payload);
            response.getOutputStream().flush();
        } catch (IOException e) {
            // Container will fall back to its default error page — we did set the status code,
            // so the client still sees the right HTTP code even if the body fails to write.
            log.warn("EntitlementGuard write response body failed", e);
            errorsCounter.increment();
        }
    }
}
