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
 * <p>Linked Team entitlement is evaluated on access, including unlink and revocation; installed
 * licences retain their own validation lifecycle.
 *
 * <p>Hazard: this is not the only reader of the licence. The following still resolve it once at
 * startup from the {@code runningProOrHigher} / {@code runningEE} beans, so a licence change
 * reaches them only on restart.
 *
 * <ul>
 *   <li>Structures built at boot: the security filter chain in SecurityConfiguration and
 *       ClusterLicenseGate.
 *   <li>Request-time checks against the frozen flag: AuditService (which events it records),
 *       AuditCleanupService (retention cap) and DatabaseNotificationService.
 * </ul>
 *
 * <p>TODO(#7848): AuditService keeps dropping every event outside PDF_PROCESS and FILE_OPERATION
 * after a post-boot activation, so the audit dashboard the live gate has just unlocked shows a
 * truncated trail until restart.
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
        return licenseKeyChecker.premiumTier();
    }

    @Override
    public boolean isRunningProOrHigher() {
        License license = getCurrentLicense();
        return license == License.SERVER || license == License.ENTERPRISE;
    }

    @Override
    public boolean hasServerLicense() {
        return licenseKeyChecker.getLicenseKeyResult() == License.SERVER;
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
