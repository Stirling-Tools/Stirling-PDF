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
import stirling.software.proprietary.model.api.documents.PortalReviewDocumentDto;

import tools.jackson.databind.json.JsonMapper;

/**
 * The Documents feed showed a policy run's internal steps as ordinary "API" traffic. They should
 * read as automation so a policy run isn't confused with a customer's own API integration.
 */
@ExtendWith(MockitoExtension.class)
class PortalDocumentsServiceTest {

    @Mock private PortalAuditReadService auditReadService;

    private PortalDocumentsService service;

    @BeforeEach
    void setUp() {
        service = new PortalDocumentsService(auditReadService, JsonMapper.builder().build());
    }

    private static PortalAuditEventRow row(long id, String data) {
        return new PortalAuditEventRow(
                id, "con.yoh13@gmail.com", AuditEventType.PDF_PROCESS.name(), data, Instant.now());
    }

    private PortalReviewDocumentDto onlyDoc(String data) {
        when(auditReadService.serverEvents()).thenReturn(List.of(row(1L, data)));
        return service.serverDocuments().getDocuments().get(0);
    }

    @Test
    void policyStepDocumentIsLabelledAutomation() {
        PortalReviewDocumentDto doc =
                onlyDoc(
                        "{\"path\":\"/api/v1/security/auto-redact\",\"automation\":true,"
                                + "\"__origin\":\"API\",\"files\":[{\"name\":\"mushroom life.pdf\","
                                + "\"type\":\"application/pdf\"}],\"statusCode\":200}");

        assertThat(doc.getName()).isEqualTo("mushroom life.pdf");
        assertThat(doc.getAction()).isEqualTo("Auto Redact");
        // Was product "API" (loopback used the API key); now clearly a policy automation step.
        assertThat(doc.getProduct()).isEqualTo("Automation");
        assertThat(doc.getSource()).isEqualTo("Policy automation");
    }

    @Test
    void directApiDocumentStaysApi() {
        PortalReviewDocumentDto doc =
                onlyDoc(
                        "{\"path\":\"/api/v1/misc/compress-pdf\",\"__origin\":\"API\","
                                + "\"files\":[{\"name\":\"a.pdf\",\"type\":\"application/pdf\"}],"
                                + "\"statusCode\":200}");

        assertThat(doc.getProduct()).isEqualTo("API");
        assertThat(doc.getSource()).isEqualTo("API integration");
    }

    @Test
    void apiDocumentIsAttributedToItsNamedKey() {
        PortalReviewDocumentDto doc =
                onlyDoc(
                        "{\"path\":\"/api/v1/misc/compress-pdf\",\"__origin\":\"API\","
                                + "\"__apiKeyLabel\":\"Production ingest (sk_demo0000)\","
                                + "\"files\":[{\"name\":\"a.pdf\",\"type\":\"application/pdf\"}],"
                                + "\"statusCode\":200}");

        // The specific key label surfaces as the source; product stays "API".
        assertThat(doc.getProduct()).isEqualTo("API");
        assertThat(doc.getSource()).isEqualTo("API key · Production ingest (sk_demo0000)");
    }
}
