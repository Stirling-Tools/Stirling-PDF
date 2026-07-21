package stirling.software.saas.payg.filter;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.payg.entitlement.EntitlementGuard;

/**
 * Wires the PAYG filter + interceptor into Spring MVC. Two registrations:
 *
 * <ul>
 *   <li>{@link PaygResponseBodyWrapperFilter} as a Servlet filter — registered with no explicit
 *       order so it sits at the end of the Spring filter chain (after all security filters). Pure
 *       response-wrapping plumbing.
 *   <li>{@link PaygChargeInterceptor} as a Spring MVC interceptor — intercepts {@code /api/**} with
 *       admin/info/health exclusions.
 * </ul>
 */
@Configuration
@Profile("saas")
@RequiredArgsConstructor
public class PaygWebMvcConfig implements WebMvcConfigurer {

    private final PaygChargeInterceptor paygChargeInterceptor;
    private final EntitlementGuard entitlementGuard;

    @Bean
    public FilterRegistrationBean<PaygResponseBodyWrapperFilter>
            paygResponseBodyWrapperFilterRegistration(PaygResponseBodyWrapperFilter filter) {
        FilterRegistrationBean<PaygResponseBodyWrapperFilter> reg =
                new FilterRegistrationBean<>(filter);
        reg.addUrlPatterns("/api/*");
        return reg;
    }

    /**
     * The {@code PaygChargeInterceptor} runs after the {@link #ENTITLEMENT_GUARD_ORDER guard}, so
     * {@code openProcess} only fires for requests the guard has admitted. See {@link
     * #ENTITLEMENT_GUARD_ORDER} for the full ordering rationale.
     */
    public static final int INTERCEPTOR_ORDER = 1000;

    /**
     * The {@code EntitlementGuard} runs BEFORE the charge interceptor. Spring runs interceptors in
     * ascending order on the way in and skips a later interceptor's {@code preHandle} (and its
     * {@code afterCompletion}) entirely once an earlier one returns {@code false} — so a request
     * the guard refuses (over its free allowance / spending cap, or with no subscription to bill)
     * short-circuits with its 402 before the charge interceptor ever runs. A blocked request
     * therefore never opens a process, materialises inputs, or writes a charge: a refused operation
     * must not bill, and running the guard first guarantees that structurally rather than by
     * compensating after the fact.
     */
    public static final int ENTITLEMENT_GUARD_ORDER = 900;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(paygChargeInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/config/**", "/api/v1/info/**", "/api/v1/admin/**")
                .order(INTERCEPTOR_ORDER);

        registry.addInterceptor(entitlementGuard)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/config/**", "/api/v1/info/**", "/api/v1/admin/**")
                .order(ENTITLEMENT_GUARD_ORDER);
    }
}
