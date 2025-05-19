package stirling.software.SPDF.EE;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.EE.KeygenLicenseVerifier.License;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.EnterpriseEdition;
import stirling.software.SPDF.model.ApplicationProperties.Premium;
import stirling.software.SPDF.model.ApplicationProperties.Premium.ProFeatures.GoogleDrive;

@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class EEAppConfig {

    private final ApplicationProperties applicationProperties;

    private final LicenseKeyChecker licenseKeyChecker;

    public EEAppConfig(
            ApplicationProperties applicationProperties, LicenseKeyChecker licenseKeyChecker) {
        this.applicationProperties = applicationProperties;
        this.licenseKeyChecker = licenseKeyChecker;
        migrateEnterpriseSettingsToPremium(this.applicationProperties);
    }

    @Bean(name = "runningProOrHigher")
    public boolean runningProOrHigher() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult() != License.NORMAL;
    }

    @Bean(name = "license")
    public String licenseType() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult().name();
    }

    @Bean(name = "runningEE")
    public boolean runningEnterprise() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult() == License.ENTERPRISE;
    }

    @Bean(name = "SSOAutoLogin")
    public boolean ssoAutoLogin() {
        return applicationProperties.getPremium().getProFeatures().isSsoAutoLogin();
    }

    @Bean(name = "GoogleDriveEnabled")
    public boolean googleDriveEnabled() {
        return runningProOrHigher()
                && applicationProperties.getPremium().getProFeatures().getGoogleDrive().isEnabled();
    }

    @Bean(name = "GoogleDriveConfig")
    public GoogleDrive googleDriveConfig() {
        return applicationProperties.getPremium().getProFeatures().getGoogleDrive();
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
                || premium.getKey().equals("00000000-0000-0000-0000-000000000000")) {
            if (enterpriseEdition.getKey() != null
                    && !enterpriseEdition.getKey().equals("00000000-0000-0000-0000-000000000000")) {
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
