package stirling.software.SPDF.service.pdfjson;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * No-op implementation of job ownership service when security is disabled. All jobs are globally
 * accessible without authentication.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "security.enable-login", havingValue = "false", matchIfMissing = true)
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
