package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

@ExtendWith(MockitoExtension.class)
class AuditCleanupServiceTest {

    private static final int BATCH_SIZE = 10_000;

    @Mock private PersistentAuditEventRepository auditRepository;

    @Mock private AuditConfigurationProperties auditConfig;

    private AuditCleanupService auditCleanupService;

    @BeforeEach
    void setUp() {
        auditCleanupService = new AuditCleanupService(auditRepository, auditConfig);
    }

    @Test
    void cleanupOldAuditEvents_whenAuditDisabled_doesNothing() {
        when(auditConfig.isEnabled()).thenReturn(false);

        auditCleanupService.cleanupOldAuditEvents();

        verify(auditConfig, never()).getRetentionDays();
        verifyNoInteractions(auditRepository);
    }

    @Test
    void cleanupOldAuditEvents_whenRetentionNonPositive_doesNothing() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(0);

        auditCleanupService.cleanupOldAuditEvents();

        verify(auditRepository, never()).findIdsForBatchDeletion(any(), any(Pageable.class));
        verify(auditRepository, never()).deleteAllByIdInBatch(any());
    }

    @Test
    void cleanupOldAuditEvents_whenBatchesExist_processesAll() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        List<Long> firstBatch =
                LongStream.rangeClosed(1, BATCH_SIZE).boxed().collect(Collectors.toList());
        List<Long> secondBatch = List.of(10001L, 10002L);

        when(auditRepository.findIdsForBatchDeletion(any(), any(Pageable.class)))
                .thenReturn(firstBatch, secondBatch, List.of());

        auditCleanupService.cleanupOldAuditEvents();

        verify(auditRepository, times(2)).findIdsForBatchDeletion(any(), any(Pageable.class));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> deletedBatches = ArgumentCaptor.forClass(List.class);
        verify(auditRepository, times(2)).deleteAllByIdInBatch(deletedBatches.capture());

        List<List<Long>> captured = deletedBatches.getAllValues();
        assertEquals(firstBatch, captured.get(0));
        assertEquals(secondBatch, captured.get(1));
    }

    @Test
    void cleanupOldAuditEvents_whenNoEventsFound_doesNotDelete() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(15);
        when(auditRepository.findIdsForBatchDeletion(any(), any(Pageable.class)))
                .thenReturn(List.of());

        auditCleanupService.cleanupOldAuditEvents();

        verify(auditRepository).findIdsForBatchDeletion(any(), any(Pageable.class));
        verify(auditRepository, never()).deleteAllByIdInBatch(any());
    }

    @Test
    void cleanupOldAuditEvents_whenRepositoryThrows_isHandled() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(20);
        when(auditRepository.findIdsForBatchDeletion(any(), any(Pageable.class)))
                .thenThrow(new RuntimeException("boom"));

        assertDoesNotThrow(() -> auditCleanupService.cleanupOldAuditEvents());

        verify(auditRepository).findIdsForBatchDeletion(any(), any(Pageable.class));
        verify(auditRepository, never()).deleteAllByIdInBatch(any());
    }
}
