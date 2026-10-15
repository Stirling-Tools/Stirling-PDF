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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.repository.ProcurementDealRepository;
import stirling.software.saas.procurement.repository.ProcurementQuoteRepository;
import stirling.software.saas.procurement.service.EnterpriseEntitlementService;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.service.SaasTeamExtensionService;

class CompanySsoServiceTest {
    CompanySsoStore store = mock(CompanySsoStore.class);
    UserRepository users = mock(UserRepository.class);
    TeamRepository teams = mock(TeamRepository.class);
    TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    SaasTeamExtensionsRepository seats = mock(SaasTeamExtensionsRepository.class);
    ProcurementDealRepository deals = mock(ProcurementDealRepository.class);
    ProcurementQuoteRepository quotes = mock(ProcurementQuoteRepository.class);
    SupabaseSamlAdmin admin = mock(SupabaseSamlAdmin.class);
    CompanySsoProperties properties = new CompanySsoProperties();
    CompanySsoService service =
            new CompanySsoService(
                    properties,
                    new SupabaseConfigurationProperties(),
                    store,
                    mock(CompanySsoPolicy.class),
                    admin,
                    users,
                    teams,
                    memberships,
                    seats,
                    mock(SaasTeamExtensionService.class),
                    new EnterpriseEntitlementService(deals, quotes));
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
    ProcurementDeal deal = new ProcurementDeal(7L);

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
        deal.setDealId(3L);
        deal.setTrialStartedAt(LocalDateTime.ofInstant(now.minusSeconds(3600), ZoneOffset.UTC));
        deal.setTrialEndsAt(LocalDateTime.ofInstant(now.plusSeconds(3600), ZoneOffset.UTC));
        when(deals.findByTeamId(7L)).thenReturn(Optional.of(deal));
        when(teams.lockById(7L)).thenReturn(Optional.of(team));
        when(teams.findById(7L)).thenReturn(Optional.of(team));
        when(users.findById(4L)).thenReturn(Optional.of(user));
        when(users.findBySupabaseId(originalAuth)).thenReturn(Optional.of(user));
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

