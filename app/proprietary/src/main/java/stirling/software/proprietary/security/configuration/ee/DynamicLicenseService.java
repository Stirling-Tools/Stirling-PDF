package stirling.software.proprietary.security.configuration.ee;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

/**
 * Service that provides dynamic license checking instead of cached beans. This ensures that when
 * admins update the license key, the changes are immediately reflected in the UI, config endpoints
 * and the premium/enterprise endpoint gates without requiring a restart.
 *
 * <p>Note: components that build boot-time structures from the license (datasource selection in
 * DatabaseConfig, the security filter chain in SecurityConfiguration) still read the cached startup
 * beans, and a license change reaches those only on restart.
 */
@Service
@RequiredArgsConstructor
public class DynamicLicenseService implements LicenseServiceInterface {

    private final LicenseKeyChecker licenseKeyChecker;

    /**
     * Get the current license type dynamically (not cached).
     *
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
