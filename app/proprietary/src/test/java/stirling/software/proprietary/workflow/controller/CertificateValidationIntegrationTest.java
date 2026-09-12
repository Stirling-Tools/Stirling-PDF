package stirling.software.proprietary.workflow.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.InputStream;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.service.PdfSigningService;
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
 */
@ExtendWith(MockitoExtension.class)
class CertificateValidationIntegrationTest {

    // Infrastructure mocks — not under test
    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;

    // Mock PdfSigningService so the test-sign step succeeds without a real PDF engine
    @Mock private PdfSigningService pdfSigningService;

    private MockMvc mockMvc;

    private static final String TOKEN = "integration-test-token";

    @BeforeEach
    void setUp() throws Exception {
        // Use the REAL validator wired with the mock signing service
        CertificateSubmissionValidator realValidator =
                new CertificateSubmissionValidator(pdfSigningService);

        WorkflowParticipantController controller =
                new WorkflowParticipantController(
                        workflowSessionService,
                        participantRepository,
                        new ObjectMapper(),
                        metadataEncryptionService,
                        realValidator);

        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

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
                                anyBoolean(),
                                isNull(),
                                isNull(),
                                isNull(),
                                isNull()))
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

    private static MockMultipartFile p12Part(String filename) throws Exception {
        return new MockMultipartFile(
                "p12File", filename, "application/octet-stream", loadCert(filename));
    }

    private static MockMultipartFile jksPart(String filename) throws Exception {
        return new MockMultipartFile(
                "jksFile", filename, "application/octet-stream", loadCert(filename));
    }

    // ---- tests ----

    @Test
    void validP12_returnsValidTrueWithSubjectName() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(p12Part("valid-test.p12"))
                                .param("participantToken", TOKEN)
                                .param("certType", "P12")
                                .param("password", "testpass"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.subjectName").isNotEmpty())
                .andExpect(jsonPath("$.notAfter").isNotEmpty());
    }

    @Test
    void wrongPassword_returnsValidFalseWithErrorMessage() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(p12Part("valid-test.p12"))
                                .param("participantToken", TOKEN)
                                .param("certType", "P12")
                                .param("password", "wrongpassword"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(
                        jsonPath("$.error")
                                .value("Invalid certificate password or corrupt keystore file"));
    }

    @Test
    void expiredP12_returnsValidFalseWithExpiryMessage() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(p12Part("expired-test.p12"))
                                .param("participantToken", TOKEN)
                                .param("certType", "P12")
                                .param("password", "testpass"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(
                        jsonPath("$.error").value(org.hamcrest.Matchers.containsString("expired")));
    }

    @Test
    void notYetValidP12_returnsValidFalseWithNotYetValidMessage() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(p12Part("not-yet-valid-test.p12"))
                                .param("participantToken", TOKEN)
                                .param("certType", "P12")
                                .param("password", "testpass"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(
                        jsonPath("$.error")
                                .value(org.hamcrest.Matchers.containsString("not yet valid")));
    }

    @Test
    void validJks_returnsValidTrueWithSubjectName() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(jksPart("valid-test.jks"))
                                .param("participantToken", TOKEN)
                                .param("certType", "JKS")
                                .param("password", "jkspass"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.subjectName").isNotEmpty());
    }

    @Test
    void serverCertType_returnsValidTrueWithoutFileUpload() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .param("participantToken", TOKEN)
                                .param("certType", "SERVER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
    }
}
