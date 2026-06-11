package stirling.software.saas.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** SaaS: the manage-all-policies role is the team leader (not a global admin). */
@ExtendWith(MockitoExtension.class)
class TeamLeaderPolicyManagementAuthorityTest {

    @Mock private TeamSecurityExpressions teamSecurity;

    @Test
    void teamLeaderMayManageAllPolicies() {
        when(teamSecurity.isCurrentUserTeamLeader()).thenReturn(true);
        assertTrue(new TeamLeaderPolicyManagementAuthority(teamSecurity).canManageAllPolicies());
    }

    @Test
    void nonLeaderMayNot() {
        when(teamSecurity.isCurrentUserTeamLeader()).thenReturn(false);
        assertFalse(new TeamLeaderPolicyManagementAuthority(teamSecurity).canManageAllPolicies());
    }
}
