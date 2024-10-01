package stirling.software.SPDF.EE;

import java.io.IOException;

import org.springframework.boot.CommandLineRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Component
public class LicenseKeyChecker  {

    private final KeygenLicenseVerifier licenseService;

    private final ApplicationProperties applicationProperties;

    private static boolean  enterpriseEnbaledResult = false;
    // Inject your license service or configuration
    public LicenseKeyChecker(
            KeygenLicenseVerifier licenseService, ApplicationProperties applicationProperties) {
        this.licenseService = licenseService;
        this.applicationProperties = new ApplicationProperties();
    }


    @Scheduled(fixedRate = 604800000) // 7 days in milliseconds
    public void checkLicensePeriodically() {
        checkLicense();
    }

    private void checkLicense() {
    	if(!applicationProperties.getEnterpriseEdition().isEnabled()) {
    		enterpriseEnbaledResult = false;
    	} else {
    	enterpriseEnbaledResult = licenseService.verifyLicense(applicationProperties.getEnterpriseEdition().getKey());
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
