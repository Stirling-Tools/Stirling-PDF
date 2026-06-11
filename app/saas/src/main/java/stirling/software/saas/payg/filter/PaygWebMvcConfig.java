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
 *   <li>{@link PaygChargeInterceptor} as a Spring MVC interceptor — registered AFTER {@code
 *       UnifiedCreditInterceptor} so legacy credit rejections short-circuit before we hash inputs.
 *       Both intercept {@code /api/**} with the same admin/info/health exclusions as the legacy
 *       config.
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
     * Interceptor ordering: the legacy {@code UnifiedCreditInterceptor} (registered with default
     * order = 0 in {@code CreditInterceptorConfig}) must run BEFORE this one so credit rejections
     * short-circuit before we hash inputs. Explicit positive order guarantees this regardless of
     * {@code WebMvcConfigurer} bean discovery order.
     */
    public static final int INTERCEPTOR_ORDER = 1000;

    /**
     * The entitlement guard runs AFTER the charge interceptor so cap-rejected requests still leave
     * the charge interceptor's preHandle state in the consistent open-or-bypassed shape (and so the
     * guard's 402 reaches the client without the charge interceptor needing to know about it).
     * Spring runs interceptors in registration order on the way in, reverse order on the way out;
     * the guard's preHandle short-circuit ({@code return false}) prevents the handler from running
     * but Spring still invokes the charge interceptor's afterCompletion to clean up temp files.
     */
    public static final int ENTITLEMENT_GUARD_ORDER = 1100;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(paygChargeInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/v1/credits/**",
                        "/api/v1/config/**",
                        "/api/v1/info/**",
                        "/api/v1/admin/**")
                .order(INTERCEPTOR_ORDER);

        registry.addInterceptor(entitlementGuard)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/v1/credits/**",
                        "/api/v1/config/**",
                        "/api/v1/info/**",
                        "/api/v1/admin/**")
                .order(ENTITLEMENT_GUARD_ORDER);
    }
}
