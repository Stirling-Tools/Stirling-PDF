package stirling.software.saas.payg.entitlement;

import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.quarkus.arc.profile.IfBuildProfile;

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
import stirling.software.saas.payg.cap.AiToolRoutes;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Hot-path entitlement check. Runs after {@code PaygChargeInterceptor} in the request chain and
 * short-circuits the request before any handler work happens when the team's snapshot is missing
 * one of the gates the route declared via {@link RequiresFeature}.
 *
 * <p>Scope: routes whose handler method (or bean type) carries either {@link AutoJobPostMapping}
 * (multipart tool POSTs) or {@link RequiresFeature} (AI controllers, future non-multipart gated
 * routes). Admin / info / config endpoints carry neither annotation and never trip the guard.
 *
 * <p>Fail-open: any unexpected exception is logged at WARN and the request passes through. The cap
 * pipeline must never block a customer because the guard tripped on a transient DB error.
 *
 * <p>// TODO: Migration required - was a Spring {@code @Component} implementing {@code
 * HandlerInterceptor}. Convert to a JAX-RS {@code @Provider} ContainerRequestFilter (priority
 * {@code PaygWebMvcConfig.ENTITLEMENT_GUARD_ORDER}). Handler-annotation introspection now uses a
 * reflective {@link Method} fallback; HTTP status/header/media-type constants are inlined literals.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
public class EntitlementGuard {

    private static final FeatureGate[] DEFAULT_REQUIRED_GATES = {FeatureGate.OFFSITE_PROCESSING};

    private static final int HTTP_UNAUTHORIZED = 401;
    private static final int HTTP_PAYMENT_REQUIRED = 402;
    private static final String APPLICATION_JSON = "application/json";

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

    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        Method resourceMethod = resolveResourceMethod(handler);
        Class<?> beanType = resolveBeanType(handler, resourceMethod);
        if (resourceMethod == null) {
            return true;
        }
        // Scope: AutoJobPostMapping routes (multipart tool POSTs) OR routes that explicitly
        // declare @RequiresFeature (e.g. AI controllers — JSON-bodied, no AutoJobPostMapping).
        // Admin / info / config endpoints carry neither annotation and never trip the guard.
        boolean hasAutoJobPostMapping =
                findAnnotation(resourceMethod, beanType, AutoJobPostMapping.class) != null;
        boolean hasRequiresFeature =
                findAnnotation(resourceMethod, beanType, RequiresFeature.class) != null;
        // AI document tools (/api/v1/ai/tools/**) live in the proprietary module and can't carry
        // @RequiresFeature; recognise them by path so they're gated on AI_SUPPORT — see
        // AiToolRoutes
        // and PaygChargeInterceptor, which classify the same routes as AI.
        boolean aiToolRoute = AiToolRoutes.matches(request);
        if (!hasAutoJobPostMapping && !hasRequiresFeature && !aiToolRoute) {
            skippedNoAnnotationCounter.increment();
            return true;
        }

        FeatureGate[] required =
                aiToolRoute
                        ? new FeatureGate[] {FeatureGate.AI_SUPPORT}
                        : resolveRequiredGates(resourceMethod, beanType);
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
            // but we don't want to lock those users out.
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

        // API-key calls are always billable usage (BillingCategory.API). Once the team is over its
        // free allowance / spending cap (DEGRADED), every API-key call hard-stops regardless of the
        // gate the route declares — otherwise a plain server tool (needs only OFFSITE_PROCESSING,
        // which survives DEGRADED) would let an unsubscribed team keep consuming the API for free.
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

    /**
     * Test seam: accepts a handler (Spring HandlerMethod shape) and resolves its required gates.
     */
    static FeatureGate[] resolveRequiredGates(Object handler) {
        Method method = resolveResourceMethodStatic(handler);
        Class<?> beanType = resolveBeanTypeStatic(handler, method);
        return resolveRequiredGates(method, beanType);
    }

