package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Tests for {@link PolicyAccessGuard}: owner-or-admin access, no-op when login is disabled, and
 * server-side owner assignment.
 */
@ExtendWith(MockitoExtension.class)
class PolicyAccessGuardTest {

    @Mock private UserServiceInterface userService;

    private PolicyAccessGuard guard(boolean loginEnabled) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(loginEnabled);
        return new PolicyAccessGuard(userService, properties);
    }

    @Test
    void loginDisabledAllowsEverythingAndAssignsNoOwner() {
        PolicyAccessGuard guard = guard(false);
        List<Policy> all = List.of(ownedBy("alice"), ownedBy("bob"));

        assertTrue(guard.canAccess(ownedBy("someone-else")));
        assertNull(guard.ownerForNewPolicy());
        assertEquals(all, guard.visible(all));
    }

    @Test
    void adminCanAccessAnyPolicy() {
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        assertTrue(guard(true).canAccess(ownedBy("alice")));
    }

    @Test
    void ownerCanAccessTheirOwnPolicy() {
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(userService.getCurrentUsername()).thenReturn("alice");
        assertTrue(guard(true).canAccess(ownedBy("alice")));
    }

    @Test
    void nonOwnerNonAdminCannotAccess() {
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(userService.getCurrentUsername()).thenReturn("bob");
        assertFalse(guard(true).canAccess(ownedBy("alice")));
    }

    @Test
    void visibleFiltersToOwnedPoliciesForANonAdmin() {
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        when(userService.getCurrentUsername()).thenReturn("alice");

        List<Policy> visible =
                guard(true).visible(List.of(ownedBy("alice"), ownedBy("bob"), ownedBy("alice")));

        assertEquals(2, visible.size());
        assertTrue(visible.stream().allMatch(policy -> "alice".equals(policy.owner())));
    }

    @Test
    void ownerForNewPolicyIsTheCurrentUserWhenEnforced() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        assertEquals("alice", guard(true).ownerForNewPolicy());
    }

    private static Policy ownedBy(String owner) {
        return new Policy("p1", "p", owner, true, null, List.of(), List.of(), OutputSpec.inline());
    }
}
