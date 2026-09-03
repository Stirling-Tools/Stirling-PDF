package stirling.software.proprietary.policy.model;

/**
 * The current caller's policy-management permissions, for the portal to gate its UI. {@code
 * canManagePolicies} is the same decision the mutation endpoints enforce for org-mandated ({@code
 * required}) policies: an admin self-hosted, a team leader on SaaS, or any operator when login is
 * disabled. Ordinary pipelines are open to any team member regardless.
 */
public record PolicyPermissions(boolean canManagePolicies) {}
