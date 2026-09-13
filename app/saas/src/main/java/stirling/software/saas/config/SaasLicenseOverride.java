package stirling.software.saas.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Saas mode is unconditionally ENTERPRISE (every tenant is a paying Stripe customer). */
@Configuration
@Profile("saas")
public class SaasLicenseOverride {

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

    /**
     * Needed even though nothing reads it here: {@code DatabaseConfig} takes it in its constructor
     * and carries no profile of its own, so the class is built under saas even though its {@code
     * dataSource()} bean is not. Saas does run on an external database, so true is also the honest
     * answer.
     */
    @Bean(name = "customDatabaseAllowed")
    public boolean customDatabaseAllowedSaas() {
        return true;
    }
}
