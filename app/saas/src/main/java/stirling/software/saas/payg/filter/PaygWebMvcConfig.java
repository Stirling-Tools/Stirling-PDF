package stirling.software.saas.payg.filter;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Holds the PAYG hot-path ordering constants. Under Spring MVC these registered {@link
 * PaygChargeInterceptor} and the entitlement guard as ordered interceptors; under Quarkus the
 * interceptor/guard are JAX-RS filters that self-order via {@code @Priority}. The order constants
 * remain the single source of truth for that relative ordering.
 *
 * <p>// TODO: Migration required - the Spring {@code WebMvcConfigurer#addInterceptors} registration
 * was removed. Re-express it as JAX-RS {@code @Provider} ContainerRequest/ResponseFilters annotated
 * with {@code @Priority(ENTITLEMENT_GUARD_ORDER)} / {@code @Priority(INTERCEPTOR_ORDER)} (and a
 * {@code @WebFilter} for {@link PaygResponseBodyWrapperFilter}) once the interceptor is converted.
 */
@ApplicationScoped
@IfBuildProfile("saas")
public class PaygWebMvcConfig {

    /**
     * The {@code PaygChargeInterceptor} runs after the {@link #ENTITLEMENT_GUARD_ORDER guard}, so
     * {@code openProcess} only fires for requests the guard has admitted. See {@link
     * #ENTITLEMENT_GUARD_ORDER} for the full ordering rationale.
     */
    public static final int INTERCEPTOR_ORDER = 1000;

    /**
     * The {@code EntitlementGuard} runs BEFORE the charge interceptor. A request the guard refuses
     * (over its free allowance / spending cap, or with no subscription to bill) short-circuits with
     * its 402 before the charge interceptor ever runs. A blocked request therefore never opens a
     * process, materialises inputs, or writes a charge: running the guard first guarantees that
     * structurally rather than by compensating after the fact.
     */
    public static final int ENTITLEMENT_GUARD_ORDER = 900;
}
