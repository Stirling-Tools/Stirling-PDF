package stirling.software.saas.procurement.license;

import java.time.LocalDateTime;

/**
 * Issues and modifies the customer-facing entitlement that actually unlocks the product for an
 * enterprise deal — a Keygen licence (trial or annual, connected or air-gapped). This is the seam
 * the real Keygen management client plugs into; today {@link MockEnterpriseLicenseService} records
 * intent without calling Keygen. Distinct from the EE {@code KeygenLicenseVerifier}, which only
 * verifies this instance's own licence.
 */
public interface EnterpriseLicenseService {

    /** Issue a time-boxed trial licence for the team; returns the licence reference. */
    String issueTrialLicense(Long teamId, LocalDateTime expiresAt);

    /** Move a licence's expiry out (trial extension). */
    void extendLicense(String licenseRef, LocalDateTime newExpiry);

    /** Issue/upgrade to a committed annual licence with the quote's entitlements. */
    String issueAnnualLicense(Long teamId, String deployment, LocalDateTime expiresAt);

    /** Suspend a licence (e.g. payment failed, deal lost). */
    void suspendLicense(String licenseRef);
}
