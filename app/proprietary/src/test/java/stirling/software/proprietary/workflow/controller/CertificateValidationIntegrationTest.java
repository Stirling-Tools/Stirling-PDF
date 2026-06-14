package stirling.software.proprietary.workflow.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.util.Optional;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.service.PdfSigningService;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

import tools.jackson.databind.ObjectMapper;

/**
 * Integration test that wires the real {@link CertificateSubmissionValidator} into {@link
 * WorkflowParticipantController} and exercises it with the actual test-certificate files.
 *
 * <p>This fills the gap between the two unit-test layers:
 *
 * <ul>
 *   <li>{@link WorkflowParticipantValidateCertificateTest} — controller only, validator mocked
 *   <li>{@link stirling.software.proprietary.workflow.service.CertificateSubmissionValidatorTest} —
 *       validator only, certs generated programmatically
 * </ul>
 *
 * Here both layers run together against real .p12 / .jks files, so any field-name mismatch, routing
 * bug, or wiring issue between controller and validator is caught.
 *
 * <p>MIGRATION (Spring -> Quarkus): the former standalone-MockMvc setup is replaced by direct calls
 * on the JAX-RS handler (returns {@link Response}); the controller is wired by assigning its
 * package-private {@code @Inject} fields. Certificate uploads are supplied as RESTEasy Reactive
 * {@code FileUpload} stubs via {@link TestFileUploads}, and the {@code valid}/{@code error} fields
 * are read off the {@code CertificateValidationResponse} entity.
 */
@ExtendWith(MockitoExtension.class)
class CertificateValidationIntegrationTest {

    // Infrastructure mocks — not under test
    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;

    // Mock PdfSigningService so the test-sign step succeeds without a real PDF engine
    @Mock private PdfSigningService pdfSigningService;

    private WorkflowParticipantController controller;

    private static final String TOKEN = "integration-test-token";

    @BeforeEach
    void setUp() throws Exception {
        // Use the REAL validator wired with the mock signing service
        CertificateSubmissionValidator realValidator =
                new CertificateSubmissionValidator(pdfSigningService);

        controller = new WorkflowParticipantController();
        controller.workflowSessionService = workflowSessionService;
        controller.participantRepository = participantRepository;
        controller.objectMapper = new ObjectMapper();
        controller.metadataEncryptionService = metadataEncryptionService;
        controller.certificateSubmissionValidator = realValidator;

        // Return a non-expired participant for all tests
        WorkflowParticipant participant = new WorkflowParticipant();
        when(participantRepository.findByShareToken(TOKEN)).thenReturn(Optional.of(participant));

        // test-sign succeeds — only reached by valid-cert tests, lenient to avoid
        // UnnecessaryStubbingException on error-path tests (wrong password, expired, etc.)
        org.mockito.Mockito.lenient()
                .when(
                        pdfSigningService.signWithKeystore(
                                any(),
                                any(),
                                any(),
                                anyBoolean(),
                                isNull(),
                                anyString(),
                                isNull(),
                                isNull(),
                                anyBoolean()))
                .thenReturn(new byte[0]);
    }

    // ---- helpers ----

    private static byte[] loadCert(String filename) throws Exception {
        try (InputStream in =
                CertificateValidationIntegrationTest.class.getResourceAsStream(
                        "/test-certs/" + filename)) {
            if (in == null) throw new IllegalStateException("cert not found: " + filename);
            return in.readAllBytes();
        }
    }

    private static FileUpload p12Part(String filename) throws Exception {
        return TestFileUploads.of(loadCert(filename), filename, "application/octet-stream");
    }

    private static FileUpload jksPart(String filename) throws Exception {
        return TestFileUploads.of(loadCert(filename), filename, "application/octet-stream");
    }

    private static CertificateValidationResponse body(Response resp) {
        return (CertificateValidationResponse) resp.getEntity();
    }

    // ---- tests ----

    @Test
    void validP12_returnsValidTrueWithSubjectName() throws Exception {
        Response resp =
                controller.validateCertificate(
                        TOKEN, "P12", "testpass", p12Part("valid-test.p12"), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse info = body(resp);
        assertTrue(info.valid());
        assertNotNull(info.subjectName());
        assertFalse(info.subjectName().isEmpty());
        assertNotNull(info.notAfter());
        assertFalse(info.notAfter().isEmpty());
    }

    @Test
    void wrongPassword_returnsValidFalseWithErrorMessage() throws Exception {
        Response resp =
                controller.validateCertificate(
                        TOKEN, "P12", "wrongpassword", p12Part("valid-test.p12"), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse info = body(resp);
        assertFalse(info.valid());
        assertEquals("Invalid certificate password or corrupt keystore file", info.error());
    }

    @Test
    void expiredP12_returnsValidFalseWithExpiryMessage() throws Exception {
        Response resp =
                controller.validateCertificate(
                        TOKEN, "P12", "testpass", p12Part("expired-test.p12"), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse info = body(resp);
        assertFalse(info.valid());
        assertNotNull(info.error());
        assertTrue(info.error().contains("expired"));
    }

    @Test
    void notYetValidP12_returnsValidFalseWithNotYetValidMessage() throws Exception {
        Response resp =
                controller.validateCertificate(
                        TOKEN, "P12", "testpass", p12Part("not-yet-valid-test.p12"), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse info = body(resp);
        assertFalse(info.valid());
        assertNotNull(info.error());
        assertTrue(info.error().contains("not yet valid"));
    }

    @Test
    void validJks_returnsValidTrueWithSubjectName() throws Exception {
        Response resp =
                controller.validateCertificate(
                        TOKEN, "JKS", "jkspass", null, jksPart("valid-test.jks"));

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse info = body(resp);
        assertTrue(info.valid());
        assertNotNull(info.subjectName());
        assertFalse(info.subjectName().isEmpty());
    }

    @Test
    void serverCertType_returnsValidTrueWithoutFileUpload() throws Exception {
        Response resp = controller.validateCertificate(TOKEN, "SERVER", null, null, null);

        assertEquals(200, resp.getStatus());
        assertTrue(body(resp).valid());
    }
}
