package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Additional branch coverage for {@link TeamSecurityExpressions}: the JWT resolution path, the
 * username-string fallback, isTeamLeader / isTeamMember, and currentUserTeamId via JWT auth.
 */
@ExtendWith(MockitoExtension.class)
class TeamSecurityExpressionsMoreTest {

    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private UserService userService;

    private static final long TEAM_ID = 42L;
    private static final long USER_ID = 7L;

    private TeamSecurityExpressions expressions() {
        return new TeamSecurityExpressions(membershipRepository, userService);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private User userWithTeam(long userId, Long teamId) {
        User user = new User();
        user.setId(userId);
        if (teamId != null) {
            Team team = new Team();
            team.setId(teamId);
            user.setTeam(team);
        }
        return user;
    }

    private TeamMembership membershipWithRole(TeamRole role) {
        TeamMembership membership = new TeamMembership();
        membership.setRole(role);
        return membership;
    }

    /** Authenticate via the JWT path with the given supabase subject. */
    private void authenticateAsJwt(UUID supabaseId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", supabaseId.toString());
        Jwt jwt =
                new Jwt(
                        "tok",
                        Instant.now(),
                        Instant.now().plusSeconds(60),
                        Map.of("alg", "HS256"),
                        claims);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new EnhancedJwtAuthenticationToken(
                                jwt,
                                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                                "user@example.com",
                                supabaseId.toString()));
    }

    @Nested
    @DisplayName("isTeamLeader(teamId)")
    class IsTeamLeader {

        @Test
        @DisplayName("unauthenticated context returns false")
        void unauthenticatedIsFalse() {
            assertThat(expressions().isTeamLeader(TEAM_ID)).isFalse();
        }

        @Test
        @DisplayName("leader membership returns true")
        void leaderReturnsTrue() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    userWithTeam(USER_ID, TEAM_ID), null, List.of()));
            when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                    .thenReturn(Optional.of(membershipWithRole(TeamRole.LEADER)));

            assertThat(expressions().isTeamLeader(TEAM_ID)).isTrue();
        }

        @Test
        @DisplayName("member (non-leader) membership returns false")
        void memberReturnsFalse() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    userWithTeam(USER_ID, TEAM_ID), null, List.of()));
            when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                    .thenReturn(Optional.of(membershipWithRole(TeamRole.MEMBER)));

            assertThat(expressions().isTeamLeader(TEAM_ID)).isFalse();
        }

        @Test
        @DisplayName("no membership returns false")
        void noMembershipReturnsFalse() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    userWithTeam(USER_ID, TEAM_ID), null, List.of()));
            when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                    .thenReturn(Optional.empty());

            assertThat(expressions().isTeamLeader(TEAM_ID)).isFalse();
        }
    }

    @Nested
    @DisplayName("isTeamMember(teamId)")
    class IsTeamMember {

        @Test
        @DisplayName("unauthenticated context returns false")
        void unauthenticatedIsFalse() {
            assertThat(expressions().isTeamMember(TEAM_ID)).isFalse();
        }

        @Test
        @DisplayName("existing membership returns true")
        void memberReturnsTrue() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    userWithTeam(USER_ID, TEAM_ID), null, List.of()));
            when(membershipRepository.existsByTeamIdAndUserId(TEAM_ID, USER_ID)).thenReturn(true);

            assertThat(expressions().isTeamMember(TEAM_ID)).isTrue();
        }

        @Test
        @DisplayName("no membership returns false")
        void nonMemberReturnsFalse() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    userWithTeam(USER_ID, TEAM_ID), null, List.of()));
            when(membershipRepository.existsByTeamIdAndUserId(TEAM_ID, USER_ID)).thenReturn(false);

            assertThat(expressions().isTeamMember(TEAM_ID)).isFalse();
        }
    }

    @Nested
    @DisplayName("getCurrentUser via JWT (EnhancedJwtAuthenticationToken)")
    class JwtResolution {

        @Test
        @DisplayName("resolves local user by supabase id and reports leadership")
        void jwtResolvesUserAndLeads() {
            UUID supabaseId = UUID.randomUUID();
            authenticateAsJwt(supabaseId);
            User resolved = userWithTeam(USER_ID, TEAM_ID);
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.of(resolved));
            when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                    .thenReturn(Optional.of(membershipWithRole(TeamRole.LEADER)));

            assertThat(expressions().isCurrentUserTeamLeader()).isTrue();
            assertThat(expressions().currentUserTeamId()).isEqualTo(TEAM_ID);
        }

        @Test
        @DisplayName("no local user for subject returns null user, so not a leader")
        void jwtNoLocalUserIsNotLeader() {
            UUID supabaseId = UUID.randomUUID();
            authenticateAsJwt(supabaseId);
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());

            assertThat(expressions().isCurrentUserTeamLeader()).isFalse();
            assertThat(expressions().currentUserTeamId()).isNull();
        }

        @Test
        @DisplayName("isTeamMember via JWT-resolved user")
        void jwtResolvedUserMembership() {
            UUID supabaseId = UUID.randomUUID();
            authenticateAsJwt(supabaseId);
            when(userService.findBySupabaseId(supabaseId))
                    .thenReturn(Optional.of(userWithTeam(USER_ID, TEAM_ID)));
            when(membershipRepository.existsByTeamIdAndUserId(TEAM_ID, USER_ID)).thenReturn(true);

            assertThat(expressions().isTeamMember(TEAM_ID)).isTrue();
        }
    }

    @Nested
    @DisplayName("getCurrentUser via username-string principal")
    class UsernameFallback {

        @Test
        @DisplayName("string principal resolves user via findByUsername")
        void stringPrincipalResolved() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "alice@example.com",
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))));
            when(userService.findByUsername("alice@example.com"))
                    .thenReturn(Optional.of(userWithTeam(USER_ID, TEAM_ID)));

            assertThat(expressions().currentUserTeamId()).isEqualTo(TEAM_ID);
        }

        @Test
        @DisplayName("string principal with no matching user returns null")
        void stringPrincipalUnresolved() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "ghost@example.com",
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))));
            when(userService.findByUsername("ghost@example.com")).thenReturn(Optional.empty());

            assertThat(expressions().currentUserTeamId()).isNull();
            assertThat(expressions().isTeamLeader(TEAM_ID)).isFalse();
        }
    }

    @Nested
    @DisplayName("getCurrentUser edge cases")
    class EdgeCases {

        @Test
        @DisplayName("unsupported principal type returns null user")
        void unsupportedPrincipalReturnsNull() {
            // Principal that is neither User nor String falls through to null.
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    Integer.valueOf(99),
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))));

            assertThat(expressions().currentUserTeamId()).isNull();
            assertThat(expressions().isTeamMember(TEAM_ID)).isFalse();
        }

        @Test
        @DisplayName("not-authenticated token short-circuits to null user")
        void notAuthenticatedTokenReturnsNull() {
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken("x", "y");
            token.setAuthenticated(false);
            SecurityContextHolder.getContext().setAuthentication(token);
            lenient()
                    .when(membershipRepository.findByTeamIdAndUserId(TEAM_ID, USER_ID))
                    .thenReturn(Optional.of(membershipWithRole(TeamRole.LEADER)));

            assertThat(expressions().isTeamLeader(TEAM_ID)).isFalse();
        }
    }
}
