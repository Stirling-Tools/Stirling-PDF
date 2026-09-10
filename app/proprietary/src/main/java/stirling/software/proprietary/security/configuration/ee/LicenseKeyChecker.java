package stirling.software.proprietary.security.configuration.ee;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@Slf4j
@Component
public class LicenseKeyChecker {

    private static final String FILE_PREFIX = "file:";

    private final KeygenLicenseVerifier licenseService;

    private final ApplicationProperties applicationProperties;

    private final UserLicenseSettingsService licenseSettingsService;

    // volatile: written by evaluateLicense() on the @Scheduled refresh thread, read by request
    // threads via getPremiumLicenseEnabledResult() / requireProOrEnterprise(). Ensures readers see
    // the latest tier rather than a stale cached value.
    private volatile License premiumEnabledResult = License.NORMAL;

    /** The licence key's own tier, before any Team-plan promotion. Same volatile contract. */
    private volatile License licenseKeyResult = License.NORMAL;

    public LicenseKeyChecker(
            KeygenLicenseVerifier licenseService,
            ApplicationProperties applicationProperties,
            @Lazy UserLicenseSettingsService licenseSettingsService) {
        this.licenseService = licenseService;
        this.applicationProperties = applicationProperties;
        this.licenseSettingsService = licenseSettingsService;
    }

    @PostConstruct
    public void init() {
        evaluateLicense();
    }

    /**
     * Applies the Team-plan promotion and syncs the licence row.
     *
     * <p>The promotion is redone here rather than only in {@link #init()} because it reads a
     * persisted row: the datasource does not exist yet when {@code @PostConstruct} runs, since
     * {@code DatabaseConfig} builds it from the {@code runningProOrHigher} bean this class
     * produces. Re-verifying the licence key is deliberately not repeated — that is a Keygen round
     * trip and the key cannot have changed since boot.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        applyTeamPlanPromotion();
        synchronizeLicenseSettings();
    }

    @Scheduled(initialDelay = 604800000, fixedRate = 604800000) // 7 days in milliseconds
    public void checkLicensePeriodically() {
        try {
            evaluateLicense();
        } catch (RuntimeException e) {
            log.error(
                    "Periodic license check failed after all retries: {}. Keeping existing license"
                            + " status.",
                    e.getMessage());
        }
        synchronizeLicenseSettings();
    }

    private void evaluateLicense() {
        licenseKeyResult = verifyLicenseKey();
        applyTeamPlanPromotion();
    }

    private License verifyLicenseKey() {
        if (!applicationProperties.getPremium().isEnabled()) {
            return License.NORMAL;
        }
        String licenseKey = getLicenseKeyContent(applicationProperties.getPremium().getKey());
        if (licenseKey == null) {
            log.error("Failed to obtain license key content.");
            return License.NORMAL;
        }
        License verified = licenseService.verifyLicense(licenseKey);
        if (License.ENTERPRISE == verified) {
            log.info("License key is Enterprise.");
        } else if (License.SERVER == verified) {
            log.info("License key is Server.");
        } else {
            log.info("License key is invalid, defaulting to non pro license.");
        }
        return verified;
    }

    /**
     * Raises the effective tier to SERVER when the linked cloud team holds a Team plan.
     *
     * <p>Team is sold on a SaaS account and issues no licence key, so without this the whole of
     * what a SERVER licence unlocks would be unreachable to a customer who paid for it. Every
     * licence consumer reads {@link #getPremiumLicenseEnabledResult()}, so promoting the one field
     * is what lights them up.
     *
     * <p>Deliberately outside the {@code premium.enabled} gate. That flag is how an operator
     * declares they hold a licence and wants the licence machinery on; a Team buyer has no licence
     * to declare and never edits {@code settings.yml}, so gating on it would withhold what they
     * bought until they found a YAML flag. Holding a Team plan is itself the declaration.
     *
     * <p>Never promotes to ENTERPRISE. Enterprise is contracted and stays licence-only, so {@code
     * runningEE} and every {@code @EnterpriseEndpoint} keep requiring a real key. Precedence is an
     * OR, not a replacement: a licence key that already grants more keeps its tier.
     */
    private void applyTeamPlanPromotion() {
        if (licenseKeyResult != License.NORMAL) {
            premiumEnabledResult = licenseKeyResult;
            return;
        }
        Integer users = purchasedTeamUsers();
        // A plan for no users is not a plan. SaaS already reports an unpurchased team as no
        // allowance at all, so this only guards against a zero reaching us some other way.
        boolean entitled = users != null && users > 0;
        if (entitled) {
            log.info("Linked cloud team holds a Team plan for {} users; running as Server.", users);
        }
        premiumEnabledResult = entitled ? License.SERVER : License.NORMAL;
    }

