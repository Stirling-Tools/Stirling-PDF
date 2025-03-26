package stirling.software.SPDF.EE;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Component
@Slf4j
public class LicenseKeyChecker {

    private static final String FILE_PREFIX = "file:";

    private final KeygenLicenseVerifier licenseService;

    private final ApplicationProperties applicationProperties;

    private boolean premiumEnabledResult = false;

    @Autowired
    public LicenseKeyChecker(
            KeygenLicenseVerifier licenseService, ApplicationProperties applicationProperties) {
        this.licenseService = licenseService;
        this.applicationProperties = applicationProperties;
        this.checkLicense();
    }

    @Scheduled(initialDelay = 604800000, fixedRate = 604800000) // 7 days in milliseconds
    public void checkLicensePeriodically() {
        checkLicense();
    }

    private void checkLicense() {
        if (!applicationProperties.getPremium().isEnabled()) {
            premiumEnabledResult = false;
        } else {
            String licenseKey = getLicenseKeyContent(applicationProperties.getPremium().getKey());
            if (licenseKey != null) {
                premiumEnabledResult = licenseService.verifyLicense(licenseKey);
                if (premiumEnabledResult) {
                    log.info("License key is valid.");
                } else {
                    log.info("License key is invalid.");
                }
            } else {
                log.error("Failed to obtain license key content.");
                premiumEnabledResult = false;
            }
        }
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
                Path path = Paths.get(filePath);
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
        GeneralUtils.saveKeyToSettings("EnterpriseEdition.key", newKey);
        checkLicense();
    }

    public boolean getEnterpriseEnabledResult() {
        return premiumEnabledResult;
    }
}
