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

    /**
     * Issue a time-boxed trial licence for the team, owned by {@code ownerEmail} (the team leader);
     * returns the licence reference (the Keygen key, stored on the deal).
     */
    String issueTrialLicense(Long teamId, String ownerEmail, LocalDateTime expiresAt);

    /** Move a licence's expiry out (trial extension). */
    void extendLicense(String licenseRef, LocalDateTime newExpiry);

    /**
     * Issue/upgrade to a committed annual licence with the quote's entitlements ({@code seats} = 0
     * means unlimited). When {@code existingRef} is non-null (the team already has a trial
     * licence), that licence is upgraded in place so the key the buyer already holds keeps working;
     * otherwise a new licence is created. Owned by {@code ownerEmail}; returns the licence
     * reference.
     */
    String issueAnnualLicense(
            Long teamId,
            String ownerEmail,
            String deployment,
            int seats,
            LocalDateTime expiresAt,
            String existingRef);

    /** Suspend a licence (e.g. payment failed, deal lost). */
    void suspendLicense(String licenseRef);

    /**
     * Check out a signed, offline-verifiable licence file (a {@code -----BEGIN LICENSE FILE-----}
     * certificate) for the given licence, for an air-gapped self-hosted instance. The paid offline
     * add-on gates whether this is offered; the certificate itself is generated on demand and never
     * stored.
     */
    String checkOutLicenseFile(String licenseRef);
}
