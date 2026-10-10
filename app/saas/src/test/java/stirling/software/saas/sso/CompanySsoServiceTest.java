package stirling.software.saas.sso;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.config.SupabaseConfigurationProperties;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.service.SaasTeamExtensionService;

class CompanySsoServiceTest {
    CompanySsoStore store = mock(CompanySsoStore.class);
    UserRepository users = mock(UserRepository.class);
    TeamRepository teams = mock(TeamRepository.class);
    TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    SaasTeamExtensionsRepository seats = mock(SaasTeamExtensionsRepository.class);
    CompanySsoProperties properties = new CompanySsoProperties();
    CompanySsoService service =
            new CompanySsoService(
                    properties,
                    new SupabaseConfigurationProperties(),
                    store,
                    mock(CompanySsoPolicy.class),
                    mock(SupabaseSamlAdmin.class),
                    users,
                    teams,
                    memberships,
                    seats,
                    mock(SaasTeamExtensionService.class));
    UUID connectionId = UUID.randomUUID();
    UUID provider = UUID.randomUUID();
    UUID auth = UUID.randomUUID();
    UUID session = UUID.randomUUID();
    UUID originalAuth = UUID.randomUUID();
    Instant now = Instant.now();
    String token = "a".repeat(43);
    Team team = new Team();
    User user = new User();
    TeamMembership membership = new TeamMembership();

