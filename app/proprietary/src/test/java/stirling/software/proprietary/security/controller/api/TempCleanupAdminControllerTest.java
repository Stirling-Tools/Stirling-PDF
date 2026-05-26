package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import stirling.software.common.service.TempFileCleanupService;
import stirling.software.common.service.TempFileCleanupService.CleanupStatus;

@ExtendWith(MockitoExtension.class)
class TempCleanupAdminControllerTest {

    @Mock private TempFileCleanupService tempFileCleanupService;

    @InjectMocks private TempCleanupAdminController controller;

    @Test
    void getStatus_returnsTheServiceSnapshot() {
        Instant started = Instant.parse("2026-05-26T20:00:00Z");
        Instant ended = Instant.parse("2026-05-26T20:00:01Z");
        CleanupStatus expected =
                new CleanupStatus(false, started, ended, 1234L, 42L, 7L, 1L, 0L, 0, false, null);
        when(tempFileCleanupService.getCleanupStatus()).thenReturn(expected);

        ResponseEntity<CleanupStatus> response = controller.getStatus();

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isSameAs(expected);
        verify(tempFileCleanupService).getCleanupStatus();
        verifyNoMoreInteractions(tempFileCleanupService);
    }

    @Test
    void resetFailures_clearsTheCounterAndReturnsTheFreshSnapshot() {
        CleanupStatus afterReset =
                new CleanupStatus(false, null, null, 0L, 0L, 0L, 0L, 0L, 0, false, null);
        when(tempFileCleanupService.resetCleanupFailureCounter()).thenReturn(5);
        when(tempFileCleanupService.getCleanupStatus()).thenReturn(afterReset);

        ResponseEntity<CleanupStatus> response = controller.resetFailures();

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isSameAs(afterReset);
        verify(tempFileCleanupService).resetCleanupFailureCounter();
        verify(tempFileCleanupService).getCleanupStatus();
        verifyNoMoreInteractions(tempFileCleanupService);
    }
}
