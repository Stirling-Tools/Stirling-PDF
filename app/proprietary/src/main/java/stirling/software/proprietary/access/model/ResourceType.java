package stirling.software.proprietary.access.model;

/** Types of resources whose access can be gated by {@link ResourceGrant}. */
public enum ResourceType {
    // The admin portal / processor (frontend/portal). Singleton resource (empty resourceId).
    PORTAL,
    // A stored S3/MCP/API integration configuration.
    INTEGRATION_CONFIG
}
