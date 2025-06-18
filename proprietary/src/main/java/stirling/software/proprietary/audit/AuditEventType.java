package stirling.software.proprietary.audit;

/** Standardized audit event types for the application. */
public enum AuditEventType {
    // Authentication events - BASIC level
    USER_LOGIN("User login"),
    USER_LOGOUT("User logout"),
    USER_FAILED_LOGIN("Failed login attempt"),

    // User/admin events - BASIC level
    USER_PROFILE_UPDATE("User or profile operation"),

    // System configuration events - STANDARD level
    SETTINGS_CHANGED("System or admin settings operation"),

    // File operations - STANDARD level
    FILE_OPERATION("File operation"),

    // PDF operations - STANDARD level
    PDF_PROCESS("PDF processing operation"),

    // HTTP requests - STANDARD level
    HTTP_REQUEST("HTTP request");

    private final String description;

    AuditEventType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    /**
     * Get the enum value from a string representation. Useful for backward compatibility with
     * string-based event types.
     *
     * @param type The string representation of the event type
     * @return The corresponding enum value or null if not found
     */
    public static AuditEventType fromString(String type) {
        if (type == null) {
            return null;
        }

        try {
            return AuditEventType.valueOf(type);
        } catch (IllegalArgumentException e) {
            // If the exact enum name doesn't match, try finding a similar one
            for (AuditEventType eventType : values()) {
                if (eventType.name().equalsIgnoreCase(type)
                        || eventType.getDescription().equalsIgnoreCase(type)) {
                    return eventType;
                }
            }
            return null;
        }
    }
}
