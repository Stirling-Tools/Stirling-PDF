package stirling.software.proprietary.policy.output;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Outputs are scoped to a team exactly like sources and policies: a user may view, edit, and delete
 * only the outputs belonging to their own team (the team an output is stamped with at creation).
 * Enforced only when login is enabled; single-user deployments (login disabled) pass every check.
 * Mirrors {@link stirling.software.proprietary.policy.source.SourceAccessGuard}.
 */
@Component
@RequiredArgsConstructor
public class OutputAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final PolicyManagementAuthority policyManagementAuthority;

    /** Owner for a new output: the current user, or {@code null} when login is disabled. */
    public String ownerForNewOutput() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    /** Team a new output is stamped with: the creator's team. {@code null} when login disabled. */
    public Long teamForNewOutput() {
        return currentTeamId();
    }

    /**
     * The current user's team (what scopes their outputs), or {@code null} when login is disabled.
     */
    public Long currentTeamId() {
        return enforced() ? policyManagementAuthority.currentUserTeamId() : null;
    }

    /** Whether the output belongs to the current user's team (so they may view/edit it). */
    public boolean canAccess(Output output) {
        if (!enforced()) {
            return true;
        }
        return Objects.equals(output.teamId(), policyManagementAuthority.currentUserTeamId());
    }

    /**
     * The outputs visible to the caller: their whole team's, loaded scoped rather than fetched
     * globally and filtered, so on SaaS it never pulls another team's outputs into memory. Login
     * disabled (single-user) returns everything.
     */
    public List<Output> visibleFrom(OutputStore store) {
        if (!enforced()) {
            return store.all();
        }
        return store.findByTeam(policyManagementAuthority.currentUserTeamId());
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
