package stirling.software.proprietary.audit;

/** Defines the different levels of audit logging available in the application. */
public enum AuditLevel {
    /**
     * OFF - No audit logging (level 0) Disables all audit logging except for critical security
     * events
     */
    OFF(0),

    /**
     * BASIC - Minimal audit logging (level 1) Includes: - Authentication events (login, logout,
     * failed logins) - Password changes - User/role changes - System configuration changes
     */
    BASIC(1),

    /**
     * STANDARD - Standard audit logging (level 2) Includes everything in BASIC plus: - All HTTP
     * requests (basic info: URL, method, status) - File operations (upload, download, process) -
     * PDF operations (view, edit, etc.) - User operations
     */
    STANDARD(2),

    /**
     * VERBOSE - Detailed audit logging (level 3) Includes everything in STANDARD plus: - Request
     * headers and parameters - Method parameters - Operation results - Detailed timing information
     */
    VERBOSE(3);

    private final int level;

    AuditLevel(int level) {
        this.level = level;
    }

    public int getLevel() {
        return level;
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
