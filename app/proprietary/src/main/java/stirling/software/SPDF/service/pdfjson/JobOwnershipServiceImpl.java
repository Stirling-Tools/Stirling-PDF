package stirling.software.SPDF.service.pdfjson;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.UserServiceInterface;

/**
 * Service to manage job ownership and access control for PDF JSON operations. When security is
 * enabled, jobs are scoped to authenticated users. When security is disabled, jobs are globally
 * accessible.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "security.enable-login", havingValue = "true", matchIfMissing = false)
public class JobOwnershipServiceImpl
        implements stirling.software.common.service.JobOwnershipService {

    @Autowired(required = false)
    private UserServiceInterface userService;

    /**
     * Get the current authenticated user's identifier. Returns empty if no user is authenticated.
     *
     * @return Optional containing user identifier, or empty if not authenticated
     */
    public Optional<String> getCurrentUserId() {
        if (userService == null) {
            log.debug("UserService not available");
            return Optional.empty();
        }

        try {
            String username = userService.getCurrentUsername();
            if (username != null && !username.isEmpty() && !"anonymousUser".equals(username)) {
                log.debug("Current authenticated user: {}", username);
                return Optional.of(username);
            }
        } catch (Exception e) {
            log.warn("Failed to get current username from UserService: {}", e.getMessage());
        }
        return Optional.empty();
    }

    /**
     * Create a scoped job key that includes user ownership when security is enabled.
     *
     * @param jobId the base job identifier
     * @return scoped job key in format "userId:jobId", or just jobId if no user authenticated
     */
    public String createScopedJobKey(String jobId) {
        Optional<String> userId = getCurrentUserId();
        if (userId.isPresent()) {
            String scopedKey = userId.get() + ":" + jobId;
            log.debug("Created scoped job key: {}", scopedKey);
            return scopedKey;
        }
        log.debug("No user authenticated, using unsecured job key: {}", jobId);
        return jobId;
    }

    /**
     * Validate that the current user has access to the given job.
     *
     * @param scopedJobKey the scoped job key to validate
     * @return true if current user owns the job or no authentication is required
     * @throws SecurityException if current user does not own the job
     */
    public boolean validateJobAccess(String scopedJobKey) {
        Optional<String> userId = getCurrentUserId();

        // If no user authenticated, allow access (backwards compatibility)
        if (userId.isEmpty()) {
            log.debug("No authentication required, allowing access to job: {}", scopedJobKey);
            return true;
        }

        // Check if job key starts with current user's ID
        String userPrefix = userId.get() + ":";
        if (!scopedJobKey.startsWith(userPrefix)) {
            log.warn(
                    "Access denied: User {} attempted to access job key {} which they don't own",
                    userId.get(),
                    scopedJobKey);
            throw new SecurityException(
                    "Access denied: You do not have permission to access this job");
        }

        log.debug("Access granted: User {} owns job {}", userId.get(), scopedJobKey);
        return true;
    }

    /**
     * Extract the base job ID from a scoped job key.
     *
     * @param scopedJobKey the scoped job key
     * @return the base job ID without user prefix
     */
    public String extractJobId(String scopedJobKey) {
        int colonIndex = scopedJobKey.indexOf(':');
        if (colonIndex > 0) {
            return scopedJobKey.substring(colonIndex + 1);
        }
        return scopedJobKey;
    }
}
