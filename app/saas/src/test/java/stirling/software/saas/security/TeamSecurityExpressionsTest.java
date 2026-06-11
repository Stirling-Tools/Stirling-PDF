package stirling.software.saas.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * {@link TeamSecurityExpressions#isCurrentUserTeamLeader()} — used to gate policy editing on SaaS.
 */
@ExtendWith(MockitoExtension.class)
class TeamSecurityExpressionsTest {

    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private UserService userService;

    private static final long TEAM_ID = 2L;
    private static final long USER_ID = 1L;

    private TeamSecurityExpressions expressions() {
        return new TeamSecurityExpressions(membershipRepository, userService);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAsUserWithTeam(boolean hasTeam) {
        User user = new User();
        user.setId(USER_ID);
        if (hasTeam) {
            Team team = new Team();
            team.setId(TEAM_ID);
            user.setTeam(team);
        }
        // API-key auth path: the principal is the User entity itself.
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    private TeamMembership membershipWithRole(TeamRole role) {
        TeamMembership membership = new TeamMembership();
        membership.setRole(role);
        return membership;
    }

    @Test
    void leaderOfOwnTeamIsLeader() {
        authenticateAsUserWithTeam(true);
        when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                .thenReturn(Optional.of(membershipWithRole(TeamRole.LEADER)));
        assertTrue(expressions().isCurrentUserTeamLeader());
    }

    @Test
    void regularMemberIsNotLeader() {
        authenticateAsUserWithTeam(true);
        when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                .thenReturn(Optional.of(membershipWithRole(TeamRole.MEMBER)));
        assertFalse(expressions().isCurrentUserTeamLeader());
    }

    @Test
    void noMembershipIsNotLeader() {
        authenticateAsUserWithTeam(true);
        when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                .thenReturn(Optional.empty());
        assertFalse(expressions().isCurrentUserTeamLeader());
    }

    @Test
    void userWithoutTeamIsNotLeader() {
        authenticateAsUserWithTeam(false);
        assertFalse(expressions().isCurrentUserTeamLeader());
    }

    @Test
    void currentUserTeamIdReturnsTheUsersTeam() {
        authenticateAsUserWithTeam(true);
        assertEquals(TEAM_ID, expressions().currentUserTeamId());
    }

    @Test
    void currentUserTeamIdIsNullWithoutTeam() {
        authenticateAsUserWithTeam(false);
        assertNull(expressions().currentUserTeamId());
    }

    @Test
    void unauthenticatedIsNotLeader() {
        // No authentication set on the context.
        lenient()
                .when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                .thenReturn(Optional.of(membershipWithRole(TeamRole.LEADER)));
        assertFalse(expressions().isCurrentUserTeamLeader());
    }
}
