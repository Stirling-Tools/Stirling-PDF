package stirling.software.saas.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;
import jakarta.inject.Singleton;

import io.quarkus.arc.profile.IfBuildProfile;

/** Saas mode is unconditionally ENTERPRISE (every tenant is a paying Stripe customer). */
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasLicenseOverride {

    @Produces
    @Singleton
    @Named("runningProOrHigher")
    public boolean runningProOrHigherSaas() {
        return true;
    }

    @Produces
    @Singleton
    @Named("license")
    public String licenseTypeSaas() {
        return "ENTERPRISE";
    }

    @Produces
    @Singleton
    @Named("runningEE")
    public boolean runningEnterpriseSaas() {
        return true;
    }
}
