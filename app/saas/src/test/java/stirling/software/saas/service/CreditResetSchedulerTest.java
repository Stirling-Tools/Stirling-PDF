package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.config.CreditsProperties;

/**
 * Unit tests for {@link CreditResetScheduler}.
 *
 * <p>The scheduler has two {@code @Scheduled} entry points that are invoked directly (no Spring
 * context, no real cron firing). {@code resetCycleCredits()} parses the configured zone, builds a
 * {@code LocalDateTime} in that zone, and delegates to {@link CreditService} for users then teams,
 * swallowing any exception. {@code performDailyMaintenance()} is a pure no-op log step that must
 * never touch {@link CreditService}.
 */
@ExtendWith(MockitoExtension.class)
class CreditResetSchedulerTest {

    @Mock private CreditService creditService;

    /** Real CreditsProperties (a simple @Data POJO) configured per test via its nested Reset. */
    private static CreditsProperties props(String cron, String zone) {
        CreditsProperties p = new CreditsProperties();
        p.getReset().setCron(cron);
        p.getReset().setZone(zone);
        return p;
    }

    private CreditResetScheduler scheduler(CreditsProperties props) {
        return new CreditResetScheduler(creditService, props);
    }

    @Nested
    @DisplayName("resetCycleCredits - happy path")
    class ResetHappyPath {

        @Test
        @DisplayName("resets users then teams exactly once each")
        void resetsUsersThenTeamsOnce() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));

            s.resetCycleCredits();

            verify(creditService, times(1)).resetCycleCreditsForAllUsers(any(LocalDateTime.class));
            verify(creditService, times(1)).resetCycleCreditsForAllTeams(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("users are reset strictly before teams")
        void usersResetBeforeTeams() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));

            s.resetCycleCredits();

            InOrder order = inOrder(creditService);
            order.verify(creditService).resetCycleCreditsForAllUsers(any(LocalDateTime.class));
            order.verify(creditService).resetCycleCreditsForAllTeams(any(LocalDateTime.class));
            order.verifyNoMoreInteractions();
        }

        @Test
        @DisplayName("passes a non-null reset time and uses the same instant for users and teams")
        void passesSameNonNullResetTimeToBoth() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));

            s.resetCycleCredits();

            ArgumentCaptor<LocalDateTime> userTime = ArgumentCaptor.forClass(LocalDateTime.class);
            ArgumentCaptor<LocalDateTime> teamTime = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(creditService).resetCycleCreditsForAllUsers(userTime.capture());
            verify(creditService).resetCycleCreditsForAllTeams(teamTime.capture());

            assertThat(userTime.getValue()).isNotNull();
            assertThat(teamTime.getValue()).isNotNull();
            // The very same LocalDateTime instance is threaded through both calls.
            assertThat(teamTime.getValue()).isSameAs(userTime.getValue());
        }

        @Test
        @DisplayName("reset time is computed in the configured zone (~now)")
        void resetTimeMatchesConfiguredZone() {
            String zone = "UTC";
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", zone));
            LocalDateTime expected = LocalDateTime.now(ZoneId.of(zone));

            s.resetCycleCredits();

            ArgumentCaptor<LocalDateTime> captor = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(creditService).resetCycleCreditsForAllUsers(captor.capture());
            // Wall-clock now in the same zone; allow generous slack to avoid flakiness.
            assertThat(captor.getValue()).isCloseTo(expected, within(10, ChronoUnit.SECONDS));
        }

        @Test
        @DisplayName("a non-UTC zone is honored when building the reset time")
        void nonUtcZoneHonored() {
            String zone = "America/New_York";
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", zone));
            LocalDateTime expected = LocalDateTime.now(ZoneId.of(zone));

            s.resetCycleCredits();

            ArgumentCaptor<LocalDateTime> captor = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(creditService).resetCycleCreditsForAllUsers(captor.capture());
            assertThat(captor.getValue()).isCloseTo(expected, within(10, ChronoUnit.SECONDS));
        }
    }

    @Nested
    @DisplayName("resetCycleCredits - error handling (exceptions are swallowed)")
    class ResetErrorHandling {

        @Test
        @DisplayName("user-reset failure is swallowed and short-circuits the team reset")
        void userResetThrows_swallowedAndTeamsSkipped() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));
            doThrow(new RuntimeException("user reset boom"))
                    .when(creditService)
                    .resetCycleCreditsForAllUsers(any(LocalDateTime.class));

            // Must not propagate.
            s.resetCycleCredits();

            verify(creditService).resetCycleCreditsForAllUsers(any(LocalDateTime.class));
            // Exception thrown before the team call is reached.
            verify(creditService, never()).resetCycleCreditsForAllTeams(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("team-reset failure is swallowed after users already reset")
        void teamResetThrows_swallowedAfterUsersReset() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));
            doThrow(new RuntimeException("team reset boom"))
                    .when(creditService)
                    .resetCycleCreditsForAllTeams(any(LocalDateTime.class));

            // Must not propagate.
            s.resetCycleCredits();

            verify(creditService).resetCycleCreditsForAllUsers(any(LocalDateTime.class));
            verify(creditService).resetCycleCreditsForAllTeams(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("an invalid zone string is swallowed and no reset work is attempted")
        void invalidZone_swallowedNoResets() {
            // ZoneId.of on a bad id throws DateTimeException before any delegation occurs.
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "Not/AZone"));

            // Must not propagate.
            s.resetCycleCredits();

            verifyNoInteractions(creditService);
        }

        @Test
        @DisplayName("any RuntimeException subtype from the user reset is swallowed")
        void userResetRuntimeExceptionTolerated() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));
            // Production catches (Exception e); any RuntimeException is absorbed.
            doThrow(new IllegalStateException("transient"))
                    .when(creditService)
                    .resetCycleCreditsForAllUsers(any(LocalDateTime.class));

            s.resetCycleCredits();

            verify(creditService).resetCycleCreditsForAllUsers(any(LocalDateTime.class));
            verify(creditService, never()).resetCycleCreditsForAllTeams(any(LocalDateTime.class));
        }
    }

    @Nested
    @DisplayName("performDailyMaintenance")
    class DailyMaintenance {

        @Test
        @DisplayName("runs cleanly and never touches the credit service")
        void noOp_doesNotTouchCreditService() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));

            s.performDailyMaintenance();

            verifyNoInteractions(creditService);
        }

        @Test
        @DisplayName("is idempotent across repeated invocations")
        void repeatedInvocationsRemainNoOp() {
            CreditResetScheduler s = scheduler(props("0 0 2 1 * *", "UTC"));

            s.performDailyMaintenance();
            s.performDailyMaintenance();
            s.performDailyMaintenance();

            verifyNoInteractions(creditService);
        }
    }
}
