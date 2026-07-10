package stirling.software.proprietary.security.model;

/**
 * Who a {@link ApiKey} belongs to and who may see/manage it in the portal. The key itself is always
 * a bearer credential that authenticates as its owner; the scope governs portal visibility and
 * management, never a change of the acting principal.
 *
 * <ul>
 *   <li>{@code PERSONAL} - owned by one user, only that user sees or manages it; {@code teamId} is
 *       null. Every key that predates this feature is treated as PERSONAL so it can never leak to a
 *       team.
 *   <li>{@code TEAM_LEAD} - a team key visible to and managed by the team's leaders only.
 *   <li>{@code TEAM_MEMBERS} - a team key visible to every member of the team; still created and
 *       revoked by a leader.
 * </ul>
 */
public enum ApiKeyScope {
    PERSONAL,
    TEAM_LEAD,
    TEAM_MEMBERS;

    public boolean isTeamScoped() {
        return this == TEAM_LEAD || this == TEAM_MEMBERS;
    }
}
