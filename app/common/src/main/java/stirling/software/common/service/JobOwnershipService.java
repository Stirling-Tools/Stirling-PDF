package stirling.software.common.service;

import java.util.Optional;

/**
 * Service interface for managing job ownership and access control. Implementations can provide
 * user-scoped job isolation when security is enabled, or no-op behavior when security is disabled.
 */
public interface JobOwnershipService {

    /**
     * Get the current authenticated user's identifier.
     *
     * @return Optional containing user identifier, or empty if not authenticated
     */
    Optional<String> getCurrentUserId();

    /**
     * Create a scoped job key that includes user ownership when security is enabled.
     *
     * @param jobId the base job identifier
     * @return scoped job key in format "userId:jobId", or just jobId if no user authenticated
     */
    String createScopedJobKey(String jobId);

    /**
     * Validate that the current user has access to the given job.
     *
     * @param scopedJobKey the scoped job key to validate
     * @return true if current user owns the job or no authentication is required
     * @throws SecurityException if current user does not own the job
     */
    boolean validateJobAccess(String scopedJobKey);

    /**
     * Extract the base job ID from a scoped job key.
     *
     * @param scopedJobKey the scoped job key
     * @return the base job ID without user prefix
     */
    String extractJobId(String scopedJobKey);
}
