package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.web.servlet.config.annotation.InterceptorRegistration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.saas.payg.entitlement.EntitlementGuard;

/**
 * Behavioural tests for {@link PaygWebMvcConfig}: the {@link FilterRegistrationBean} the config
 * produces and the interceptor wiring done in {@code addInterceptors}. The registry + registration
 * are mocked so the fluent path-pattern / order calls can be asserted without a Spring context.
 */
class PaygWebMvcConfigMoreTest {

    private final PaygChargeInterceptor chargeInterceptor = mock(PaygChargeInterceptor.class);
    private final EntitlementGuard entitlementGuard = mock(EntitlementGuard.class);

    private final PaygWebMvcConfig config =
            new PaygWebMvcConfig(chargeInterceptor, entitlementGuard);

    @Test
    @DisplayName("filter registration wraps the filter and maps it to /api/*")
    void filterRegistration_mapsApiPattern() {
        PaygResponseBodyWrapperFilter filter =
                new PaygResponseBodyWrapperFilter(
                        new TempFileManager(new TempFileRegistry(), new ApplicationProperties()),
                        new PaygFilterProperties());

        FilterRegistrationBean<PaygResponseBodyWrapperFilter> reg =
                config.paygResponseBodyWrapperFilterRegistration(filter);

        assertThat(reg.getFilter()).isSameAs(filter);
        assertThat(reg.getUrlPatterns()).containsExactly("/api/*");
    }

    @Test
    @DisplayName("addInterceptors registers both interceptors with their orders")
    void addInterceptors_registersBothWithOrders() {
        InterceptorRegistry registry = mock(InterceptorRegistry.class);
        InterceptorRegistration chargeRegistration = mock(InterceptorRegistration.class);
        InterceptorRegistration guardRegistration = mock(InterceptorRegistration.class);

        when(registry.addInterceptor(chargeInterceptor)).thenReturn(chargeRegistration);
        when(registry.addInterceptor(entitlementGuard)).thenReturn(guardRegistration);
        // The config chains addPathPatterns(...).excludePathPatterns(...).order(...); each returns
        // the same registration so the chain resolves on the mock.
        when(chargeRegistration.addPathPatterns(any(String[].class)))
                .thenReturn(chargeRegistration);
        when(chargeRegistration.excludePathPatterns(any(String[].class)))
                .thenReturn(chargeRegistration);
        when(guardRegistration.addPathPatterns(any(String[].class))).thenReturn(guardRegistration);
        when(guardRegistration.excludePathPatterns(any(String[].class)))
                .thenReturn(guardRegistration);

        config.addInterceptors(registry);

        verify(registry).addInterceptor(chargeInterceptor);
        verify(registry).addInterceptor(entitlementGuard);

        verify(chargeRegistration).addPathPatterns("/api/**");
        verify(chargeRegistration)
                .excludePathPatterns("/api/v1/config/**", "/api/v1/info/**", "/api/v1/admin/**");
        verify(chargeRegistration).order(PaygWebMvcConfig.INTERCEPTOR_ORDER);

        verify(guardRegistration).addPathPatterns("/api/**");
        verify(guardRegistration)
                .excludePathPatterns("/api/v1/config/**", "/api/v1/info/**", "/api/v1/admin/**");
        verify(guardRegistration).order(PaygWebMvcConfig.ENTITLEMENT_GUARD_ORDER);
    }

    @Test
    @DisplayName("charge interceptor is registered before the entitlement guard on the registry")
    void chargeInterceptorRegisteredBeforeGuard() {
        InterceptorRegistry registry = mock(InterceptorRegistry.class);
        InterceptorRegistration reg = mock(InterceptorRegistration.class, inv -> inv.getMock());

        when(registry.addInterceptor(any())).thenReturn(reg);

        config.addInterceptors(registry);

        InOrder order = inOrder(registry);
        order.verify(registry).addInterceptor(chargeInterceptor);
        order.verify(registry).addInterceptor(entitlementGuard);
    }
}
