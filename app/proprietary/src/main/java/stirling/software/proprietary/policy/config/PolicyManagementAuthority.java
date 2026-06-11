package stirling.software.proprietary.policy.config;

/**
 * The current user's policy authority, pluggable per deployment so the policy layer needn't know
 * the team model. Resolves who may edit policies (SaaS: a team leader; self-hosted: a global admin)
 * and which team scopes them.
 */
public interface PolicyManagementAuthority {

    /** Whether the current user may create, edit, or delete policies. */
    boolean canEditPolicies();

    /**
     * The team that scopes the current user's policies: a new policy is stamped with it, and it is
     * the only team whose policies the user may see, run, or edit. {@code null} when unresolved (no
     * authenticated user or no team).
     */
    Long currentUserTeamId();
}
