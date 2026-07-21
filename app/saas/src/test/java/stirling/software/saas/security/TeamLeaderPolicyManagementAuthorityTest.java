package stirling.software.saas.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** SaaS policy context: team leader may edit; scoping uses the user's team. */
@ExtendWith(MockitoExtension.class)
class TeamLeaderPolicyManagementAuthorityTest {

    @Mock private TeamSecurityExpressions teamSecurity;

    private TeamLeaderPolicyManagementAuthority authority() {
        return new TeamLeaderPolicyManagementAuthority(teamSecurity);
    }

    @Test
    void teamLeaderMayEditPolicies() {
        when(teamSecurity.isCurrentUserTeamLeader()).thenReturn(true);
        assertTrue(authority().canEditPolicies());
    }

    @Test
    void nonLeaderMayNot() {
        when(teamSecurity.isCurrentUserTeamLeader()).thenReturn(false);
        assertFalse(authority().canEditPolicies());
    }

    @Test
    void currentUserTeamIdDelegatesToTeamSecurity() {
        when(teamSecurity.currentUserTeamId()).thenReturn(9L);
        assertEquals(9L, authority().currentUserTeamId());
    }
}
