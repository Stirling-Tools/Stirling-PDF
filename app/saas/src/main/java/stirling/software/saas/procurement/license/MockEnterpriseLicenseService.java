package stirling.software.saas.procurement.license;

import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Mock implementation of {@link EnterpriseLicenseService}: records the intended licence action and
 * returns a synthetic reference, without calling Keygen. Lets the whole procurement journey run
 * end-to-end while the real Keygen management client is a later drop-in — the seam and the stored
 * {@code license_ref} on the deal stay identical.
 */
@Slf4j
@Service
@Profile("saas")
public class MockEnterpriseLicenseService implements EnterpriseLicenseService {

    @Override
    public String issueTrialLicense(Long teamId, LocalDateTime expiresAt) {
        String ref = "mock-trial-" + UUID.randomUUID();
        log.info(
                "[procurement][mock-license] issue trial team={} expires={} ref={}",
                teamId,
                expiresAt,
                ref);
        return ref;
    }

    @Override
    public void extendLicense(String licenseRef, LocalDateTime newExpiry) {
        log.info("[procurement][mock-license] extend ref={} newExpiry={}", licenseRef, newExpiry);
    }

    @Override
    public String issueAnnualLicense(Long teamId, String deployment, LocalDateTime expiresAt) {
        String ref = "mock-annual-" + UUID.randomUUID();
        log.info(
                "[procurement][mock-license] issue annual team={} deployment={} expires={} ref={}",
                teamId,
                deployment,
                expiresAt,
                ref);
        return ref;
    }

    @Override
    public void suspendLicense(String licenseRef) {
        log.info("[procurement][mock-license] suspend ref={}", licenseRef);
    }
}
