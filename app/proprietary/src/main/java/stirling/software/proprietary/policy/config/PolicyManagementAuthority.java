package stirling.software.proprietary.policy.config;

/**
 * The current user's policy context, pluggable per deployment so the policy layer (proprietary)
 * needn't know the team model. SaaS: a user may edit policies only if they lead their team, and
 * every user is scoped to their own team. Self-hosted: a global admin may edit, scoped to their
 * (typically single) team. Policies are isolated per team — nobody, admins included, sees or edits
 * another team's policies.
 */
public interface PolicyManagementAuthority {

    /** Whether the current user may create, edit, or delete policies (for their own team). */
    boolean canEditPolicies();

    /**
     * Whether the current user may run a policy against its <em>configured sources</em> (the manual
     * "run now" sweep). Kept separate from {@link #canEditPolicies()} because the two are distinct
     * capabilities, even where a deployment grants both to the same people: a sweep operates on the
     * team's configured sources using the server's stored connection credentials, which makes it a
     * policy-management capability rather than ordinary use. Running a policy over the caller's
     * <em>own</em> uploaded files is not covered by this and stays open to every team member — that
     * is ordinary editor enforcement.
     */
    boolean canTriggerPolicies();

    /**
     * The team that scopes the current user's policies — the team a new policy is stamped with and
     * the only team whose policies the user may see/run/edit. {@code null} when it can't be
     * resolved (e.g. login disabled / no team), in which case access falls back to the unteamed
     * ({@code null}-team) policies.
     */
    Long currentUserTeamId();
}
