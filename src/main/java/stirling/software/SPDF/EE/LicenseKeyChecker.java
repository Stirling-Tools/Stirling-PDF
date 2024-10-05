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

    private boolean enterpriseEnbaledResult = false;

    // Inject your license service or configuration
    @Autowired
    public LicenseKeyChecker(
            KeygenLicenseVerifier licenseService, ApplicationProperties applicationProperties) {
        this.licenseService = licenseService;
        this.applicationProperties = applicationProperties;
    }

    @Scheduled(fixedRate = 604800000, initialDelay = 1000) // 7 days in milliseconds
    public void checkLicensePeriodically() {
        checkLicense();
    }

    private void checkLicense() {
        log.info(applicationProperties.toString());
        log.info(applicationProperties.getEnterpriseEdition().toString());
        if (!applicationProperties.getEnterpriseEdition().isEnabled()) {
            enterpriseEnbaledResult = false;
        } else {
            enterpriseEnbaledResult =
                    licenseService.verifyLicense(
                            applicationProperties.getEnterpriseEdition().getKey());
        }
    }

    public void updateLicenseKey(String newKey) throws IOException {
        applicationProperties.getEnterpriseEdition().setKey(newKey);
        GeneralUtils.saveKeyToConfig("EnterpriseEdition.key", newKey, false);
        checkLicense();
    }

    public boolean getEnterpriseEnabledResult() {
        return enterpriseEnbaledResult;
    }
}
