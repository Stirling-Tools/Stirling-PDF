package stirling.software.proprietary.security.configuration.ee;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

/**
 * Service that provides dynamic license checking instead of cached beans. This ensures that when
 * admins update the license key, the changes are immediately reflected in the UI and config
 * endpoints without requiring a restart.
 *
 * <p>Note: EnterpriseEndpointAspect and the filters still inject cached beans at startup, so those
 * gates reflect a licence change only after a restart. That was acceptable while a licence was the
 * only way to hold a tier — it is entered once, at setup. A Team plan is bought later and cancelled
 * by a button, which is why {@code PremiumEndpointAspect} was moved onto this service: granting a
 * cancelled plan until someone restarts is not a trade anyone would make.
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
