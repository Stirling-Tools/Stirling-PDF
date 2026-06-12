package stirling.software.SPDF.service.pdfjson;

import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.arc.properties.IfBuildProperty;
import lombok.extern.slf4j.Slf4j;

/**
 * No-op implementation of job ownership service when security is disabled. All jobs are globally
 * accessible without authentication.
 */
@Slf4j
@ApplicationScoped
// TODO: Migration required - Spring's @ConditionalOnProperty(matchIfMissing=true) is a runtime
// condition; Quarkus @IfBuildProperty is evaluated at build time. enableIfMissing=true preserves
// the matchIfMissing default. If security.enable-login must be toggled at runtime, switch to
// @io.quarkus.arc.lookup.LookupIfProperty with Instance<JobOwnershipService> injection at use sites.
@IfBuildProperty(name = "security.enable-login", stringValue = "false", enableIfMissing = true)
public class NoOpJobOwnershipService
        implements stirling.software.common.service.JobOwnershipService {

    @Override
    public Optional<String> getCurrentUserId() {
        // No authentication when security is disabled
        return Optional.empty();
    }

    @Override
    public String createScopedJobKey(String jobId) {
        // Jobs are not scoped to users when security is disabled
        return jobId;
    }

    @Override
    public boolean validateJobAccess(String scopedJobKey) {
        // All jobs are accessible when security is disabled
        log.trace("Security disabled, allowing access to job: {}", scopedJobKey);
        return true;
    }

    @Override
    public String extractJobId(String scopedJobKey) {
        // No user prefix when security is disabled
        return scopedJobKey;
    }
}
