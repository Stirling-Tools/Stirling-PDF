package stirling.software.proprietary.policy.model;

/**
 * The current caller's policy-management permissions, for the portal to gate its UI. {@code
 * canManagePolicies} is the same decision the mutation endpoints enforce: a manager, or any
 * operator when login is disabled. Other team members may view but not change pipelines or
 * policies.
 */
public record PolicyPermissions(boolean canManagePolicies) {}
