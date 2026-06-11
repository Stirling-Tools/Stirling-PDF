package stirling.software.proprietary.policy.config;

import java.util.List;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Policies are org-wide: every user may view and run any stored policy, so reads and runs are open
 * to all. Creating, editing, and deleting is gated to admins at the controller (see {@code
 * PolicyController#requirePolicyEditingAllowed}). The owner is still recorded server-side (for run
 * / usage attribution) but no longer restricts visibility or access.
 */
@Component
@RequiredArgsConstructor
public class PolicyAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;

    /** Owner for a new policy: the current user, or {@code null} when login is disabled. */
    public String ownerForNewPolicy() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    /** All stored policies are visible to every user (org-wide). */
    public List<Policy> visible(List<Policy> policies) {
        return policies;
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
