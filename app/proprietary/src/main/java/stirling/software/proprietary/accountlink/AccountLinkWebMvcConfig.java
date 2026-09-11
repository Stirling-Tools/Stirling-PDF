package stirling.software.proprietary.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the account-link entitlement gate. Path patterns cover the billable API surface; the
 * interceptor itself re-checks billability (and short-circuits manual tools), but scoping here
 * keeps the gate off the bulk of interactive endpoints entirely.
 *
 * <p>Whole config is gated behind {@code stirling.billing.account-link.enabled} +
 * {@code @Profile("!saas")}; absent when off, so no interceptor is registered.
 *
 * <p>A desktop bundle registers nothing either: desktop work belongs to the server it connects to,
 * not to the backend Tauri runs in-process.
 */
@Configuration
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AccountLinkWebMvcConfig implements WebMvcConfigurer {

    private final InstanceEntitlementInterceptor gateInterceptor;

    public AccountLinkWebMvcConfig(InstanceEntitlementInterceptor gateInterceptor) {
        this.gateInterceptor = gateInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (isDesktopBundle()) {
            return;
        }
        // AI surface is always billable; the broad /api/v1/** catch lets automation-marked manual
        // calls be gated too, while the interceptor lets genuine manual tools through.
        registry.addInterceptor(gateInterceptor)
                .addPathPatterns("/api/v1/**")
                .excludePathPatterns("/api/v1/account-link/**");
    }

    /**
     * Matches {@code FolderAccessGuard.isDesktopBundle()}: only the Tauri build sets this, and a
     * {@code Client-*} machine type is not accepted because any server can present one.
     */
    private static boolean isDesktopBundle() {
        return Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"));
    }
}
