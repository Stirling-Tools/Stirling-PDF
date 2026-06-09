package stirling.software.proprietary.policy.config;

import java.util.List;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Decides who may see and act on a stored {@link Policy}. A policy is owned by the user who created
 * it; only that owner and global administrators may view, edit, delete, or run it. There is no
 * separate edit-vs-run capability: access is all-or-nothing.
 *
 * <p>Ownership is only enforced when login is enabled. On a single-user deployment (login disabled,
 * e.g. desktop) there is one local operator who owns everything, so every check passes and new
 * policies are stored without an owner.
 *
 * <p>The owner is always assigned server-side from the authenticated principal via {@link
 * #ownerForNewPolicy()}; it is never taken from client input, which would let a caller forge
 * ownership.
 */
@Component
@RequiredArgsConstructor
public class PolicyAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;

    /**
     * The owner to stamp on a newly created policy, or {@code null} when ownership is not enforced.
     */
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
