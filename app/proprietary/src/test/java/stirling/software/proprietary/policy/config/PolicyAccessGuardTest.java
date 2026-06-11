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
 * {@link PolicyAccessGuard}: policies are scoped to the caller's team. A user sees/accesses only
 * their own team's policies (admins included — there is no cross-team escape). Login disabled
 * (single-user) bypasses scoping.
 */
@ExtendWith(MockitoExtension.class)
class PolicyAccessGuardTest {

    @Mock private UserServiceInterface userService;
    @Mock private PolicyManagementAuthority policyManagementAuthority;

    private PolicyAccessGuard guard(boolean loginEnabled) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(loginEnabled);
        return new PolicyAccessGuard(userService, properties, policyManagementAuthority);
    }

    @Test
    void visibleFiltersToTheCallersTeam() {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(1L);
        List<Policy> all = List.of(inTeam(1L), inTeam(2L), inTeam(1L), inTeam(null));
        List<Policy> visible = guard(true).visible(all);
        assertEquals(2, visible.size());
        assertTrue(visible.stream().allMatch(p -> Long.valueOf(1L).equals(p.teamId())));
    }

    @Test
    void visibleReturnsEverythingWhenLoginDisabled() {
        List<Policy> all = List.of(inTeam(1L), inTeam(2L));
        assertEquals(all, guard(false).visible(all));
    }

    @Test
    void canAccessOnlyOwnTeamsPolicy() {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(1L);
        assertTrue(guard(true).canAccess(inTeam(1L)));
        assertFalse(guard(true).canAccess(inTeam(2L)));
        assertFalse(guard(true).canAccess(inTeam(null)));
    }

    @Test
    void canAccessAnythingWhenLoginDisabled() {
        assertTrue(guard(false).canAccess(inTeam(2L)));
    }

    @Test
    void ownerAndTeamForNewPolicyComeFromTheCurrentUserWhenLoginEnabled() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(7L);
        assertEquals("alice", guard(true).ownerForNewPolicy());
        assertEquals(7L, guard(true).teamForNewPolicy());
    }

    @Test
    void ownerAndTeamForNewPolicyAreNullWhenLoginDisabled() {
        assertNull(guard(false).ownerForNewPolicy());
        assertNull(guard(false).teamForNewPolicy());
    }

    private static Policy inTeam(Long teamId) {
        return new Policy(
                "p1", "p", "owner", true, null, List.of(), List.of(), OutputSpec.inline(), teamId);
    }
}
