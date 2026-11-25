package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

class AuditCleanupServiceTest {

    private final PersistentAuditEventRepository repository =
            mock(PersistentAuditEventRepository.class);

    private AuditCleanupService service(boolean runningEE, int retentionDays) {
        return service(runningEE, retentionDays, mock(TaskScheduler.class));
    }

    private AuditCleanupService service(
            boolean runningEE, int retentionDays, TaskScheduler scheduler) {
        ApplicationProperties props = new ApplicationProperties();
        var audit = props.getPremium().getEnterpriseFeatures().getAudit();
        audit.setEnabled(true);
        audit.setRetentionDays(retentionDays);
        return new AuditCleanupService(
                repository, new AuditConfigurationProperties(props), runningEE, scheduler);
    }

    @Test
    @DisplayName("Enterprise keeps the configured retention, including infinite")
    void enterpriseUsesConfigured() {
        assertThat(service(true, 90).effectiveRetentionDays()).isEqualTo(90);
        assertThat(service(true, 365).effectiveRetentionDays()).isEqualTo(365);
        assertThat(service(true, 0).effectiveRetentionDays()).isEqualTo(0);
    }

    @Test
    @DisplayName("non-Enterprise caps retention at 30 days")
    void nonEnterpriseCapsHigherValues() {
        assertThat(service(false, 90).effectiveRetentionDays()).isEqualTo(30);
        assertThat(service(false, 365).effectiveRetentionDays()).isEqualTo(30);
    }

    @Test
    @DisplayName("non-Enterprise respects a shorter configured retention")
    void nonEnterpriseRespectsLower() {
        assertThat(service(false, 14).effectiveRetentionDays()).isEqualTo(14);
        assertThat(service(false, 7).effectiveRetentionDays()).isEqualTo(7);
    }

    @Test
    @DisplayName("non-Enterprise cannot retain forever (<= 0 becomes the cap)")
    void nonEnterpriseNoInfinite() {
        assertThat(service(false, 0).effectiveRetentionDays()).isEqualTo(30);
        assertThat(service(false, -1).effectiveRetentionDays()).isEqualTo(30);
    }

    @Test
    @DisplayName("startup arming probes one row instead of counting the whole table")
    void armUsesBoundedExistenceQuery() {
        when(repository.findTopByOrderByTimestampDesc())
                .thenReturn(Optional.of(mock(PersistentAuditEvent.class)));

        service(true, 90).armIfRowsExist();

        verify(repository).findTopByOrderByTimestampDesc();
        verify(repository, never()).count();
    }

    @Test
    @DisplayName("startup arming leaves the scheduler untouched when no rows exist")
    void armSkipsWhenTableEmpty() {
        when(repository.findTopByOrderByTimestampDesc()).thenReturn(Optional.empty());
        TaskScheduler scheduler = mock(TaskScheduler.class);

        service(true, 90, scheduler).armIfRowsExist();

        verifyNoInteractions(scheduler);
    }

    @Test
    @DisplayName("retention sweep is registered as a daily fixed-rate task")
    void sweepUsesFixedRate() {
        TaskScheduler scheduler = mock(TaskScheduler.class);

        service(true, 90, scheduler).ensureScheduled();

        verify(scheduler)
                .scheduleAtFixedRate(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofDays(1)));
    }
}
