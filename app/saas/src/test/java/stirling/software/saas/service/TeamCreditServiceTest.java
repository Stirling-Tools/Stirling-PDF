package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.MDC;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.model.TeamCredit;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamCreditRepository;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Unit tests for {@link TeamCreditService}. Collaborators (repositories, billing/extension
 * services) are mocked; credit math is pure arithmetic so exact numbers are asserted. The waterfall
 * path is exercised across every branch: pool hit, no leader, metered-billing disabled, missing
 * Supabase id, Stripe report success/failure, and a thrown exception during reporting.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TeamCreditServiceTest {

    @Mock private TeamCreditRepository teamCreditRepository;
    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private StripeUsageReportingService stripeUsageReportingService;
    @Mock private SaasUserExtensionService saasUserExtensionService;

    // Real CreditsProperties carries the production default allocations (ROLE_PRO_USER -> 500).
    private final CreditsProperties creditsProperties = new CreditsProperties();

    private TeamCreditService service;

    @BeforeEach
    void setUp() {
        service =
                new TeamCreditService(
                        teamCreditRepository,
                        membershipRepository,
                        creditsProperties,
                        stripeUsageReportingService,
                        saasUserExtensionService);
    }

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    // ----------------------------------------------------------------------------------------
    // Fixtures
    // ----------------------------------------------------------------------------------------

    private static Team team(Long id) {
        Team t = new Team();
        t.setId(id);
        return t;
    }

    private static User user(Long id, String username) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        return u;
    }

    private static TeamCredit credit(int cycleRemaining, int boughtRemaining) {
        TeamCredit c = new TeamCredit();
        c.setCycleCreditsRemaining(cycleRemaining);
        c.setCycleCreditsAllocated(cycleRemaining);
        c.setBoughtCreditsRemaining(boughtRemaining);
        c.setTotalBoughtCredits(boughtRemaining);
        return c;
    }

    private static TeamMembership leaderMembership(User leader) {
        TeamMembership m = new TeamMembership();
        m.setRole(TeamRole.LEADER);
        m.setUser(leader);
        return m;
    }

    // ----------------------------------------------------------------------------------------
    // initializeTeamCredits
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("initializeTeamCredits")
    class InitializeTeamCredits {

        @Test
        @DisplayName("returns the existing row without saving when credits already exist")
        void returnsExistingWithoutSaving() {
            Team team = team(100L);
            TeamCredit existing = credit(123, 0);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(existing));

            TeamCredit result = service.initializeTeamCredits(team, user(1L, "primary"));

            assertThat(result).isSameAs(existing);
            verify(teamCreditRepository, never()).save(any());
        }

        @Test
        @DisplayName("seeds the fixed PRO allocation (500) into both cycle fields for a new team")
        void seedsFixedProAllocation() {
            Team team = team(100L);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());
            when(teamCreditRepository.save(any(TeamCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            TeamCredit result = service.initializeTeamCredits(team, user(1L, "primary"));

            // 500 is the production ROLE_PRO_USER default in CreditsProperties.
            assertThat(result.getCycleCreditsAllocated()).isEqualTo(500);
            assertThat(result.getCycleCreditsRemaining()).isEqualTo(500);
            assertThat(result.getLastCycleResetAt()).isNotNull();
            assertThat(result.getTeam()).isSameAs(team);

            ArgumentCaptor<TeamCredit> captor = ArgumentCaptor.forClass(TeamCredit.class);
            verify(teamCreditRepository).save(captor.capture());
            assertThat(captor.getValue().getCycleCreditsRemaining()).isEqualTo(500);
        }

        @Test
        @DisplayName("honours a custom ROLE_PRO_USER allocation from properties")
        void honoursCustomAllocation() {
            CreditsProperties custom = new CreditsProperties();
            custom.getCycle().setAllocations(Map.of("ROLE_PRO_USER", 750));
            TeamCreditService svc =
                    new TeamCreditService(
                            teamCreditRepository,
                            membershipRepository,
                            custom,
                            stripeUsageReportingService,
                            saasUserExtensionService);
            Team team = team(100L);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());
            when(teamCreditRepository.save(any(TeamCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            TeamCredit result = svc.initializeTeamCredits(team, user(1L, "primary"));

            assertThat(result.getCycleCreditsAllocated()).isEqualTo(750);
            assertThat(result.getCycleCreditsRemaining()).isEqualTo(750);
        }

        @Test
        @DisplayName("falls back to 500 when the allocation map has no ROLE_PRO_USER entry")
        void fallsBackTo500WhenKeyMissing() {
            CreditsProperties custom = new CreditsProperties();
            custom.getCycle().setAllocations(Map.of("ROLE_USER", 50));
            TeamCreditService svc =
                    new TeamCreditService(
                            teamCreditRepository,
                            membershipRepository,
                            custom,
                            stripeUsageReportingService,
                            saasUserExtensionService);
            Team team = team(100L);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());
            when(teamCreditRepository.save(any(TeamCredit.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            TeamCredit result = svc.initializeTeamCredits(team, user(1L, "primary"));

            assertThat(result.getCycleCreditsAllocated()).isEqualTo(500);
            assertThat(result.getCycleCreditsRemaining()).isEqualTo(500);
        }
    }

    // ----------------------------------------------------------------------------------------
    // hasCreditsAvailable
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("hasCreditsAvailable")
    class HasCreditsAvailable {

        @Test
        @DisplayName("true when the team pool has cycle or bought credits left")
        void trueWhenCreditsRemain() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(credit(3, 0)));
            assertThat(service.hasCreditsAvailable(100L)).isTrue();
        }

        @Test
        @DisplayName("true when only bought credits remain")
        void trueWhenOnlyBoughtRemain() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(credit(0, 5)));
            assertThat(service.hasCreditsAvailable(100L)).isTrue();
        }

        @Test
        @DisplayName("false when the pool is empty")
        void falseWhenPoolEmpty() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(credit(0, 0)));
            assertThat(service.hasCreditsAvailable(100L)).isFalse();
        }

        @Test
        @DisplayName("false when no credit row exists for the team")
        void falseWhenNoRow() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());
            assertThat(service.hasCreditsAvailable(100L)).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // consumeCredit
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("consumeCredit")
    class ConsumeCredit {

        @Test
        @DisplayName("true when the atomic update affected a row")
        void trueWhenRowUpdated() {
            when(teamCreditRepository.consumeCredit(100L, 2)).thenReturn(1);
            assertThat(service.consumeCredit(100L, 2)).isTrue();
            verify(teamCreditRepository).consumeCredit(100L, 2);
        }

        @Test
        @DisplayName("false when the atomic update affected no rows (insufficient / conflict)")
        void falseWhenNoRowUpdated() {
            when(teamCreditRepository.consumeCredit(100L, 5)).thenReturn(0);
            assertThat(service.consumeCredit(100L, 5)).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------
    // getCreditSummaryForUser
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("getCreditSummaryForUser")
    class GetCreditSummaryForUser {

        @Test
        @DisplayName("empty when the user has no team assigned")
        void emptyWhenNoTeam() {
            User u = user(7L, "noteam");
            u.setTeam(null);

            Optional<TeamCredit> result = service.getCreditSummaryForUser(u);

            assertThat(result).isEmpty();
            verifyNoInteractions(teamCreditRepository);
        }

        @Test
        @DisplayName("delegates to the repository for the user's team id")
        void delegatesToRepository() {
            User u = user(7L, "withteam");
            u.setTeam(team(200L));
            TeamCredit row = credit(10, 0);
            when(teamCreditRepository.findByTeamId(200L)).thenReturn(Optional.of(row));

            Optional<TeamCredit> result = service.getCreditSummaryForUser(u);

            assertThat(result).containsSame(row);
            verify(teamCreditRepository).findByTeamId(200L);
        }
    }

    // ----------------------------------------------------------------------------------------
    // getTeamCredits
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("getTeamCredits")
    class GetTeamCredits {

        @Test
        @DisplayName("passes through the repository optional when present")
        void presentPassesThrough() {
            TeamCredit row = credit(5, 5);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(row));
            assertThat(service.getTeamCredits(100L)).containsSame(row);
        }

        @Test
        @DisplayName("empty when the repository has no row")
        void emptyWhenAbsent() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());
            assertThat(service.getTeamCredits(100L)).isEmpty();
        }
    }

    // ----------------------------------------------------------------------------------------
    // addBoughtCredits
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("addBoughtCredits")
    class AddBoughtCredits {

        @Test
        @DisplayName("adds to bought and total counters then saves")
        void addsAndSaves() {
            TeamCredit row = credit(0, 10);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(row));

            service.addBoughtCredits(100L, 25);

            assertThat(row.getBoughtCreditsRemaining()).isEqualTo(35);
            assertThat(row.getTotalBoughtCredits()).isEqualTo(35);
            verify(teamCreditRepository).save(row);
        }

        @Test
        @DisplayName("throws IllegalArgumentException when no credit row exists")
        void throwsWhenMissing() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.addBoughtCredits(100L, 25))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Team credits not found");
            verify(teamCreditRepository, never()).save(any());
        }
    }

    // ----------------------------------------------------------------------------------------
    // resetCycleCredits
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("resetCycleCredits")
    class ResetCycleCredits {

        @Test
        @DisplayName("overwrites cycle allocation/remaining and reset timestamp then saves")
        void resetsAndSaves() {
            TeamCredit row = credit(1, 0);
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.of(row));
            LocalDateTime resetTime = LocalDateTime.of(2026, 1, 1, 2, 0);

            service.resetCycleCredits(100L, 600, resetTime);

            assertThat(row.getCycleCreditsAllocated()).isEqualTo(600);
            assertThat(row.getCycleCreditsRemaining()).isEqualTo(600);
            assertThat(row.getLastCycleResetAt()).isEqualTo(resetTime);
            verify(teamCreditRepository).save(row);
        }

        @Test
        @DisplayName("throws IllegalArgumentException when no credit row exists")
        void throwsWhenMissing() {
            when(teamCreditRepository.findByTeamId(100L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.resetCycleCredits(100L, 600, LocalDateTime.now()))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Team credits not found");
            verify(teamCreditRepository, never()).save(any());
        }
    }

    // ----------------------------------------------------------------------------------------
    // consumeCreditWithWaterfall
    // ----------------------------------------------------------------------------------------

    @Nested
    @DisplayName("consumeCreditWithWaterfall")
    class ConsumeCreditWithWaterfall {

        @Test
        @DisplayName("pool hit returns success(TEAM_CREDITS) and never touches overage billing")
        void poolHitShortCircuits() {
            when(teamCreditRepository.consumeCredit(100L, 3)).thenReturn(1);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 3);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("TEAM_CREDITS");
            verifyNoInteractions(membershipRepository);
            verifyNoInteractions(saasUserExtensionService);
            verifyNoInteractions(stripeUsageReportingService);
        }

        @Test
        @DisplayName("pool exhausted and no leader returns failure(NO_TEAM_LEADER)")
        void poolExhaustedNoLeader() {
            when(teamCreditRepository.consumeCredit(100L, 3)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of());

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 3);

            assertThat(result.isSuccess()).isFalse();
            // failure(reason) sets the message to the reason code.
            assertThat(result.getMessage()).isEqualTo("NO_TEAM_LEADER");
            verifyNoInteractions(saasUserExtensionService);
            verifyNoInteractions(stripeUsageReportingService);
        }

        @Test
        @DisplayName("leader without metered billing returns the no-overage failure message")
        void leaderMeteredBillingDisabled() {
            User leader = user(9L, "leader");
            leader.setSupabaseId(UUID.randomUUID());
            when(teamCreditRepository.consumeCredit(100L, 3)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(false);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 3);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).contains("Team credits exhausted");
            verifyNoInteractions(stripeUsageReportingService);
        }

        @Test
        @DisplayName("leader with metered billing but no Supabase id returns LEADER_NO_SUPABASE_ID")
        void leaderMissingSupabaseId() {
            User leader = user(9L, "leader");
            leader.setSupabaseId(null);
            when(teamCreditRepository.consumeCredit(100L, 3)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 3);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).isEqualTo("LEADER_NO_SUPABASE_ID");
            verifyNoInteractions(stripeUsageReportingService);
        }

        @Test
        @DisplayName("successful Stripe overage report returns success(TEAM_LEADER_METERED)")
        void overageReportedSuccessfully() {
            UUID supabaseId = UUID.randomUUID();
            User leader = user(9L, "leader");
            leader.setSupabaseId(supabaseId);
            when(teamCreditRepository.consumeCredit(100L, 4)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            eq(supabaseId.toString()), eq(4), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            supabaseId.toString(), 4, "idem-key"))
                    .thenReturn(true);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 4);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.getSource()).isEqualTo("TEAM_LEADER_METERED");
            verify(stripeUsageReportingService)
                    .reportUsageToStripe(supabaseId.toString(), 4, "idem-key");
        }

        @Test
        @DisplayName("uses the MDC requestId as the stable operation id for the idempotency key")
        void usesMdcRequestIdForIdempotency() {
            UUID supabaseId = UUID.randomUUID();
            User leader = user(9L, "leader");
            leader.setSupabaseId(supabaseId);
            MDC.put("requestId", "req-123");
            when(teamCreditRepository.consumeCredit(100L, 2)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            anyString(), anyInt(), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            anyString(), anyInt(), anyString()))
                    .thenReturn(true);

            service.consumeCreditWithWaterfall(100L, 2);

            verify(stripeUsageReportingService)
                    .generateIdempotencyKey(supabaseId.toString(), 2, "req-123");
        }

        @Test
        @DisplayName("falls back to a random operation id when no requestId is in MDC")
        void generatesRandomOperationIdWhenNoMdc() {
            UUID supabaseId = UUID.randomUUID();
            User leader = user(9L, "leader");
            leader.setSupabaseId(supabaseId);
            // No MDC requestId set -> a random UUID string is generated.
            when(teamCreditRepository.consumeCredit(100L, 2)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            anyString(), anyInt(), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            anyString(), anyInt(), anyString()))
                    .thenReturn(true);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 2);

            assertThat(result.isSuccess()).isTrue();
            ArgumentCaptor<String> opId = ArgumentCaptor.forClass(String.class);
            verify(stripeUsageReportingService)
                    .generateIdempotencyKey(eq(supabaseId.toString()), eq(2), opId.capture());
            assertThat(opId.getValue()).isNotBlank();
        }

        @Test
        @DisplayName("Stripe report returning false yields failure(STRIPE_REPORTING_FAILED)")
        void overageReportFailed() {
            UUID supabaseId = UUID.randomUUID();
            User leader = user(9L, "leader");
            leader.setSupabaseId(supabaseId);
            when(teamCreditRepository.consumeCredit(100L, 4)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            anyString(), anyInt(), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            anyString(), anyInt(), anyString()))
                    .thenReturn(false);

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 4);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).contains("Unable to report usage to Stripe");
        }

        @Test
        @DisplayName("exception during reporting is caught and surfaced as STRIPE_REPORTING_ERROR")
        void overageReportThrows() {
            UUID supabaseId = UUID.randomUUID();
            User leader = user(9L, "leader");
            leader.setSupabaseId(supabaseId);
            when(teamCreditRepository.consumeCredit(100L, 4)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(leader)));
            when(saasUserExtensionService.isMeteredBillingEnabled(leader)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            anyString(), anyInt(), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            anyString(), anyInt(), anyString()))
                    .thenThrow(new RuntimeException("boom"));

            CreditConsumptionResult result = service.consumeCreditWithWaterfall(100L, 4);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.getMessage()).contains("Error reporting usage: boom");
        }

        @Test
        @DisplayName("picks the first leader when several leaders exist on the team")
        void picksFirstLeaderOfMany() {
            UUID firstSupabaseId = UUID.randomUUID();
            User first = user(1L, "first-leader");
            first.setSupabaseId(firstSupabaseId);
            User second = user(2L, "second-leader");
            second.setSupabaseId(UUID.randomUUID());
            when(teamCreditRepository.consumeCredit(100L, 1)).thenReturn(0);
            when(membershipRepository.findByTeamIdAndRole(100L, TeamRole.LEADER))
                    .thenReturn(List.of(leaderMembership(first), leaderMembership(second)));
            when(saasUserExtensionService.isMeteredBillingEnabled(first)).thenReturn(true);
            when(stripeUsageReportingService.generateIdempotencyKey(
                            anyString(), anyInt(), anyString()))
                    .thenReturn("idem-key");
            when(stripeUsageReportingService.reportUsageToStripe(
                            anyString(), anyInt(), anyString()))
                    .thenReturn(true);

            service.consumeCreditWithWaterfall(100L, 1);

            // Only the first leader's identity is checked / reported on.
            verify(saasUserExtensionService).isMeteredBillingEnabled(first);
            verify(saasUserExtensionService, never()).isMeteredBillingEnabled(second);
            verify(stripeUsageReportingService)
                    .generateIdempotencyKey(eq(firstSupabaseId.toString()), eq(1), anyString());
        }
    }
}
