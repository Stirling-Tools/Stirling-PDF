package stirling.software.saas.sso;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

class CompanySsoPolicyTest {
    CompanySsoStore store = mock(CompanySsoStore.class);
    UserRepository users = mock(UserRepository.class);
    TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    CompanySsoPolicy policy = new CompanySsoPolicy(store, users, memberships);
    UUID auth = UUID.randomUUID();
    UUID session = UUID.randomUUID();
    UUID provider = UUID.randomUUID();
    CompanySsoStore.Connection connection =
            new CompanySsoStore.Connection(UUID.randomUUID(), 7, provider, true, 1, 4L);
    User user = new User();
    Team team = new Team();
    TeamMembership membership = new TeamMembership();

    @BeforeEach
    void setup() {
        user.setId(4L);
        team.setId(7L);
        user.setTeam(team);
        membership.setMembershipId(10L);
        membership.setTeam(team);
        membership.setUser(user);
        when(store.team(7)).thenReturn(Optional.of(connection));
        when(store.userBinding(4)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        when(store.binding(auth)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        when(users.findById(4L)).thenReturn(Optional.of(user));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.of(membership));
    }

    @Test
    void membershipRemovalAndRejoinDoNotReviveAnOldSession() {
        when(store.admitted(session, 4, 10)).thenReturn(true);
        assertThat(policy.resolve(saml(provider))).contains(user);
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> policy.resolve(saml(provider)))
                .isInstanceOf(CompanySsoException.class);
        membership.setMembershipId(11L);
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.of(membership));
        assertThatThrownBy(() -> policy.resolve(saml(provider)))
                .isInstanceOf(CompanySsoException.class);
    }

    @Test
    void aDifferentProviderAndAnUnadmittedSessionCannotUseABinding() {
        when(store.admitted(session, 4, 10)).thenReturn(true);
        assertThatThrownBy(() -> policy.resolve(saml(UUID.randomUUID())))
                .isInstanceOf(CompanySsoException.class);
        when(store.admitted(session, 4, 10)).thenReturn(false);
        assertThatThrownBy(() -> policy.resolve(saml(provider)))
                .isInstanceOf(CompanySsoException.class);
    }

    @Test
    void disabledAccountsCannotUseAnAdmittedSession() {
        when(store.admitted(session, 4, 10)).thenReturn(true);
        user.setEnabled(false);
        assertThatThrownBy(() -> policy.resolve(saml(provider)))
                .isInstanceOf(CompanySsoException.class);
    }

    @Test
    void ordinaryLoginApiKeyAndInvitationCannotBypassCompanyPolicy() {
        assertThatThrownBy(() -> policy.assertAccess(user, null))
                .isInstanceOf(CompanySsoException.class);
        assertThatThrownBy(
                        () ->
                                policy.assertAccess(
                                        user,
                                        Jwt.withTokenValue("test")
                                                .header("alg", "RS256")
                                                .subject(auth.toString())
                                                .build()))
                .isInstanceOf(CompanySsoException.class);
        assertThatThrownBy(() -> policy.assertCanLeave(7))
                .isInstanceOf(IllegalStateException.class);
        when(memberships.findByUserId(4L)).thenReturn(List.of(membership));
        assertThatThrownBy(() -> policy.assertCanAcceptInvitation(user, 8))
                .isInstanceOf(IllegalStateException.class);
    }

    private Jwt saml(UUID usedProvider) {
        return Jwt.withTokenValue("test")
                .header("alg", "RS256")
                .subject(auth.toString())
                .claim("session_id", session.toString())
                .claim(
                        "amr",
                        List.of(
                                Map.of(
                                        "method",
                                        "sso/saml",
                                        "provider",
                                        usedProvider.toString(),
                                        "timestamp",
                                        Instant.now().getEpochSecond())))
                .build();
    }
}