    @BeforeEach
    void setup() {
        properties.setEnabled(true);
        team.setId(7L);
        team.setName("Company");
        user.setId(4L);
        user.setSupabaseId(originalAuth);
        user.setTeam(team);
        user.setEmail("existing@example.com");
        membership.setMembershipId(10L);
        membership.setRole(TeamRole.LEADER);
        membership.setUser(user);
        membership.setTeam(team);
        when(teams.lockById(7L)).thenReturn(Optional.of(team));
        when(users.findById(4L)).thenReturn(Optional.of(user));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.of(membership));
        connection(true, 1);
        attempt(null, 1, now.plusSeconds(600));
    }

    @Test
    void emailMatchRequiresOriginalAccountProof() {
        when(users.findByEmailIgnoreCase("company@example.com")).thenReturn(Optional.of(user));
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .isInstanceOf(CompanySsoException.class)
                .hasMessageContaining("existing Stirling account");
        verify(store, never()).bind(any(), anyLong(), anyLong());
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void connectionProofPreservesTheOriginalLeaderAccountAndBillingIdentity() {
        connection(false, 1);
        attempt(4L, 1, now.plusSeconds(600));
        assertThat(service.complete(token, saml(provider), null).active()).isFalse();
        assertThat(user.getId()).isEqualTo(4L);
        assertThat(user.getSupabaseId()).isEqualTo(originalAuth);
        assertThat(user.getEmail()).isEqualTo("existing@example.com");
        assertThat(membership.getRole()).isEqualTo(TeamRole.LEADER);
        verify(store).bind(auth, 4, 7);
        verify(store).admit(session, 4, 7, 10);
        verify(seats, never()).incrementSeatsUsed(anyLong());
    }

    @Test
    void changedMetadataExpiredAttemptsAndWrongProvidersCannotAdmit() {
        connection(true, 2);
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("again");
        connection(true, 1);
        attempt(null, 1, now.minusSeconds(1));
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("again");
        attempt(null, 1, now.plusSeconds(600));
        assertThatThrownBy(() -> service.complete(token, saml(UUID.randomUUID()), null))
                .hasMessageContaining("company's SSO");
        verify(store, never()).admit(any(), anyLong(), anyLong(), anyLong());
    }

    @Test
    void removalDuringConversionInvalidatesOriginalAccountProof() {
        attempt(4L, 1, now.plusSeconds(600));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("belongs to this team");
        verify(store, never()).bind(any(), anyLong(), anyLong());
    }

    @Test
    void rejoiningRequiresANewSessionAndDoesNotRestoreLeadership() {
        user.addAuthority(new Authority(Role.USER.getRoleId(), user));
        when(store.binding(auth)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
        when(seats.incrementSeatsUsed(7L)).thenReturn(1);
        when(memberships.saveAndFlush(any()))
                .thenAnswer(
                        call -> {
                            TeamMembership joined = call.getArgument(0);
                            assertThat(joined.getRole()).isEqualTo(TeamRole.MEMBER);
                            joined.setMembershipId(20L);
                            return joined;
                        });
        service.complete(token, saml(provider), null);
        assertThat(user.getRolesAsString()).isEqualTo(Role.PRO_USER.getRoleId());
        verify(store).admit(session, 4, 7, 20);
        when(store.sessionUsed(session)).thenReturn(true);
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("fresh company sign-in");
    }

    @Test
    void onlyTheLeaderWhoTestedThisRevisionCanActivate() {
        properties.setEligibleTeamIds(Set.of(7L));
        when(users.findBySupabaseId(originalAuth)).thenReturn(Optional.of(user));
        when(store.team(7))
                .thenReturn(
                        Optional.of(
                                new CompanySsoStore.Connection(
                                        connectionId, 7, provider, false, 1, 99L)));
        assertThatThrownBy(() -> service.activate(original())).hasMessageContaining("Test SSO");
        verify(store, never()).activate(any());
        when(store.team(7))
                .thenReturn(
                        Optional.of(
                                new CompanySsoStore.Connection(
                                        connectionId, 7, provider, false, 1, 4L)));
        when(store.userBinding(4)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        service.activate(original());
        verify(store).activate(connectionId);
    }

    @Test
    void membersCannotConfigureOrActivateCompanySso() {
        properties.setEligibleTeamIds(Set.of(7L));
        when(users.findBySupabaseId(originalAuth)).thenReturn(Optional.of(user));
        membership.setRole(TeamRole.MEMBER);
        assertThatThrownBy(() -> service.activate(original()))
                .hasMessageContaining("Only a team leader");
        assertThatThrownBy(() -> service.save(original(), "metadata"))
                .hasMessageContaining("Only a team leader");
        verify(store, never()).activate(any());
        verify(store, never()).save(any());
    }

    @Test
    void freshProofFromAnotherTeamCannotConnectAnAccount() {
        when(users.findBySupabaseId(originalAuth)).thenReturn(Optional.of(user));
        Team other = new Team();
        other.setId(8L);
        user.setTeam(other);
        assertThatThrownBy(() -> service.complete(token, saml(provider), original()))
                .hasMessageContaining("belongs to this team");
        verify(store, never()).bind(any(), anyLong(), anyLong());
    }

    private Jwt original() {
        return Jwt.withTokenValue("original")
                .header("alg", "RS256")
                .subject(originalAuth.toString())
                .claim(
                        "amr",
                        List.of(Map.of("method", "password", "timestamp", now.getEpochSecond())))
                .build();
    }

    @Test
    void noSeatMeansNoSessionAdmission() {
        when(store.binding(auth)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("no available seats");
        verify(store, never()).admit(any(), anyLong(), anyLong(), anyLong());
    }

    private void connection(boolean active, int revision) {
        when(store.connection(connectionId))
                .thenReturn(
                        Optional.of(
                                new CompanySsoStore.Connection(
                                        connectionId, 7, provider, active, revision, null)));
    }

    private void attempt(Long originalUser, int revision, Instant expiry) {
        when(store.lockAttempt(any()))
                .thenReturn(
                        new CompanySsoStore.Attempt(
                                "hash",
                                connectionId,
                                revision,
                                originalUser,
                                now.minusSeconds(2),
                                expiry));
    }

    private Jwt saml(UUID usedProvider) {
        return Jwt.withTokenValue("test")
                .header("alg", "RS256")
                .subject(auth.toString())
                .claim("session_id", session.toString())
                .claim("email", "company@example.com")
                .claim(
                        "amr",
                        List.of(
                                Map.of(
                                        "method",
                                        "sso/saml",
                                        "provider",
                                        usedProvider.toString(),
                                        "timestamp",
                                        now.getEpochSecond())))
                .build();
    }
}
