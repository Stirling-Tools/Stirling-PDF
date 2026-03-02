package stirling.software.proprietary.audit;

import lombok.Getter;

/** Defines the different levels of audit logging available in the application. */
@Getter
public enum AuditLevel {
    /**
     * OFF - No audit logging (level 0) Disables all audit logging except for critical security
     * events
     */
    OFF(0),

    /**
     * BASIC - File modifications only (level 1) Tracks: PDF file operations like compress, split,
     * merge, etc., and settings changes. Captures: Operation status (success/failure), method
     * parameters, timing. Ideal for: Compliance tracking of file modifications with minimal log
     * volume.
     */
    BASIC(1),

    /**
     * STANDARD - File operations and user actions (level 2) Tracks: Everything in BASIC plus user
     * actions like login/logout, account changes, and general GET requests. Excludes continuous
     * polling calls (/auth/me, /app-config, /admin/license-info, /endpoints-availability, /health,
     * /metrics). Ideal for: General audit trail with reasonable log volume for most deployments.
     */
    STANDARD(2),

    /**
     * VERBOSE - Everything including polling (level 3) Tracks: Everything in STANDARD plus
     * continuous polling calls and all GET requests. Captures: Detailed timing information. Note:
     * Operation results (return values) are controlled by separate captureOperationResults flag.
     * Warning: High log volume and performance impact.
     */
    VERBOSE(3);

    private final int level;

    AuditLevel(int level) {
        this.level = level;
    }

    /**
     * Checks if this audit level includes the specified level
     *
     * @param otherLevel The level to check against
     * @return true if this level is equal to or greater than the specified level
     */
    public boolean includes(AuditLevel otherLevel) {
        return this.level >= otherLevel.level;
    }

    /**
     * Get an AuditLevel from an integer value
     *
     * @param level The integer level (0-3)
     * @return The corresponding AuditLevel
     */
    public static AuditLevel fromInt(int level) {
        // Ensure level is within valid bounds
        int boundedLevel = Math.min(Math.max(level, 0), 3);

        for (AuditLevel auditLevel : values()) {
            if (auditLevel.level == boundedLevel) {
                return auditLevel;
            }
        }

        // Default to STANDARD if somehow we didn't match
        return STANDARD;
    }
}
