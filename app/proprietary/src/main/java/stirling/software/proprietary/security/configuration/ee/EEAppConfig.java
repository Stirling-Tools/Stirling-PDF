package stirling.software.proprietary.security.configuration.ee;

import static stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Dependent;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.EnterpriseEdition;
import stirling.software.common.model.ApplicationProperties.Premium;

/**
 * Enterprise/Premium CDI producers (migrated from a Spring {@code @Configuration} class).
 *
 * <p>MIGRATION NOTES (Spring -> Quarkus CDI):
 *
 * <ul>
 *   <li>{@code @Configuration} -> {@code @ApplicationScoped}; {@code @Bean(name="x")} ->
 *       {@code @Produces @Named("x")}. These producers deliberately omit {@code @DefaultBean} so
 *       they OVERRIDE the {@code @DefaultBean} producers declared in {@code
 *       stirling.software.common.configuration.AppConfig} whenever the :proprietary module is on
 *       the classpath - this is the Quarkus idiom for Spring's profile-based bean override.
 *   <li>{@code @Profile("security & !saas")} -> {@code @IfBuildProfile("security")}. Spring's
 *       composite expression {@code security & !saas} cannot be expressed directly; the build-time
 *       profile gates "security". TODO: Migration required - the {@code & !saas} half of the
 *       expression is NOT honoured here. In :saas mode the (still to be migrated) {@code
 *       SaasLicenseOverride} producers must take precedence, and these enterprise producers must be
 *       suppressed, otherwise CDI will see two producers for the same {@code @Named} qualifier.
 *       Re-evaluate once :saas is migrated (e.g. gate on a runtime "saas" flag or split into
 *       separate build profiles).
 *   <li>{@code @Order(Ordered.HIGHEST_PRECEDENCE)} dropped - CDI has no ordered configuration
 *       classes; ordering was only used by Spring to win the bean override race, which
 *       {@code @DefaultBean}/no-{@code @DefaultBean} now handles.
 *   <li>Constructor-side {@code migrateEnterpriseSettingsToPremium(...)} call moved to a
 *       {@code @PostConstruct} method so it still runs once when the bean is created.
 *   <li>{@code boolean} producers marked {@code @Dependent}: a CDI normal scope (default
 *       {@code @ApplicationScoped} on a producer) requires a client proxy which is impossible for a
 *       primitive {@code boolean}, so {@code @Dependent} is used to recompute the value at each
 *       injection point.
 * </ul>
 */
@ApplicationScoped
@IfBuildProfile("security")
public class EEAppConfig {

    private final ApplicationProperties applicationProperties;

    private final LicenseKeyChecker licenseKeyChecker;

    @Inject
    public EEAppConfig(
            ApplicationProperties applicationProperties, LicenseKeyChecker licenseKeyChecker) {
        this.applicationProperties = applicationProperties;
        this.licenseKeyChecker = licenseKeyChecker;
    }

    @PostConstruct
    void init() {
        migrateEnterpriseSettingsToPremium(this.applicationProperties);
    }

    @Produces
    @Dependent
    @Named("runningProOrHigher")
    public boolean runningProOrHigher() {
        License license = licenseKeyChecker.getPremiumLicenseEnabledResult();
        return license == License.SERVER || license == License.ENTERPRISE;
    }

    @Produces
    @Named("license")
    public String licenseType() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult().name();
    }

    @Produces
    @Dependent
    @Named("runningEE")
    public boolean runningEnterprise() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult() == License.ENTERPRISE;
    }

    @Produces
    @Dependent
    @Named("SSOAutoLogin")
    public boolean ssoAutoLogin() {
        boolean enabled = applicationProperties.getPremium().getProFeatures().isSsoAutoLogin();
        if (enabled) {
            licenseKeyChecker.requireProOrEnterprise("premium.proFeatures.ssoAutoLogin=true");
        }
        return enabled;
    }

    // TODO: Remove post migration
    @SuppressWarnings("deprecation")
    public void migrateEnterpriseSettingsToPremium(ApplicationProperties applicationProperties) {
        EnterpriseEdition enterpriseEdition = applicationProperties.getEnterpriseEdition();
        Premium premium = applicationProperties.getPremium();

        // Only proceed if both objects exist
        if (enterpriseEdition == null || premium == null) {
            return;
        }

        // Copy the license key if it's set in enterprise but not in premium
        if (premium.getKey() == null
                || "00000000-0000-0000-0000-000000000000".equals(premium.getKey())) {
            if (enterpriseEdition.getKey() != null
                    && !"00000000-0000-0000-0000-000000000000".equals(enterpriseEdition.getKey())) {
                premium.setKey(enterpriseEdition.getKey());
            }
        }

        // Copy enabled state if enterprise is enabled but premium is not
        if (!premium.isEnabled() && enterpriseEdition.isEnabled()) {
            premium.setEnabled(true);
        }

        // Copy SSO auto login setting
        if (!premium.getProFeatures().isSsoAutoLogin() && enterpriseEdition.isSsoAutoLogin()) {
            premium.getProFeatures().setSsoAutoLogin(true);
        }

        // Copy CustomMetadata settings
        Premium.ProFeatures.CustomMetadata premiumMetadata =
                premium.getProFeatures().getCustomMetadata();
        EnterpriseEdition.CustomMetadata enterpriseMetadata = enterpriseEdition.getCustomMetadata();

        if (enterpriseMetadata != null && premiumMetadata != null) {
            // Copy autoUpdateMetadata setting
            if (!premiumMetadata.isAutoUpdateMetadata()
                    && enterpriseMetadata.isAutoUpdateMetadata()) {
                premiumMetadata.setAutoUpdateMetadata(true);
            }

            // Copy author if not set in premium but set in enterprise
            if ((premiumMetadata.getAuthor() == null
                            || premiumMetadata.getAuthor().trim().isEmpty()
                            || "username".equals(premiumMetadata.getAuthor()))
                    && enterpriseMetadata.getAuthor() != null
                    && !enterpriseMetadata.getAuthor().trim().isEmpty()) {
                premiumMetadata.setAuthor(enterpriseMetadata.getAuthor());
            }

            // Copy creator if not set in premium but set in enterprise and different from default
            if ((premiumMetadata.getCreator() == null
                            || "Stirling-PDF".equals(premiumMetadata.getCreator()))
                    && enterpriseMetadata.getCreator() != null
                    && !"Stirling-PDF".equals(enterpriseMetadata.getCreator())) {
                premiumMetadata.setCreator(enterpriseMetadata.getCreator());
            }

            // Copy producer if not set in premium but set in enterprise and different from default
            if ((premiumMetadata.getProducer() == null
                            || "Stirling-PDF".equals(premiumMetadata.getProducer()))
                    && enterpriseMetadata.getProducer() != null
                    && !"Stirling-PDF".equals(enterpriseMetadata.getProducer())) {
                premiumMetadata.setProducer(enterpriseMetadata.getProducer());
            }
        }
    }
}
