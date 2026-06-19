package stirling.software.proprietary.workflow.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.Date;
import java.util.Optional;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

import tools.jackson.databind.ObjectMapper;

/**
 * MIGRATION (Spring -> Quarkus): {@code WorkflowParticipantController} is a JAX-RS resource using
 * field injection, so collaborators are wired by assigning the package-private {@code @Inject}
 * fields directly (no constructor). The handler binds RESTEasy Reactive {@code FileUpload} args
 * (stubbed via {@link TestFileUploads}) and returns {@link Response}.
 *
 * <p>Error semantics mirror the production handler: a missing file / invalid token throw {@code
 * WebApplicationException} (asserted with {@code assertThrows}), while a validator failure is
 * caught and returned as HTTP 200 with {@code valid:false}, so those are read off the {@code
 * CertificateValidationResponse} entity.
 */
@ExtendWith(MockitoExtension.class)
class WorkflowParticipantValidateCertificateTest {

    @Mock private WorkflowSessionService workflowSessionService;
    @Mock private WorkflowParticipantRepository participantRepository;
    @Mock private MetadataEncryptionService metadataEncryptionService;
    @Mock private CertificateSubmissionValidator certificateSubmissionValidator;

    private WorkflowParticipantController controller;

    private static final String VALID_TOKEN = "valid-share-token-abc123";
    private static final byte[] DUMMY_CERT = "dummy-cert-bytes".getBytes();

    @BeforeEach
    void setUp() {
        controller = new WorkflowParticipantController();
        controller.workflowSessionService = workflowSessionService;
        controller.participantRepository = participantRepository;
        controller.objectMapper = new ObjectMapper();
        controller.metadataEncryptionService = metadataEncryptionService;
        controller.certificateSubmissionValidator = certificateSubmissionValidator;
    }

    private WorkflowParticipant activeParticipant() {
        WorkflowParticipant p = new WorkflowParticipant();
        // isExpired() returns false by default (no expiry date set)
        return p;
    }

    private static FileUpload p12Upload() {
        return TestFileUploads.of(DUMMY_CERT, "cert.p12", "application/octet-stream");
    }

    // ---- Happy path: valid cert ----

    @Test
    void validCertificate_returns200WithValidTrue() {
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

        Response resp =
                controller.validateCertificate(VALID_TOKEN, "P12", "secret", p12Upload(), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse body = (CertificateValidationResponse) resp.getEntity();
        assertTrue(body.valid());
        assertEquals("Test Signer", body.subjectName());
    }

    // ---- Bad password / invalid cert -> validator throws 400, we return 200 valid:false ----

    @Test
    void invalidCertificate_returns200WithValidFalseAndErrorMessage() {
        when(participantRepository.findByShareToken(VALID_TOKEN))
                .thenReturn(Optional.of(activeParticipant()));

        when(certificateSubmissionValidator.validateAndExtractInfo(any(), any(), any()))
                .thenThrow(
                        new WebApplicationException(
                                "Invalid certificate password or corrupt keystore file",
                                Response.Status.BAD_REQUEST));

        Response resp =
                controller.validateCertificate(VALID_TOKEN, "P12", "wrong", p12Upload(), null);

        assertEquals(200, resp.getStatus());
        CertificateValidationResponse body = (CertificateValidationResponse) resp.getEntity();
        assertFalse(body.valid());
        assertEquals("Invalid certificate password or corrupt keystore file", body.error());
    }

    // ---- No file -> 400 bad request ----

    @Test
    void missingCertFile_returns400() {
        when(participantRepository.findByShareToken(VALID_TOKEN))
                .thenReturn(Optional.of(activeParticipant()));

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () ->
                                controller.validateCertificate(
                                        VALID_TOKEN, "P12", "pass", null, null));
        assertEquals(400, ex.getResponse().getStatus());
    }

    // ---- Invalid / expired token -> 403 ----

    @Test
    void invalidToken_returns403() {
        when(participantRepository.findByShareToken("bad-token")).thenReturn(Optional.empty());

        WebApplicationException ex =
                assertThrows(
                        WebApplicationException.class,
                        () ->
                                controller.validateCertificate(
                                        "bad-token", "P12", "pass", p12Upload(), null));
        assertEquals(403, ex.getResponse().getStatus());
    }
}
