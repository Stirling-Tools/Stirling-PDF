package stirling.software.proprietary.security.configuration.ee;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.LicenseServiceInterface;

/** Keeps the configured database available for recovery without granting unlicensed processing. */
@Component
@RequiredArgsConstructor
public class DatabaseLicenseGuard {
    private final ApplicationProperties properties;
    private final LicenseServiceInterface licenseService;
    private final Environment environment;

    /** Setup and licence recovery remain available while this is true. */
    public boolean requiresActivation() {
        return !environment.matchesProfiles("saas")
                && properties.getSystem().getDatasource() != null
                && properties.getSystem().getDatasource().isEnableCustomDatabase()
                && !licenseService.isRunningProOrHigher();
    }
}
