package stirling.software.saas.procurement.license;

import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Mock implementation of {@link EnterpriseLicenseService}: records the intended licence action and
 * returns a synthetic reference, without calling Keygen. Lets the whole procurement journey run
 * end-to-end while the real Keygen management client is a later drop-in — the seam and the stored
 * {@code license_ref} on the deal stay identical.
 *
 * <p>This is the default; it steps aside for {@code KeygenEnterpriseLicenseService} when {@code
 * stirling.keygen.enabled=true} (real Keygen secrets are wired).
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(
        name = "stirling.keygen.enabled",
        havingValue = "false",
        matchIfMissing = true)
public class MockEnterpriseLicenseService implements EnterpriseLicenseService {

    @Override
    public String issueTrialLicense(Long teamId, String ownerEmail, LocalDateTime expiresAt) {
        String ref = "mock-trial-" + UUID.randomUUID();
        log.info(
                "[procurement][mock-license] issue trial team={} owner={} expires={} ref={}",
                teamId,
                ownerEmail,
                expiresAt,
                ref);
        return ref;
    }

    @Override
    public void extendLicense(String licenseRef, LocalDateTime newExpiry) {
        log.info("[procurement][mock-license] extend ref={} newExpiry={}", licenseRef, newExpiry);
    }

    @Override
    public String issueAnnualLicense(
            Long teamId,
            String ownerEmail,
            LocalDateTime expiresAt,
            String existingRef,
            LicenseEntitlements ent) {
        // Upgrade in place when a trial licence already exists, so the key stays stable.
        String ref = existingRef != null ? existingRef : "mock-annual-" + UUID.randomUUID();
        log.info(
                "[procurement][mock-license] issue annual team={} owner={} seats={} volume={} deployment={} expires={} ref={} upgrade={}",
                teamId,
                ownerEmail,
                ent.seats(),
                ent.volume(),
                ent.deployment(),
                expiresAt,
                ref,
                existingRef != null);
        return ref;
    }

    @Override
    public void suspendLicense(String licenseRef) {
        log.info("[procurement][mock-license] suspend ref={}", licenseRef);
    }

    @Override
    public String checkOutLicenseFile(String licenseRef) {
        log.info("[procurement][mock-license] check-out licence file ref={}", licenseRef);
        // A syntactically shaped stand-in so the portal download path is exercisable without
        // Keygen; not a valid certificate.
        return "-----BEGIN LICENSE FILE-----\nmock-offline-license-for-"
                + licenseRef
                + "\n-----END LICENSE FILE-----\n";
    }
}
