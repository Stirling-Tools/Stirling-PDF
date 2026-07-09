package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.PortalAuditEventRow;
import stirling.software.proprietary.model.api.audit.InfraAuditEventDto;

import tools.jackson.databind.json.JsonMapper;

/**
 * The Infrastructure → Audit tab reproduces the reported bug: a policy run showed as a bare "Run"
 * row plus a separate "Auto Redact" row with no hint either belonged to a policy.
 */
@ExtendWith(MockitoExtension.class)
class PortalInfraAuditServiceTest {

    @Mock private PortalAuditReadService auditReadService;

    private PortalInfraAuditService service;

    @BeforeEach
    void setUp() {
        service = new PortalInfraAuditService(auditReadService, JsonMapper.builder().build());
    }

    private static PortalAuditEventRow row(long id, String data) {
        return new PortalAuditEventRow(
                id,
                "con.yoh13@gmail.com",
                AuditEventType.PDF_PROCESS.name(),
                data,
                Instant.parse("2026-07-09T10:18:24Z"));
    }

    private InfraAuditEventDto onlyEvent(String data) {
        when(auditReadService.serverEvents()).thenReturn(List.of(row(1L, data)));
        return service.serverAuditLog().getEvents().get(0);
    }

    @Test
    void policyDispatchShowsPolicyNameAndTheToolsItRuns() {
        InfraAuditEventDto e =
                onlyEvent(
                        "{\"path\":\"/api/v1/policies/run\",\"policyName\":\"Redaction\","
                                + "\"policySteps\":[\"/api/v1/security/auto-redact\","
                                + "\"/api/v1/misc/compress-pdf\"],\"statusCode\":202,"
                                + "\"latencyMs\":5}");

        // Was "Run" / "Run"; now names the policy and lists what it ran.
        assertThat(e.getAction()).isEqualTo("Redaction");
        assertThat(e.getCategory()).isEqualTo("processing");
        assertThat(e.getTarget()).isEqualTo("Auto Redact, Compress PDF");
    }

    @Test
    void internalPipelineStepIsFlaggedAsAutomation() {
        InfraAuditEventDto e =
                onlyEvent(
                        "{\"path\":\"/api/v1/security/auto-redact\",\"automation\":true,"
                                + "\"files\":[{\"name\":\"mushroom life.pdf\"}],"
                                + "\"statusCode\":200,\"latencyMs\":300}");

        // Was a bare "Auto Redact" indistinguishable from a direct user action.
        assertThat(e.getAction()).isEqualTo("Auto Redact (automation)");
        assertThat(e.getCategory()).isEqualTo("security");
        assertThat(e.getTarget()).isEqualTo("mushroom life.pdf");
    }

    @Test
    void adHocRunWithoutNameStillReadsAsPolicyRun() {
        InfraAuditEventDto e =
                onlyEvent(
                        "{\"path\":\"/api/v1/policies/run/stream\",\"statusCode\":200,"
                                + "\"latencyMs\":4}");

        assertThat(e.getAction()).isEqualTo("Policy run");
        assertThat(e.getTarget()).isEqualTo("Pipeline");
    }

    @Test
    void directToolRunIsUnchanged() {
        InfraAuditEventDto e =
                onlyEvent(
                        "{\"path\":\"/api/v1/misc/compress-pdf\","
                                + "\"files\":[{\"name\":\"a.pdf\"}],\"statusCode\":200,"
                                + "\"latencyMs\":100}");

        assertThat(e.getAction()).isEqualTo("Compress PDF");
        assertThat(e.getCategory()).isEqualTo("processing");
        assertThat(e.getTarget()).isEqualTo("a.pdf");
    }
}
