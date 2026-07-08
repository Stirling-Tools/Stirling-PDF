package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
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

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.audit.AuditLevel;
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
    @DisplayName("deployed reflects the user count, excluding the internal API user")
    void deployedFromUserCount() {
        when(userRepository.countByUsernameNot(anyString())).thenReturn(7L);
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(false);

        FleetUsageStats stats = controller.fleetStats();

        assertThat(stats.editorsDeployed()).isEqualTo(7L);
        verify(userRepository).countByUsernameNot(Role.INTERNAL_API_USER.getRoleId());
    }

    @Test
    @DisplayName("audit-derived figures are null when auditing is below STANDARD")
    void auditOffYieldsNulls() {
        when(userRepository.countByUsernameNot(anyString())).thenReturn(3L);
        // Covers both disabled and the enabled-but-level=OFF/BASIC misconfig: isLevelEnabled
        // is false, so no events can exist and we must report N/A, not a 0 from an empty table.
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(false);

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
        when(userRepository.countByUsernameNot(anyString())).thenReturn(10L);
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
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
        when(userRepository.countByUsernameNot(anyString())).thenReturn(2L);
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
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