    static FeatureGate[] resolveRequiredGates(Method method, Class<?> beanType) {
        RequiresFeature ann = findAnnotation(method, beanType, RequiresFeature.class);
        if (ann != null && ann.value().length > 0) {
            return ann.value();
        }
        return DEFAULT_REQUIRED_GATES;
    }

    private static boolean isAnonymous(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return true;
        }
        // The anonymous token's name is "anonymousUser".
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
        writeJson(response, HTTP_UNAUTHORIZED, body);
        return false;
    }

    /**
     * 402 for a billable API-key call once the team is over its allowance / cap. The message is
     * tailored by subscription state: an un-subscribed team is told to subscribe; a subscribed team
     * is told it hit its own spending cap.
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
        writeJson(response, HTTP_PAYMENT_REQUIRED, body);
        return false;
    }

    private boolean write402FeatureDegraded(
            HttpServletResponse response, FeatureGate[] required, EntitlementSnapshot snapshot) {
        deniedDegradedCounter.increment();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "FEATURE_DEGRADED");
        body.put("subscribed", snapshot.subscribed());
        body.put("missingGates", missingGates(required, snapshot.enabledGates()));
        body.put("state", snapshot.state().name());
        body.put(
                "periodEnd",
                Optional.ofNullable(snapshot.periodEnd()).map(Object::toString).orElse(null));
        body.put("capUnits", snapshot.periodCapUnits());
        body.put("spendUnits", snapshot.periodSpendUnits());
        writeJson(response, HTTP_PAYMENT_REQUIRED, body);
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

    private void writeJson(HttpServletResponse response, int status, Map<String, Object> body) {
        response.setStatus(status);
        response.setContentType(APPLICATION_JSON);
        response.setCharacterEncoding("UTF-8");
        try {
            byte[] payload = objectMapper.writeValueAsBytes(body);
            response.setHeader("Content-Length", Integer.toString(payload.length));
            response.getOutputStream().write(payload);
            response.getOutputStream().flush();
        } catch (IOException e) {
            // Container will fall back to its default error page — we did set the status code,
            // so the client still sees the right HTTP code even if the body fails to write.
            log.warn("EntitlementGuard write response body failed", e);
            errorsCounter.increment();
        }
    }

    /**
     * // TODO: Migration required - resolves the resource {@link Method} the original code read
     * from Spring's {@code HandlerMethod}. Until wired to JAX-RS {@code ResourceInfo}, supports a
     * handler that is already a {@link Method} or exposes a no-arg {@code getMethod()} returning
     * one.
     */
    private Method resolveResourceMethod(Object handler) {
        return resolveResourceMethodStatic(handler);
    }

    private static Method resolveResourceMethodStatic(Object handler) {
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

    private Class<?> resolveBeanType(Object handler, Method resourceMethod) {
        return resolveBeanTypeStatic(handler, resourceMethod);
    }

    private static Class<?> resolveBeanTypeStatic(Object handler, Method resourceMethod) {
        if (handler != null) {
            try {
                Method getter = handler.getClass().getMethod("getBeanType");
                Object result = getter.invoke(handler);
                if (result instanceof Class<?> c) {
                    return c;
                }
            } catch (ReflectiveOperationException ignored) {
                // Handler does not expose a bean type; fall back below.
            }
        }
        return resourceMethod == null ? null : resourceMethod.getDeclaringClass();
    }

    /**
     * Method-then-class annotation lookup replacing Spring's {@code
     * AnnotationUtils.findAnnotation}. Checks the resource method first, then walks the bean type's
     * superclass chain.
     */
    private static <A extends Annotation> A findAnnotation(
            Method method, Class<?> beanType, Class<A> annotationType) {
        if (method != null) {
            A onMethod = method.getAnnotation(annotationType);
            if (onMethod != null) {
                return onMethod;
            }
        }
        Class<?> type = beanType;
        while (type != null && type != Object.class) {
            A onType = type.getAnnotation(annotationType);
            if (onType != null) {
                return onType;
            }
            type = type.getSuperclass();
        }
        return null;
    }
}
