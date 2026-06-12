package stirling.software.saas.payg.filter;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

/**
 * Wires the PAYG filter + interceptor into Spring MVC. Two registrations:
 *
 * <ul>
 *   <li>{@link PaygResponseBodyWrapperFilter} as a Servlet filter — registered with no explicit
 *       order so it sits at the end of the Spring filter chain (after all security filters). Pure
 *       response-wrapping plumbing.
 *   <li>{@link PaygChargeInterceptor} as a Spring MVC interceptor — registered AFTER {@code
 *       UnifiedCreditInterceptor} so legacy credit rejections short-circuit before we hash inputs.
 *       Both intercept {@code /api/**} with the same admin/info/health exclusions as the legacy
 *       config.
 * </ul>
 */
// TODO: Migration required - interceptor registration moved to @Provider JAX-RS filters; filter
// registration (PaygResponseBodyWrapperFilter on /api/*) now via @WebFilter or quarkus filter
// config
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
public class PaygWebMvcConfig {

    private final PaygChargeInterceptor paygChargeInterceptor;

    /**
     * Interceptor ordering: the legacy {@code UnifiedCreditInterceptor} (registered with default
     * order = 0 in {@code CreditInterceptorConfig}) must run BEFORE this one so credit rejections
     * short-circuit before we hash inputs. Explicit positive order guarantees this regardless of
     * filter discovery order.
     */
    public static final int INTERCEPTOR_ORDER = 1000;
}
