package stirling.software.proprietary.security.configuration.ee;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

/**
 * Service that provides dynamic license checking instead of cached beans.
 * This ensures that when admins update the license key, the changes are
 * immediately reflected in the UI and config endpoints without requiring a restart.
 *
 * Note: Some components (EnterpriseEndpointAspect, PremiumEndpointAspect, filters)
 * still inject cached beans at startup for performance. These will require a restart
 * to reflect license changes. This is acceptable because:
 * 1. Most deployments add licenses during initial setup
 * 2. License changes in production typically warrant a restart anyway
 * 3. UI reflects changes immediately (banner disappears, license status updates)
 */
@Service
@RequiredArgsConstructor
public class DynamicLicenseService implements LicenseServiceInterface {

    private final LicenseKeyChecker licenseKeyChecker;

    /**
     * Get the current license type dynamically (not cached).
     * @return Current license: NORMAL, SERVER, or ENTERPRISE
     */
    public License getCurrentLicense() {
        return licenseKeyChecker.getPremiumLicenseEnabledResult();
    }

    @Override
    public boolean isRunningProOrHigher() {
        License license = getCurrentLicense();
        return license == License.SERVER || license == License.ENTERPRISE;
    }

    @Override
    public boolean isRunningEE() {
        return getCurrentLicense() == License.ENTERPRISE;
    }

    @Override
    public String getLicenseTypeName() {
        return getCurrentLicense().name();
    }
}
