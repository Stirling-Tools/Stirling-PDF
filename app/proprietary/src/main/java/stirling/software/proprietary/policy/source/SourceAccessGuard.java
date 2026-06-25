package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Objects;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Sources are scoped to a team exactly like policies: a user may view, edit, and delete only the
 * sources belonging to their own team (the team a source is stamped with at creation). Enforced
 * only when login is enabled; single-user deployments (login disabled) pass every check. Mirrors
 * {@link stirling.software.proprietary.policy.config.PolicyAccessGuard}.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class SourceAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final PolicyManagementAuthority policyManagementAuthority;

    /** Owner for a new source: the current user, or {@code null} when login is disabled. */
    public String ownerForNewSource() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    /** Team a new source is stamped with: the creator's team. {@code null} when login disabled. */
    public Long teamForNewSource() {
        return enforced() ? policyManagementAuthority.currentUserTeamId() : null;
    }

    /** Whether the source belongs to the current user's team (so they may view/edit it). */
    public boolean canAccess(Source source) {
        if (!enforced()) {
            return true;
        }
        return Objects.equals(source.teamId(), policyManagementAuthority.currentUserTeamId());
    }

    /**
     * The sources visible to the caller: their whole team's, loaded scoped rather than fetched
     * globally and filtered, so on SaaS it never pulls another team's sources into memory. Login
     * disabled (single-user) returns everything.
     */
    public List<Source> visibleFrom(SourceStore store) {
        if (!enforced()) {
            return store.all();
        }
        return store.findByTeam(policyManagementAuthority.currentUserTeamId());
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
