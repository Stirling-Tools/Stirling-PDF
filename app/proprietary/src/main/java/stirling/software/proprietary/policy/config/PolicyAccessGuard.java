package stirling.software.proprietary.policy.config;

import java.util.List;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Decides who may act on a stored {@link Policy}: its owner and global admins only, with no
 * separate view/edit/run capability. Enforced only when login is enabled; single-user deployments
 * pass every check. The owner is assigned server-side, never from client input.
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

    /** Whether the current user may view, edit, delete, or run the given stored policy. */
    public boolean canAccess(Policy policy) {
        if (!enforced() || userService.isCurrentUserAdmin()) {
            return true;
        }
        String current = userService.getCurrentUsername();
        return current != null && current.equals(policy.owner());
    }

    /**
     * The subset of {@code policies} the current user may see (their own; everything for an admin).
     */
    public List<Policy> visible(List<Policy> policies) {
        if (!enforced() || userService.isCurrentUserAdmin()) {
            return policies;
        }
        String current = userService.getCurrentUsername();
        if (current == null) {
            return List.of();
        }
        return policies.stream().filter(policy -> current.equals(policy.owner())).toList();
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
