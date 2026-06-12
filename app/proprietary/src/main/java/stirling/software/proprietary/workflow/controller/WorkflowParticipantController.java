package stirling.software.proprietary.workflow.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.CertificateSubmissionValidator;
import stirling.software.proprietary.workflow.service.MetadataEncryptionService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;
import stirling.software.proprietary.workflow.util.WorkflowMapper;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * REST controller for workflow participant actions. Handles participant-facing operations like
 * viewing sessions, submitting signatures, and updating participant status.
 *
 * <p>Access is controlled via share tokens, not requiring authentication.
 */
@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/workflow/participant")
@Tag(name = "Workflow Participant", description = "Participant Action APIs")
public class WorkflowParticipantController {

    @Inject WorkflowSessionService workflowSessionService;
    @Inject WorkflowParticipantRepository participantRepository;
    @Inject ObjectMapper objectMapper;
    @Inject MetadataEncryptionService metadataEncryptionService;
    @Inject CertificateSubmissionValidator certificateSubmissionValidator;

    private static final DateTimeFormatter ISO_UTC =
            DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC);

    @Operation(
            summary = "Get workflow session details by participant token",
            description = "Allows participants to view session details using their share token")
    @GET
    @jakarta.ws.rs.Path("/session")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getSessionByToken(@QueryParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Invalid or expired participant token",
                                                Response.Status.FORBIDDEN));

        // Check if participant is expired
        if (participant.isExpired()) {
            throw new WebApplicationException(
                    "Participant access expired", Response.Status.FORBIDDEN);
        }

        // Mark as viewed if not already
        if (participant.getStatus() == ParticipantStatus.PENDING
                || participant.getStatus() == ParticipantStatus.NOTIFIED) {
            workflowSessionService.updateParticipantStatus(
                    participant.getId(), ParticipantStatus.VIEWED);
        }

        WorkflowSession session = participant.getWorkflowSession();
        // Strip peer share tokens — a single participant token must not enumerate peer bearer
        // tokens (GHSA-qgg6-mxw4-xg62).
        return Response.ok(WorkflowMapper.toResponse(session, null, false)).build();
    }

    @Operation(
            summary = "Get participant details by token",
            description = "Returns participant-specific information")
    @GET
    @jakarta.ws.rs.Path("/details")
    @Produces(MediaType.APPLICATION_JSON)
    public Response getParticipantDetails(@QueryParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Invalid or expired participant token",
                                                Response.Status.FORBIDDEN));

        return Response.ok(WorkflowMapper.toParticipantResponse(participant, false)).build();
    }

    @Operation(
            summary = "Submit signature (wet signature and/or certificate)",
            description =
                    "Participants submit their signature data and certificate information for signing")
    @POST
    @jakarta.ws.rs.Path("/submit-signature")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Response submitSignature(
            @RestForm("certType") String certType,
            @RestForm("password") String password,
            @RestForm("p12File") FileUpload p12FileUpload,
            @RestForm("jksFile") FileUpload jksFileUpload,
            @RestForm("showSignature") Boolean showSignature,
            @RestForm("pageNumber") Integer pageNumber,
            @RestForm("location") String location,
            @RestForm("reason") String reason,
            @RestForm("showLogo") Boolean showLogo,
            @RestForm("wetSignaturesData") String wetSignaturesData,
            @RestForm("participantToken") String participantToken) {

        workflowSessionService.ensureSigningEnabled();

        if (participantToken == null || participantToken.isBlank()) {
            throw new WebApplicationException(
                    "Participant token is required", Response.Status.BAD_REQUEST);
        }

        MultipartFile p12File = FileUploadMultipartFile.of(p12FileUpload);
        MultipartFile jksFile = FileUploadMultipartFile.of(jksFileUpload);

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(participantToken)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Invalid or expired participant token",
                                                Response.Status.FORBIDDEN));

        // Check if participant can still submit
        if (participant.isExpired()) {
            throw new WebApplicationException(
                    "Participant access expired", Response.Status.FORBIDDEN);
        }

        if (participant.hasCompleted()) {
            throw new WebApplicationException(
                    "Participant has already completed their action", Response.Status.BAD_REQUEST);
        }

        if (!participant.getWorkflowSession().isActive()) {
            throw new WebApplicationException(
                    "Workflow session is no longer active", Response.Status.BAD_REQUEST);
        }

        try {
            // Build metadata map with certificate and wet signature data
            Map<String, Object> metadata =
                    buildSubmissionMetadata(
                            certType,
                            password,
                            p12File,
                            jksFile,
                            showSignature,
                            pageNumber,
                            location,
                            reason,
                            showLogo,
                            wetSignaturesData);
            participant.setParticipantMetadata(metadata);

            // Update status to SIGNED
            participant.setStatus(ParticipantStatus.SIGNED);
            participantRepository.persist(participant);

            log.info(
                    "Participant {} submitted signature for session {}",
                    participant.getEmail(),
                    participant.getWorkflowSession().getSessionId());

            return Response.ok(WorkflowMapper.toParticipantResponse(participant, false)).build();

        } catch (WebApplicationException e) {
            // CertificateSubmissionValidator now throws WebApplicationException on validation
            // failure (post Spring->Quarkus migration); propagate as-is.
            throw e;
        } catch (Exception e) {
            log.error("Error submitting signature for participant {}", participant.getEmail(), e);
            throw new WebApplicationException(
                    "Failed to submit signature", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(
            summary = "Decline participation",
            description = "Participant declines to sign or participate in the workflow")
    @POST
    @jakarta.ws.rs.Path("/decline")
    @Produces(MediaType.APPLICATION_JSON)
    public Response declineParticipation(
            @RestForm("token") @NotBlank String token,
            @RestForm("reason") @Size(max = 500) String reason) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Invalid or expired participant token",
                                                Response.Status.FORBIDDEN));

        if (participant.hasCompleted()) {
            throw new WebApplicationException(
                    "Participant has already completed their action", Response.Status.BAD_REQUEST);
        }

        // Update status to DECLINED
        participant.setStatus(ParticipantStatus.DECLINED);

        // Add decline reason to notifications
        if (reason != null && !reason.isBlank()) {
            workflowSessionService.addParticipantNotification(
                    participant.getId(), "Declined: " + reason);
        } else {
            workflowSessionService.addParticipantNotification(
                    participant.getId(), "Declined participation");
        }

        participantRepository.persist(participant);

        log.info(
                "Participant {} declined workflow session {}",
                participant.getEmail(),
                participant.getWorkflowSession().getSessionId());

        return Response.ok(WorkflowMapper.toParticipantResponse(participant, false)).build();
    }

    @Operation(
            summary = "Get original PDF for review",
            description = "Participant downloads the original document")
    @GET
    @jakarta.ws.rs.Path("/document")
    @Produces("application/pdf")
    public Response getDocument(@QueryParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "Invalid or expired participant token",
                                                Response.Status.FORBIDDEN));

        if (participant.isExpired()) {
            throw new WebApplicationException(
                    "Participant access expired", Response.Status.FORBIDDEN);
        }

        try {
            WorkflowSession session = participant.getWorkflowSession();
            byte[] pdf = workflowSessionService.getOriginalFile(session.getSessionId());

            return Response.ok(pdf, "application/pdf")
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            contentDispositionAttachment(session.getDocumentName()))
                    .build();

        } catch (IOException e) {
            log.error("Error retrieving document for participant", e);
            throw new WebApplicationException(
                    "Failed to retrieve document", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    @Operation(
            summary = "Pre-validate a certificate before submission",
            description =
                    "Validates that the provided certificate is loadable, not expired, and can "
                            + "successfully sign a document. Returns validation details so the "
                            + "participant can confirm the correct certificate before committing.")
    @POST
    @jakarta.ws.rs.Path("/validate-certificate")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Response validateCertificate(
            @RestForm("participantToken") @NotBlank String participantToken,
            @RestForm("certType") String certType,
            @RestForm("password") String password,
            @RestForm("p12File") FileUpload p12FileUpload,
            @RestForm("jksFile") FileUpload jksFileUpload) {

        workflowSessionService.ensureSigningEnabled();

        MultipartFile p12File = FileUploadMultipartFile.of(p12FileUpload);
        MultipartFile jksFile = FileUploadMultipartFile.of(jksFileUpload);

        participantRepository
                .findByShareToken(participantToken)
                .filter(p -> !p.isExpired())
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "Invalid or expired participant token",
                                        Response.Status.FORBIDDEN));

        // Require a file for non-SERVER/non-USER_CERT types — this is a request error, not a
        // validation failure
        if (!"SERVER".equalsIgnoreCase(certType)
                && !"USER_CERT".equalsIgnoreCase(certType)
                && (p12File == null || p12File.isEmpty())
                && (jksFile == null || jksFile.isEmpty())) {
            throw new WebApplicationException(
                    "No certificate file provided", Response.Status.BAD_REQUEST);
        }

        try {
            byte[] keystoreBytes = null;
            if (p12File != null && !p12File.isEmpty()) {
                keystoreBytes = p12File.getBytes();
            } else if (jksFile != null && !jksFile.isEmpty()) {
                keystoreBytes = jksFile.getBytes();
            }

            CertificateInfo info =
                    certificateSubmissionValidator.validateAndExtractInfo(
                            keystoreBytes, certType, password);

            if (info == null) {
                // SERVER type — nothing to validate
                return Response.ok(
                                new CertificateValidationResponse(
                                        true, null, null, null, null, false, null))
                        .build();
            }

            return Response.ok(
                            new CertificateValidationResponse(
                                    true,
                                    info.subjectName(),
                                    info.issuerName(),
                                    info.notAfter() != null
                                            ? info.notAfter().toInstant().toString()
                                            : null,
                                    info.notBefore() != null
                                            ? info.notBefore().toInstant().toString()
                                            : null,
                                    info.selfSigned(),
                                    null))
                    .build();

        } catch (WebApplicationException e) {
            // Validation failure — return 200 with valid:false so the frontend can display inline.
            // CertificateSubmissionValidator throws WebApplicationException (post migration); use
            // its message as the inline error reason.
            return Response.ok(
                            new CertificateValidationResponse(
                                    false, null, null, null, null, false, e.getMessage()))
                    .build();
        } catch (IOException e) {
            log.error("Error reading certificate file during pre-validation", e);
            return Response.ok(
                            new CertificateValidationResponse(
                                    false,
                                    null,
                                    null,
                                    null,
                                    null,
                                    false,
                                    "Failed to read certificate file"))
                    .build();
        }
    }

    /**
     * Builds the {@code Content-Disposition: attachment} header value with an RFC 5987 UTF-8
     * encoded filename, mirroring Spring's {@code ContentDisposition.attachment().filename(name,
     * UTF_8)}.
     */
    private static String contentDispositionAttachment(String filename) {
        String encoded =
                java.net.URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encoded;
    }

    /**
     * Builds metadata map from signature submission request fields. Includes certificate submission
     * and wet signature data.
     */
    private Map<String, Object> buildSubmissionMetadata(
            String certType,
            String password,
            MultipartFile p12File,
            MultipartFile jksFile,
            Boolean showSignature,
            Integer pageNumber,
            String location,
            String reason,
            Boolean showLogo,
            String wetSignaturesData)
            throws IOException {
        Map<String, Object> metadata = new HashMap<>();

        // Validate certificate before storing — throws 400 if invalid, expired, or wrong password
        if (certType != null && !"SERVER".equalsIgnoreCase(certType)) {
            byte[] keystoreBytes = null;
            if (p12File != null && !p12File.isEmpty()) {
                keystoreBytes = p12File.getBytes();
            } else if (jksFile != null && !jksFile.isEmpty()) {
                keystoreBytes = jksFile.getBytes();
            }
            if (keystoreBytes != null) {
                certificateSubmissionValidator.validateAndExtractInfo(
                        keystoreBytes, certType, password);
            }
        }

        // Add certificate submission if provided
        if (certType != null) {
            Map<String, Object> certSubmission = new HashMap<>();
            certSubmission.put("certType", certType);
            certSubmission.put("password", metadataEncryptionService.encrypt(password));
            certSubmission.put("showSignature", showSignature);
            certSubmission.put("pageNumber", pageNumber);
            certSubmission.put("location", location);
            certSubmission.put("reason", reason);
            certSubmission.put("showLogo", showLogo);

            // Store certificate files as base64
            if (p12File != null && !p12File.isEmpty()) {
                certSubmission.put(
                        "p12Keystore",
                        java.util.Base64.getEncoder().encodeToString(p12File.getBytes()));
            }
            if (jksFile != null && !jksFile.isEmpty()) {
                certSubmission.put(
                        "jksKeystore",
                        java.util.Base64.getEncoder().encodeToString(jksFile.getBytes()));
            }

            metadata.put("certificateSubmission", certSubmission);
        }

        // Add wet signatures data if provided - parse once and store as List directly
        if (wetSignaturesData != null && !wetSignaturesData.isBlank()) {
            if (wetSignaturesData.length() > 5 * 1024 * 1024) {
                throw new WebApplicationException(
                        "Wet signatures data exceeds maximum allowed size",
                        Response.Status.BAD_REQUEST);
            }
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> wetSigs =
                    objectMapper.readValue(
                            wetSignaturesData,
                            new TypeReference<java.util.List<Map<String, Object>>>() {});
            if (wetSigs.size() > WetSignatureMetadata.MAX_SIGNATURES_PER_PARTICIPANT) {
                throw new WebApplicationException(
                        "Too many wet signatures submitted", Response.Status.BAD_REQUEST);
            }
            metadata.put("wetSignatures", wetSigs);
        }

        return metadata;
    }
}
