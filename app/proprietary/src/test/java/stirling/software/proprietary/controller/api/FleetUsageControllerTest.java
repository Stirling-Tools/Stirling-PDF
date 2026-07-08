package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.api.usage.FleetUsageStats;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class FleetUsageControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private UserRepository userRepository;
    @Mock private AuditConfigurationProperties auditConfig;

    private FleetUsageController controller;

    @BeforeEach
    void setUp() {
        controller = new FleetUsageController(auditRepository, userRepository, auditConfig);
    }

    @Test
    @DisplayName("deployed always reflects the user count")
    void deployedFromUserCount() {
        when(userRepository.count()).thenReturn(7L);
        when(auditConfig.isEnabled()).thenReturn(false);

        FleetUsageStats stats = controller.fleetStats();

        assertThat(stats.editorsDeployed()).isEqualTo(7L);
    }

    @Test
    @DisplayName("audit-derived figures are null when auditing is disabled")
    void auditOffYieldsNulls() {
        when(userRepository.count()).thenReturn(3L);
        when(auditConfig.isEnabled()).thenReturn(false);

        FleetUsageStats stats = controller.fleetStats();

        assertThat(stats.activeThisMonth()).isNull();
        assertThat(stats.pdfsProcessed()).isNull();
        verify(auditRepository, never())
                .countDistinctPrincipalsBySourceExcludingTypeAfter(
                        any(), any(), any(Instant.class));
        verify(auditRepository, never())
                .countByTypeInAndSourceAndTimestampAfter(anyList(), any(), any(Instant.class));
    }

    @Test
    @DisplayName("audit-derived figures come from the repository when auditing is enabled")
    void auditOnReadsRepository() {
        when(userRepository.count()).thenReturn(10L);
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditRepository.countDistinctPrincipalsBySourceExcludingTypeAfter(
                        eq("WEB"), eq("UI_DATA"), any(Instant.class)))
                .thenReturn(4L);
        when(auditRepository.countByTypeInAndSourceAndTimestampAfter(
                        anyList(), eq("WEB"), any(Instant.class)))
                .thenReturn(1234L);

        FleetUsageStats stats = controller.fleetStats();

        assertThat(stats.editorsDeployed()).isEqualTo(10L);
        assertThat(stats.activeThisMonth()).isEqualTo(4L);
        assertThat(stats.pdfsProcessed()).isEqualTo(1234L);
    }

    @Test
    @DisplayName("active editors are clamped to deployed (active is a subset)")
    void activeClampedToDeployed() {
        when(userRepository.count()).thenReturn(2L);
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditRepository.countDistinctPrincipalsBySourceExcludingTypeAfter(
                        eq("WEB"), eq("UI_DATA"), any(Instant.class)))
                .thenReturn(9L);
        when(auditRepository.countByTypeInAndSourceAndTimestampAfter(
                        anyList(), eq("WEB"), any(Instant.class)))
                .thenReturn(50L);

        FleetUsageStats stats = controller.fleetStats();

        assertThat(stats.activeThisMonth()).isEqualTo(2L);
    }
}