    @ParameterizedTest
    @ValueSource(strings = {"trial", "payment_pending", "active"})
    void currentEnterpriseAccessUnlocksSetupAndActivation(String status) {
        connection(false, 1);
        if (!status.equals("trial")) {
            deal.setStage(
                    status.equals("active")
                            ? ProcurementDeal.STAGE_LIVE
                            : ProcurementDeal.STAGE_PAYMENT);
            deal.setAcceptedQuoteId(9L);
            deal.setEnterprisePeriodStart(deal.getTrialStartedAt());
            deal.setEnterprisePeriodEnd(deal.getTrialEndsAt().plusYears(1));
            deal.setEnterpriseAccessUntil(deal.getTrialEndsAt());
            ProcurementQuote quote = new ProcurementQuote();
            quote.setDealId(3L);
            when(quotes.findById(9L)).thenReturn(Optional.of(quote));
        }
        assertThat(service.settings(original()).eligible()).isTrue();
        when(admin.save(provider, "metadata")).thenReturn(provider);
        service.save(original(), "metadata");
        verify(store).save(any());
        when(store.team(7))
                .thenReturn(
                        Optional.of(
                                new CompanySsoStore.Connection(
                                        connectionId, 7, provider, false, 1, 4L)));
        when(store.userBinding(4)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        service.activate(original());
        verify(store).activate(connectionId);
    }

    @ParameterizedTest
    @ValueSource(strings = {"none", "expired", "future"})
    void missingOrInactiveEnterpriseAccessCannotConfigureTestOrActivate(String status) {
        connection(false, 1);
        switch (status) {
            case "none" -> when(deals.findByTeamId(7L)).thenReturn(Optional.empty());
            case "expired" -> expireEnterprise();
            case "future" -> deal.setTrialStartedAt(deal.getTrialEndsAt().minusMinutes(1));
            default -> throw new IllegalArgumentException(status);
        }
        assertThat(service.settings(original()).eligible()).isFalse();
        assertThatThrownBy(() -> service.save(original(), "metadata"))
                .hasMessageContaining("active Enterprise");
        assertThatThrownBy(() -> service.start(connectionId, original()))
                .hasMessageContaining("active Enterprise");
        assertThatThrownBy(() -> service.activate(original()))
                .hasMessageContaining("active Enterprise");
        verify(admin, never()).save(any(), any());
        verify(store, never()).start(any(), any(), any(), any());
        verify(store, never()).activate(any());
    }

    @Test
    void expiryDuringDraftTestBlocksAccountBinding() {
        connection(false, 1);
        service.start(connectionId, original());
        expireEnterprise();
        attempt(4L, 1, now.plusSeconds(600));
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("active Enterprise");
        verify(store, never()).bind(any(), anyLong(), anyLong());
        verify(store, never()).admit(any(), anyLong(), anyLong(), anyLong());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void expiryPreservesActiveSettingsAndExistingMemberSignInOrConversion(boolean connected) {
        expireEnterprise();
        if (connected) {
            when(store.binding(auth))
                    .thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        } else {
            attempt(4L, 1, now.plusSeconds(600));
        }
        var settings = service.settings(original());
        assertThat(settings.eligible()).isFalse();
        assertThat(settings.active()).isTrue();
        assertThat(settings.connectionId()).isEqualTo(connectionId);
        service.start(connectionId, connected ? null : original());
        assertThat(service.complete(token, saml(provider), null).active()).isTrue();
        verify(store).admit(session, 4, 7, 10);
        verify(seats, never()).incrementSeatsUsed(anyLong());
    }

    @Test
    void expiryDuringNewEmployeeLoginBlocksProvisioning() {
        service.start(connectionId, null);
        expireEnterprise();
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("active Enterprise");
        verify(users, never()).saveAndFlush(any());
        verify(seats, never()).incrementSeatsUsed(anyLong());
        verify(store, never()).admit(any(), anyLong(), anyLong(), anyLong());
    }

    @Test
    void newEmployeesJoinAnEntitledTeamAsMembers() {
        when(users.saveAndFlush(any()))
                .thenAnswer(
                        call -> {
                            User created = call.getArgument(0);
                            created.setId(5L);
                            return created;
                        });
        when(seats.incrementSeatsUsed(7L)).thenReturn(1);
        when(memberships.saveAndFlush(any()))
                .thenAnswer(
                        call -> {
                            TeamMembership joined = call.getArgument(0);
                            assertThat(joined.getRole()).isEqualTo(TeamRole.MEMBER);
                            assertThat(joined.getTeam()).isEqualTo(team);
                            joined.setMembershipId(20L);
                            return joined;
                        });
        service.complete(token, saml(provider), null);
        verify(store).bind(auth, 5, 7);
        verify(store).admit(session, 5, 7, 20);
    }

    @Test
    void removedMemberCannotRejoinUntilEnterpriseAccessIsRenewed() {
        when(store.binding(auth)).thenReturn(Optional.of(new CompanySsoStore.Binding(auth, 4, 7)));
        when(memberships.findByTeamIdAndUserId(7L, 4L)).thenReturn(Optional.empty());
        expireEnterprise();
        assertThatThrownBy(() -> service.complete(token, saml(provider), null))
                .hasMessageContaining("active Enterprise");
        verify(seats, never()).incrementSeatsUsed(anyLong());
        verify(store, never()).admit(any(), anyLong(), anyLong(), anyLong());
        deal.setTrialEndsAt(LocalDateTime.ofInstant(now.plusSeconds(3600), ZoneOffset.UTC));
        when(seats.incrementSeatsUsed(7L)).thenReturn(1);
        when(memberships.saveAndFlush(any()))
                .thenAnswer(
                        call -> {
                            TeamMembership joined = call.getArgument(0);
                            joined.setMembershipId(20L);
                            return joined;
                        });
        service.complete(token, saml(provider), null);
        verify(store).admit(session, 4, 7, 20);
    }

    @Test
    void rolloutSwitchStillBlocksSetupForEntitledTeams() {
        properties.setEnabled(false);
        var settings = service.settings(original());
        assertThat(settings.available()).isFalse();
        assertThat(settings.eligible()).isFalse();
        assertThat(settings.active()).isTrue();
        assertThatThrownBy(() -> service.save(original(), "metadata"))
                .hasMessageContaining("unavailable");
        assertThatThrownBy(() -> service.activate(original())).hasMessageContaining("unavailable");
        verify(admin, never()).save(any(), any());
        verify(store, never()).activate(any());
    }

    private void expireEnterprise() {
        deal.setTrialEndsAt(LocalDateTime.ofInstant(now.minusSeconds(1), ZoneOffset.UTC));
    }

    private void connection(boolean active, int revision) {
        var connection =
                new CompanySsoStore.Connection(connectionId, 7, provider, active, revision, null);
        when(store.connection(connectionId)).thenReturn(Optional.of(connection));
        when(store.team(7)).thenReturn(Optional.of(connection));
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
