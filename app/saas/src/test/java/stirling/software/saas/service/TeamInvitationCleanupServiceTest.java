package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.repository.TeamInvitationRepository;

/**
 * Unit tests for {@link TeamInvitationCleanupService}.
 *
 * <p>Two scheduled jobs: {@code markExpiredInvitations} (daily) flips PENDING rows past their
 * expiry to EXPIRED via a bulk UPDATE; {@code deleteOldExpiredInvitations} (monthly) purges EXPIRED
 * rows older than 30 days. Both swallow exceptions so a failing run never breaks the scheduler. The
 * repository is fully mocked.
 */
@ExtendWith(MockitoExtension.class)
class TeamInvitationCleanupServiceTest {

    @Mock private TeamInvitationRepository invitationRepository;

    @InjectMocks private TeamInvitationCleanupService service;

    @Nested
    @DisplayName("markExpiredInvitations")
    class MarkExpiredInvitations {

        @Test
        @DisplayName("calls the bulk update with a current timestamp")
        void callsBulkUpdate() {
            when(invitationRepository.markExpiredInvitations(any(LocalDateTime.class)))
                    .thenReturn(3);

            LocalDateTime before = LocalDateTime.now();
            service.markExpiredInvitations();
            LocalDateTime after = LocalDateTime.now();

            ArgumentCaptor<LocalDateTime> captor = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(invitationRepository).markExpiredInvitations(captor.capture());
            assertThat(captor.getValue()).isAfterOrEqualTo(before).isBeforeOrEqualTo(after);
        }

        @Test
        @DisplayName("handles the zero-expired branch without error")
        void zeroExpired_noError() {
            when(invitationRepository.markExpiredInvitations(any(LocalDateTime.class)))
                    .thenReturn(0);

            assertThatCode(service::markExpiredInvitations).doesNotThrowAnyException();
            verify(invitationRepository).markExpiredInvitations(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("swallows repository exceptions so the scheduler keeps running")
        void repositoryThrows_swallowed() {
            when(invitationRepository.markExpiredInvitations(any(LocalDateTime.class)))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(service::markExpiredInvitations).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("deleteOldExpiredInvitations")
    class DeleteOldExpiredInvitations {

        @Test
        @DisplayName("deletes the rows returned by the lookup when non-empty")
        void nonEmpty_deletesAll() {
            List<TeamInvitation> old = List.of(new TeamInvitation(), new TeamInvitation());
            when(invitationRepository.findByStatusAndExpiresAtBefore(
                            eq(InvitationStatus.EXPIRED), any(LocalDateTime.class)))
                    .thenReturn(old);

            service.deleteOldExpiredInvitations();

            verify(invitationRepository).deleteAll(old);
        }

        @Test
        @DisplayName("looks up EXPIRED rows with a ~30-day cutoff in the past")
        void usesThirtyDayCutoff() {
            when(invitationRepository.findByStatusAndExpiresAtBefore(
                            eq(InvitationStatus.EXPIRED), any(LocalDateTime.class)))
                    .thenReturn(Collections.emptyList());

            LocalDateTime expectedCutoff = LocalDateTime.now().minusDays(30);
            service.deleteOldExpiredInvitations();

            ArgumentCaptor<LocalDateTime> captor = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(invitationRepository)
                    .findByStatusAndExpiresAtBefore(eq(InvitationStatus.EXPIRED), captor.capture());
            // Cutoff is ~30 days back; allow a generous window for clock drift during the test.
            assertThat(captor.getValue())
                    .isBetween(expectedCutoff.minusMinutes(1), expectedCutoff.plusMinutes(1));
        }

        @Test
        @DisplayName("does not call deleteAll when there is nothing to purge")
        void empty_noDelete() {
            when(invitationRepository.findByStatusAndExpiresAtBefore(
                            eq(InvitationStatus.EXPIRED), any(LocalDateTime.class)))
                    .thenReturn(Collections.emptyList());

            service.deleteOldExpiredInvitations();

            verify(invitationRepository, never()).deleteAll(any());
        }

        @Test
        @DisplayName("swallows repository exceptions so the scheduler keeps running")
        void repositoryThrows_swallowed() {
            when(invitationRepository.findByStatusAndExpiresAtBefore(
                            any(InvitationStatus.class), any(LocalDateTime.class)))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(service::deleteOldExpiredInvitations).doesNotThrowAnyException();
            verify(invitationRepository, never()).deleteAll(any());
        }
    }
}
