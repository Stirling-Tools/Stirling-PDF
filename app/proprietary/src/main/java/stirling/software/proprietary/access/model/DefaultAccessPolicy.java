package stirling.software.proprietary.access.model;

/**
 * Fallback policy applied when no explicit {@link ResourceGrant} matches. Admins (org owners)
 * always pass regardless of this policy.
 */
public enum DefaultAccessPolicy {
    // Every authenticated user in the deployment (org) may use the resource.
    ORG_ALL,
    // Only org admins and team leaders. This is the default for the portal.
    ADMINS_AND_TEAM_LEADS,
    // Nobody but the owner, admins, and explicit grantees.
    EXPLICIT_ONLY
}
