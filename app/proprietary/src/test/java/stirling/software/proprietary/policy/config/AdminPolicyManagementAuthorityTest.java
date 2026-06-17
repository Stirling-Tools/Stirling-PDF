package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/** Self-hosted policy context: a global admin may edit; scoping uses the current user's team. */
@ExtendWith(MockitoExtension.class)
class AdminPolicyManagementAuthorityTest {

    @Mock private UserService userService;

    private AdminPolicyManagementAuthority authority() {
        return new AdminPolicyManagementAuthority(userService);
    }

    @Test
    void adminMayEditPolicies() {
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        assertTrue(authority().canEditPolicies());
    }

    @Test
    void nonAdminMayNot() {
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        assertFalse(authority().canEditPolicies());
    }

    @Test
    void currentUserTeamIdResolvesFromTheCurrentUsersTeam() {
        Team team = new Team();
        team.setId(42L);
        User user = new User();
        user.setTeam(team);
        when(userService.getCurrentUsername()).thenReturn("alice");
        when(userService.findByUsername("alice")).thenReturn(Optional.of(user));
        assertEquals(42L, authority().currentUserTeamId());
    }

    @Test
    void currentUserTeamIdIsNullWhenNoCurrentUser() {
        when(userService.getCurrentUsername()).thenReturn(null);
        assertNull(authority().currentUserTeamId());
    }
}
