package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Locks the interceptor ordering that makes "a blocked request is never charged" hold structurally:
 * the {@link stirling.software.saas.payg.entitlement.EntitlementGuard} must run BEFORE the {@link
 * PaygChargeInterceptor}. Spring skips a later interceptor's {@code preHandle} once an earlier one
 * returns {@code false}, so guard-first means a refused (402) request never reaches {@code
 * openProcess}. If these constants are ever reordered the wrong way, refused requests would start
 * billing again — this test fails first.
 */
class PaygWebMvcConfigTest {

    @Test
    void entitlementGuardRunsBeforeChargeInterceptor() {
        assertThat(PaygWebMvcConfig.ENTITLEMENT_GUARD_ORDER)
                .isLessThan(PaygWebMvcConfig.INTERCEPTOR_ORDER);
    }
}
