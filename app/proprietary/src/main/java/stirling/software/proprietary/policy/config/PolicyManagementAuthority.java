package stirling.software.proprietary.policy.config;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
     * The team that scopes the current user's policies — the team a new policy is stamped with and
     * the only team whose policies the user may see/run/edit. {@code null} when it can't be
     * resolved (e.g. login disabled / no team), in which case access falls back to the unteamed
     * ({@code null}-team) policies.
     */
    Long currentUserTeamId();

    /**
     * Scoping team for an enforced (login-enabled) request, never null — rejects the rare-but-
     * possible unteamed caller instead of letting them share the unteamed bucket.
     */
    default Long requireCurrentUserTeamId() {
        Long teamId = currentUserTeamId();
        if (teamId == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Could not resolve the current user's team");
        }
        return teamId;
    }
}
