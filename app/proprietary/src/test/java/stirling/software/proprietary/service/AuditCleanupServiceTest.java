package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

class AuditCleanupServiceTest {

    private final PersistentAuditEventRepository repository =
            mock(PersistentAuditEventRepository.class);

    private AuditCleanupService service(boolean runningEE, int retentionDays) {
        ApplicationProperties props = new ApplicationProperties();
        var audit = props.getPremium().getEnterpriseFeatures().getAudit();
        audit.setEnabled(true);
        audit.setRetentionDays(retentionDays);
        return new AuditCleanupService(
                repository, new AuditConfigurationProperties(props), runningEE);
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
}
