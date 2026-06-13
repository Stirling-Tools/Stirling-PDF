package stirling.software.saas.payg.filter;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

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
@Configuration
@Profile("saas")
@RequiredArgsConstructor
public class PaygWebMvcConfig implements WebMvcConfigurer {

    private final PaygChargeInterceptor paygChargeInterceptor;

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
    }
}
