package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
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
 * Tests for {@link PolicyAccessGuard}. Policies are org-wide: every user sees them all (no
 * owner-based filtering). The owner is still assigned server-side — the current user when login is
 * enabled, {@code null} otherwise — purely for run/usage attribution.
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
    void visibleReturnsEveryPolicyWhenLoginEnabled() {
        // Org-wide: a non-admin sees every policy, not just the ones they own.
        List<Policy> all = List.of(ownedBy("alice"), ownedBy("bob"), ownedBy("alice"));
        assertEquals(all, guard(true).visible(all));
    }

    @Test
    void visibleReturnsEveryPolicyWhenLoginDisabled() {
        List<Policy> all = List.of(ownedBy("alice"), ownedBy("bob"));
        assertEquals(all, guard(false).visible(all));
    }

    @Test
    void ownerForNewPolicyIsTheCurrentUserWhenLoginEnabled() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        assertEquals("alice", guard(true).ownerForNewPolicy());
    }

    @Test
    void ownerForNewPolicyIsNullWhenLoginDisabled() {
        // Single-user deployment: no identity to attribute to.
        assertNull(guard(false).ownerForNewPolicy());
    }

    private static Policy ownedBy(String owner) {
        return new Policy("p1", "p", owner, true, null, List.of(), List.of(), OutputSpec.inline());
    }
}