    /**
     * Users the linked cloud team has bought, or null when it has bought none or cannot be asked.
     *
     * <p>Fails soft on purpose. The read goes to the licence row, and {@link #init()} runs before
     * the datasource exists — {@code DatabaseConfig} builds it from the {@code runningProOrHigher}
     * bean, which needs this bean fully constructed — so resolving the settings service there
     * throws rather than returning nothing. Treating that as "no plan" keeps boot working and
     * leaves {@link #onApplicationReady()} to apply the promotion once the row is readable.
     */
    private Integer purchasedTeamUsers() {
        try {
            return licenseSettingsService.refreshLinkedTeamUsers();
        } catch (RuntimeException e) {
            log.debug("Linked team allowance unavailable; not promoting", e);
            return null;
        }
    }

    private void synchronizeLicenseSettings() {
        licenseSettingsService.updateLicenseMaxUsers();
    }

    private String getLicenseKeyContent(String keyOrFilePath) {
        if (keyOrFilePath == null || keyOrFilePath.trim().isEmpty()) {
            log.error("License key is not specified");
            return null;
        }

        // Check if it's a file reference
        if (keyOrFilePath.startsWith(FILE_PREFIX)) {
            String filePath = keyOrFilePath.substring(FILE_PREFIX.length());
            try {
                Path path = Path.of(filePath);
                if (!Files.exists(path)) {
                    log.error("License file does not exist: {}", filePath);
                    return null;
                }
                log.info("Reading license from file: {}", filePath);
                return Files.readString(path);
            } catch (IOException e) {
                log.error("Failed to read license file: {}", e.getMessage());
                return null;
            }
        }

        // It's a direct license key
        return keyOrFilePath;
    }

    public void updateLicenseKey(String newKey) throws IOException {
        applicationProperties.getPremium().setKey(newKey);
        GeneralUtils.saveKeyToSettings("premium.key", newKey);
        evaluateLicense();
        synchronizeLicenseSettings();
    }

    public void resyncLicense() {
        evaluateLicense();
        synchronizeLicenseSettings();
    }

    public License getPremiumLicenseEnabledResult() {
        return premiumEnabledResult;
    }

    /**
     * The tier the installed licence key grants on its own, ignoring any Team-plan promotion.
     *
     * <p>For the seat arithmetic only: {@code premium.maxUsers} is a licence figure, so a caller
     * that reads it has to know whether a licence is what produced the tier. Feature gates want
     * {@link #getPremiumLicenseEnabledResult()}.
     */
    public License getLicenseKeyResult() {
        return licenseKeyResult;
    }

    /**
     * Throws {@link IllegalStateException} if the current license is not Pro or Enterprise. Used by
     * boot-time gates to fail fast when an operator enables a premium-only setting without a valid
     * license. {@code configuredAs} is the human-readable property path (e.g. {@code
     * "storage.provider=s3"}) and appears in the exception message.
     */
    public void requireProOrEnterprise(String configuredAs) {
        if (premiumEnabledResult != License.SERVER && premiumEnabledResult != License.ENTERPRISE) {
            throw new IllegalStateException(configuredAs + " requires a Pro or Enterprise license");
        }
    }
}
