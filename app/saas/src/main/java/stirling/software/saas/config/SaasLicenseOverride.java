package stirling.software.saas.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import stirling.software.common.service.LicenseServiceInterface;

/**
 * SaaS infrastructure is licensed; tenant purchases are enforced by the billing entitlement gate.
 */
@Configuration
@Profile("saas")
@Primary
public class SaasLicenseOverride implements LicenseServiceInterface {

    @Override
    public boolean isRunningProOrHigher() {
        return true;
    }

    @Override
    public boolean hasServerLicense() {
        return false;
    }

    @Override
    public boolean isRunningEE() {
        return true;
    }

    @Override
    public String getLicenseTypeName() {
        return "ENTERPRISE";
    }

    @Bean(name = "runningProOrHigher")
    public boolean runningProOrHigherSaas() {
        return true;
    }

    @Bean(name = "license")
    public String licenseTypeSaas() {
        return "ENTERPRISE";
    }

    @Bean(name = "runningEE")
    public boolean runningEnterpriseSaas() {
        return true;
    }
}
