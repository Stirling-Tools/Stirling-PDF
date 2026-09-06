package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
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

    private static final Instant NOW = Instant.now();

    private static PortalAuditEventRow row(long id, String data) {
        return rowAt(id, data, NOW.minusSeconds(60));
    }

    private static PortalAuditEventRow rowAt(long id, String data, Instant at) {
        return new PortalAuditEventRow(
                id, "con.yoh13@gmail.com", AuditEventType.PDF_PROCESS.name(), data, at);
    }

    private InfraAuditEventDto onlyEvent(String data) {
        when(auditReadService.serverEvents()).thenReturn(List.of(row(1L, data)));
        return service.serverAuditLog().getEvents().get(0);
    }

    @Test
    void policyDispatchShowsPolicyNameAndTheToolsItRuns() {
        String data =
                "{\"path\":\"/api/v1/policies/run\",\"policyName\":\"Redaction\","
                        + "\"policySteps\":[\"/api/v1/security/auto-redact\","
                        + "\"/api/v1/misc/compress-pdf\"],\"statusCode\":202,"
                        + "\"latencyMs\":5}";
        when(auditReadService.serverEvents()).thenReturn(List.of(row(1L, data)));

        var resp = service.serverAuditLog();
        InfraAuditEventDto e = resp.getEvents().get(0);

        // Was "Run" / "Run" under "processing"; now names the policy, lists what it ran, and
        // badges as its own "policy" category with its own summary count.
        assertThat(e.getAction()).isEqualTo("Redaction");
        assertThat(e.getCategory()).isEqualTo("policy");
        assertThat(e.getTarget()).isEqualTo("Auto Redact, Compress PDF");
        assertThat(resp.getSummary().getPolicy()).isEqualTo(1);
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
    void internalStepCarryingItsPolicyNameLinksBackToThePolicy() {
        InfraAuditEventDto e =
                onlyEvent(
                        "{\"path\":\"/api/v1/security/auto-redact\",\"automation\":true,"
                                + "\"policyName\":\"Redaction demo\",\"files\":[{\"name\":"
                                + "\"demo.pdf\"}],\"statusCode\":200}");

        // The forwarded policy name makes the step's origin unmistakable.
        assertThat(e.getAction()).isEqualTo("Auto Redact (policy: Redaction demo)");
        assertThat(e.getCategory()).isEqualTo("security");
        assertThat(e.getTarget()).isEqualTo("demo.pdf");
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

    /**
     * A spoofed X-Stirling-Policy-Name header lands in audit data as policyName on a direct tool
     * call (no automation marker, non-run path). It must NOT flip the row into a "policy" dispatch
     * that overwrites the real action and hides the affected file - only a real /policies/.../run
     * URI does that.
     */
    @Test
    void forgedPolicyNameOnDirectCallCannotMaskTheRealAction() {
        when(auditReadService.serverEvents())
                .thenReturn(
                        List.of(
                                row(
                                        1L,
                                        "{\"path\":\"/api/v1/security/remove-password\","
                                                + "\"policyName\":\"Daily cleanup\",\"files\":"
                                                + "[{\"name\":\"secret.pdf\"}],\"statusCode\":200}")));

        var resp = service.serverAuditLog();
        InfraAuditEventDto e = resp.getEvents().get(0);

        // Real op and file stay visible; the forged name does not become the action or category.
        assertThat(e.getAction()).isEqualTo("Remove Password");
        assertThat(e.getCategory()).isEqualTo("security");
        assertThat(e.getTarget()).isEqualTo("secret.pdf");
        assertThat(resp.getSummary().getPolicy()).isEqualTo(0);
    }

    @Test
    void summaryCountsTheLastDayNotJustTheReturnedPage() {
        String data = "{\"path\":\"/api/v1/misc/compress-pdf\",\"statusCode\":200}";
        List<PortalAuditEventRow> rows = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            rows.add(rowAt(i, data, NOW.minusSeconds(60L * (i + 1))));
        }
        when(auditReadService.serverEvents()).thenReturn(rows);

        var resp = service.serverAuditLog();

        assertThat(resp.getEvents()).hasSize(40);
        assertThat(resp.getSummary().getTotalEvents()).isEqualTo(60);
        assertThat(resp.getSummary().getProcessing()).isEqualTo(60);
    }

    @Test
    void summaryLeavesOutEventsOlderThanADay() {
        String data = "{\"path\":\"/api/v1/misc/compress-pdf\",\"statusCode\":200}";
        when(auditReadService.serverEvents())
                .thenReturn(
                        List.of(
                                rowAt(1L, data, NOW.minusSeconds(60)),
                                rowAt(2L, data, NOW.minus(Duration.ofHours(25))),
                                rowAt(3L, data, NOW.minus(Duration.ofDays(9)))));

        var resp = service.serverAuditLog();

        assertThat(resp.getEvents()).hasSize(3);
        assertThat(resp.getSummary().getTotalEvents()).isEqualTo(1);
        assertThat(resp.getSummary().getProcessing()).isEqualTo(1);
    }
}
