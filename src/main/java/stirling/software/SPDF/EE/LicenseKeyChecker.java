package stirling.software.SPDF.EE;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Component
@Slf4j
public class LicenseKeyChecker {

    private final KeygenLicenseVerifier licenseService;

    private final ApplicationProperties applicationProperties;

    private boolean enterpriseEnabledResult = false;

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
        if (!applicationProperties.getEnterpriseEdition().isEnabled()) {
            enterpriseEnabledResult = false;
        } else {
            enterpriseEnabledResult =
                    licenseService.verifyLicense(
                            applicationProperties.getEnterpriseEdition().getKey());
            if (enterpriseEnabledResult) {
                log.info("License key is valid.");
            } else {
                log.info("License key is invalid.");
            }
        }
    }

    public void updateLicenseKey(String newKey) throws IOException {
        applicationProperties.getEnterpriseEdition().setKey(newKey);
        GeneralUtils.saveKeyToConfig("EnterpriseEdition.key", newKey, false);
        checkLicense();
    }

    public boolean getEnterpriseEnabledResult() {
        return enterpriseEnabledResult;
    }
}
