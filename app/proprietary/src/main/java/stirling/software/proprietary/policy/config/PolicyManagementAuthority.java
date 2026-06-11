package stirling.software.proprietary.policy.config;

/**
 * The elevated role that may manage <em>any</em> stored policy (view, edit, delete, run), beyond a
 * user's own. Pluggable per deployment so the policy layer (proprietary) needn't know the team
 * model: self-hosted treats a global admin as elevated; SaaS treats the leader of the user's team
 * as elevated (a SaaS deployment has only a single global admin, so admin is the wrong gate there).
 */
public interface PolicyManagementAuthority {

    /** Whether the current user holds the elevated, manage-all-policies role. */
    boolean canManageAllPolicies();
}
