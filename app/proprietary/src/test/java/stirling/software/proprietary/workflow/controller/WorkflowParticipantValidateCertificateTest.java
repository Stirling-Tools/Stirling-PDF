package stirling.software.proprietary.workflow.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class WorkflowParticipantValidateCertificateTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    private MockMvc mockMvc;

    private static final String VALID_TOKEN = "valid-share-token-abc123";
    private static final byte[] DUMMY_CERT = "dummy-cert-bytes".getBytes();

    @BeforeEach
    void setUp() {
        WorkflowParticipantController controller =
                new WorkflowParticipantController(
                        workflowSessionService,
                        participantRepository,
                        new ObjectMapper(),
                        metadataEncryptionService,
                        certificateSubmissionValidator);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private WorkflowParticipant activeParticipant() {
        WorkflowParticipant p = new WorkflowParticipant();
        // isExpired() returns false by default (no expiry date set)
        return p;
    }

    // ---- Happy path: valid cert ----

    @Test
    void validCertificate_returns200WithValidTrue() throws Exception {
        when(participantRepository.findByShareToken(VALID_TOKEN))
                .thenReturn(Optional.of(activeParticipant()));

        CertificateInfo info =
                new CertificateInfo(
                        "Test Signer",
                        "Test CA",
                        new Date(),
                        new Date(System.currentTimeMillis() + 365L * 24 * 60 * 60 * 1000),
                        true);
        when(certificateSubmissionValidator.validateAndExtractInfo(any(), eq("P12"), eq("secret")))
                .thenReturn(info);

        MockMultipartFile certFile =
                new MockMultipartFile(
                        "p12File", "cert.p12", "application/octet-stream", DUMMY_CERT);

        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(certFile)
                                .param("participantToken", VALID_TOKEN)
                                .param("certType", "P12")
                                .param("password", "secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.subjectName").value("Test Signer"));
    }

    // ---- Bad password / invalid cert → validator throws 400, we return 200 valid:false ----

    @Test
    void invalidCertificate_returns200WithValidFalseAndErrorMessage() throws Exception {
        when(participantRepository.findByShareToken(VALID_TOKEN))
                .thenReturn(Optional.of(activeParticipant()));

        when(certificateSubmissionValidator.validateAndExtractInfo(any(), any(), any()))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Invalid certificate password or corrupt keystore file"));

        MockMultipartFile certFile =
                new MockMultipartFile(
                        "p12File", "cert.p12", "application/octet-stream", DUMMY_CERT);

        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(certFile)
                                .param("participantToken", VALID_TOKEN)
                                .param("certType", "P12")
                                .param("password", "wrong"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(
                        jsonPath("$.error")
                                .value("Invalid certificate password or corrupt keystore file"));
    }

    // ---- No file → 400 bad request ----

    @Test
    void missingCertFile_returns400() throws Exception {
        when(participantRepository.findByShareToken(VALID_TOKEN))
                .thenReturn(Optional.of(activeParticipant()));

        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .param("participantToken", VALID_TOKEN)
                                .param("certType", "P12")
                                .param("password", "pass"))
                .andExpect(status().isBadRequest());
    }

    // ---- Invalid / expired token → 403 ----

    @Test
    void invalidToken_returns403() throws Exception {
        when(participantRepository.findByShareToken("bad-token")).thenReturn(Optional.empty());

        MockMultipartFile certFile =
                new MockMultipartFile(
                        "p12File", "cert.p12", "application/octet-stream", DUMMY_CERT);

        mockMvc.perform(
                        multipart("/api/v1/workflow/participant/validate-certificate")
                                .file(certFile)
                                .param("participantToken", "bad-token")
                                .param("certType", "P12")
                                .param("password", "pass"))
                .andExpect(status().isForbidden());
    }
}
