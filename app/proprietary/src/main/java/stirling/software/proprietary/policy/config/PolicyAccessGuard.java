package stirling.software.proprietary.policy.config;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Scopes policy access to the caller's team: every user — admins included — may view, run, edit, or
 * delete only policies stamped with their own team. Whether a user may edit at all is a separate
 * check at the controller. Applies only when login is enabled; single-user deployments pass.
 */
@Component
@RequiredArgsConstructor
public class PolicyAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final PolicyManagementAuthority policyManagementAuthority;

    /** Owner for a new policy: the current user, or {@code null} when login is disabled. */
    public String ownerForNewPolicy() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    /** Team a new policy is stamped with — the creator's team. {@code null} when login disabled. */
    public Long teamForNewPolicy() {
        return enforced() ? policyManagementAuthority.currentUserTeamId() : null;
    }

    /** Whether the policy belongs to the current user's team (so they may view/run/edit it). */
    public boolean canAccess(Policy policy) {
        if (!enforced()) {
            return true;
        }
        return Objects.equals(policy.teamId(), policyManagementAuthority.currentUserTeamId());
    }

    /** The subset of {@code policies} scoped to the current user's team. */
    public List<Policy> visible(List<Policy> policies) {
        if (!enforced()) {
            return policies;
        }
        Long teamId = policyManagementAuthority.currentUserTeamId();
        return policies.stream().filter(policy -> Objects.equals(policy.teamId(), teamId)).toList();
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
