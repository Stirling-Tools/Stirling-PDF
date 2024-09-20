package stirling.software.SPDF.EE;

import org.springframework.boot.CommandLineRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import stirling.software.SPDF.model.ApplicationProperties;

@Component
public class LicenseKeyChecker implements CommandLineRunner {

    private final KeygenLicenseVerifier licenseService;

    private final ApplicationProperties applicationProperties;

    // Inject your license service or configuration
    public LicenseKeyChecker(
            KeygenLicenseVerifier licenseService, ApplicationProperties applicationProperties) {
        this.licenseService = licenseService;
        this.applicationProperties = new ApplicationProperties();
    }

    // Validate on startup
    @Override
    public void run(String... args) throws Exception {
        checkLicense();
    }

    // Periodic license check - runs every 7 days
    @Scheduled(fixedRate = 604800000) // 7 days in milliseconds
    public void checkLicensePeriodically() {
        checkLicense();
    }

    // License validation logic
    private void checkLicense() {
        boolean isValid =
                licenseService.verifyLicense(applicationProperties.getEnterpriseEdition().getKey());
        if (!isValid) {
            // Handle invalid license (shut down the app, log, etc.)
            System.out.println("License key is invalid!");
            // Optionally stop the application
            // System.exit(1); // Uncomment if you want to stop the app
        } else {
            System.out.println("License key is valid.");
        }
    }

    // Method to update the license key dynamically
    public void updateLicenseKey(String newKey) {
        // Update the key in ApplicationProperties
        applicationProperties.getEnterpriseEdition().setKey(newKey);

        // Immediately validate the new key
        System.out.println("License key has been updated. Checking new key...");
        checkLicense();
    }
}
