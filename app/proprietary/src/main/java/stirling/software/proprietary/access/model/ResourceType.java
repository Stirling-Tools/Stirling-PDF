package stirling.software.proprietary.access.model;

/** Types of resources whose access can be gated by {@link ResourceGrant}. */
public enum ResourceType {
    // The processor (frontend/editor/src/processor). Singleton resource (empty resourceId).
    // Kept as PORTAL: this is persisted in resource_grants.resource_type, so renaming it
    // would orphan every existing grant.
    PORTAL,
    // A stored S3/MCP/API integration configuration.
    INTEGRATION_CONFIG
}
