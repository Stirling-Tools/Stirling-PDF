package stirling.software.proprietary.workflow.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.workflow.dto.CertificateInfo;
import stirling.software.proprietary.workflow.dto.CertificateValidationResponse;
import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.SignatureSubmissionRequest;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
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
@RestController
@RequestMapping("/api/v1/workflow/participant")
@Tag(name = "Workflow Participant", description = "Participant Action APIs")
@RequiredArgsConstructor
public class WorkflowParticipantController {

    static final long MAX_CERTIFICATE_FILE_SIZE_BYTES = 5L * 1024 * 1024;

    private final WorkflowSessionService workflowSessionService;
    private final WorkflowParticipantRepository participantRepository;
    private final ObjectMapper objectMapper;
    private final MetadataEncryptionService metadataEncryptionService;
    private final CertificateSubmissionValidator certificateSubmissionValidator;

    private static final DateTimeFormatter ISO_UTC =
            DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC);

    @Operation(
            summary = "Get workflow session details by participant token",
            description = "Allows participants to view session details using their share token")
    @GetMapping(value = "/session", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WorkflowSessionResponse> getSessionByToken(
            @RequestParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        // Check if participant is expired
        if (participant.isExpired()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Participant access expired");
        }

        WorkflowSession session = participant.getWorkflowSession();

        // Completed and cancelled workflows remain readable for participants, but immutable.
        if (session.isActive()
                && (participant.getStatus() == ParticipantStatus.PENDING
                        || participant.getStatus() == ParticipantStatus.NOTIFIED)) {
            workflowSessionService.updateParticipantStatus(
                    participant.getId(), ParticipantStatus.VIEWED);
        }

        // Strip peer share tokens — a single participant token must not enumerate peer bearer
        // tokens (GHSA-qgg6-mxw4-xg62).
        return ResponseEntity.ok(WorkflowMapper.toResponse(session, null, false));
    }

    @Operation(
            summary = "Get participant details by token",
            description = "Returns participant-specific information")
    @GetMapping(value = "/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ParticipantResponse> getParticipantDetails(
            @RequestParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        if (participant.isExpired()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Participant access expired");
        }

        return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant, false));
    }

    @Operation(
            summary = "Submit signature (wet signature and/or certificate)",
            description =
                    "Participants submit their signature data and certificate information for signing")
    @PostMapping(
            value = "/submit-signature",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ParticipantResponse> submitSignature(
            @ModelAttribute SignatureSubmissionRequest request) {

        workflowSessionService.ensureSigningEnabled();

        if (request.getParticipantToken() == null || request.getParticipantToken().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Participant token is required");
        }

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(request.getParticipantToken())
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        // Check if participant can still submit
        if (participant.isExpired()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Participant access expired");
        }

        if (participant.hasCompleted()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Participant has already completed their action");
        }

        if (!participant.getWorkflowSession().isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Workflow session is no longer active");
        }

        try {
            // Build metadata map with certificate and wet signature data
            Map<String, Object> metadata = buildSubmissionMetadata(request);
            participant.setParticipantMetadata(metadata);

            // Update status to SIGNED
            participant.setStatus(ParticipantStatus.SIGNED);
            participant = participantRepository.save(participant);

            log.info(
                    "Participant {} submitted signature for session {}",
                    participant.getEmail(),
                    participant.getWorkflowSession().getSessionId());

            return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant, false));

        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error submitting signature for participant {}", participant.getEmail(), e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to submit signature", e);
        }
    }

    @Operation(
            summary = "Decline participation",
            description = "Participant declines to sign or participate in the workflow")
    @PostMapping(value = "/decline", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ParticipantResponse> declineParticipation(
            @RequestParam("token") @NotBlank String token,
            @RequestParam(value = "reason", required = false) @Size(max = 500) String reason) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        if (participant.isExpired()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Participant access expired");
        }

        if (participant.hasCompleted()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Participant has already completed their action");
        }

        if (!participant.getWorkflowSession().isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Workflow session is no longer active");
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

        participant = participantRepository.save(participant);

        log.info(
                "Participant {} declined workflow session {}",
                participant.getEmail(),
                participant.getWorkflowSession().getSessionId());

        return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant, false));
    }

    @Operation(
            summary = "Get original PDF for review",
            description = "Participant downloads the original document")
    @GetMapping(value = "/document", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> getDocument(@RequestParam("token") @NotBlank String token) {

        workflowSessionService.ensureSigningEnabled();

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        if (participant.isExpired()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Participant access expired");
        }

        try {
            WorkflowSession session = participant.getWorkflowSession();
            byte[] pdf = workflowSessionService.getOriginalFile(session.getSessionId());

            return ResponseEntity.ok()
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            ContentDisposition.attachment()
                                    .filename(session.getDocumentName(), StandardCharsets.UTF_8)
                                    .build()
                                    .toString())
                    .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                    .body(pdf);

        } catch (IOException e) {
            log.error("Error retrieving document for participant", e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve document", e);
        }
    }

    @Operation(
            summary = "Pre-validate a certificate before submission",
            description =
                    "Validates that the provided certificate is loadable, not expired, and can "
                            + "successfully sign a document. Returns validation details so the "
                            + "participant can confirm the correct certificate before committing.")
    @PostMapping(
            value = "/validate-certificate",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<CertificateValidationResponse> validateCertificate(
            @RequestParam("participantToken") @NotBlank String participantToken,
            @RequestParam("certType") String certType,
            @RequestParam(value = "password", required = false) String password,
            @RequestParam(value = "p12File", required = false) MultipartFile p12File,
            @RequestParam(value = "jksFile", required = false) MultipartFile jksFile) {

        workflowSessionService.ensureSigningEnabled();

        participantRepository
                .findByShareToken(participantToken)
                .filter(p -> !p.isExpired())
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.FORBIDDEN,
                                        "Invalid or expired participant token"));

        // Require a file for non-SERVER/non-USER_CERT types — this is a request error, not a
        // validation failure
        if (!"SERVER".equalsIgnoreCase(certType)
                && !"USER_CERT".equalsIgnoreCase(certType)
                && (p12File == null || p12File.isEmpty())
                && (jksFile == null || jksFile.isEmpty())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "No certificate file provided");
        }

        rejectMultipleCertificateFiles(p12File, jksFile);

        byte[] keystoreBytes;
        try {
            keystoreBytes =
                    readCertificateFile(p12File != null && !p12File.isEmpty() ? p12File : jksFile);
        } catch (IOException e) {
            log.error("Error reading certificate file during pre-validation", e);
            return ResponseEntity.ok(
                    new CertificateValidationResponse(
                            false,
                            null,
                            null,
                            null,
                            null,
                            false,
                            "Failed to read certificate file"));
        }

        try {
            CertificateInfo info =
                    certificateSubmissionValidator.validateAndExtractInfo(
                            keystoreBytes, certType, password);

            if (info == null) {
                // SERVER type — nothing to validate
                return ResponseEntity.ok(
                        new CertificateValidationResponse(
                                true, null, null, null, null, false, null));
            }

            return ResponseEntity.ok(
                    new CertificateValidationResponse(
                            true,
                            info.subjectName(),
                            info.issuerName(),
                            info.notAfter() != null ? info.notAfter().toInstant().toString() : null,
                            info.notBefore() != null
                                    ? info.notBefore().toInstant().toString()
                                    : null,
                            info.selfSigned(),
                            null));

        } catch (ResponseStatusException e) {
            // Validation failure — return 200 with valid:false so the frontend can display inline
            return ResponseEntity.ok(
                    new CertificateValidationResponse(
                            false, null, null, null, null, false, e.getReason()));
        }
    }

    /**
     * Builds metadata map from signature submission request. Includes certificate submission and
     * wet signature data.
     */
    private Map<String, Object> buildSubmissionMetadata(SignatureSubmissionRequest request)
            throws IOException {
        Map<String, Object> metadata = new HashMap<>();

        rejectMultipleCertificateFiles(request.getP12File(), request.getJksFile());
        byte[] p12Bytes = readCertificateFile(request.getP12File());
        byte[] jksBytes = readCertificateFile(request.getJksFile());

        // Validate certificate before storing — throws 400 if invalid, expired, or wrong password
        if (request.getCertType() != null && !"SERVER".equalsIgnoreCase(request.getCertType())) {
            byte[] keystoreBytes = p12Bytes != null ? p12Bytes : jksBytes;
            if (keystoreBytes != null) {
                certificateSubmissionValidator.validateAndExtractInfo(
                        keystoreBytes, request.getCertType(), request.getPassword());
            }
        }

        // Add certificate submission if provided
        if (request.getCertType() != null) {
            Map<String, Object> certSubmission = new HashMap<>();
            certSubmission.put("certType", request.getCertType());
            certSubmission.put(
                    "password", metadataEncryptionService.encrypt(request.getPassword()));
            certSubmission.put("showSignature", request.getShowSignature());
            certSubmission.put("pageNumber", request.getPageNumber());
            certSubmission.put("location", request.getLocation());
            certSubmission.put("reason", request.getReason());
            certSubmission.put("showLogo", request.getShowLogo());

            // Store the certificate keystores encrypted at rest.
            if (p12Bytes != null) {
                certSubmission.put("p12Keystore", metadataEncryptionService.encryptBytes(p12Bytes));
            }
            if (jksBytes != null) {
                certSubmission.put("jksKeystore", metadataEncryptionService.encryptBytes(jksBytes));
            }

            metadata.put("certificateSubmission", certSubmission);
        }

        // Add wet signatures data if provided - parse once and store as List directly
        if (request.getWetSignaturesData() != null && !request.getWetSignaturesData().isBlank()) {
            if (request.getWetSignaturesData().length() > 5 * 1024 * 1024) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Wet signatures data exceeds maximum allowed size");
            }
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> wetSigs =
                    objectMapper.readValue(
                            request.getWetSignaturesData(),
                            new TypeReference<java.util.List<Map<String, Object>>>() {});
            if (wetSigs.size() > WetSignatureMetadata.MAX_SIGNATURES_PER_PARTICIPANT) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Too many wet signatures submitted");
            }
            metadata.put("wetSignatures", wetSigs);
        }

        return metadata;
    }

    private void rejectMultipleCertificateFiles(MultipartFile p12File, MultipartFile jksFile) {
        if (p12File != null && !p12File.isEmpty() && jksFile != null && !jksFile.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Provide only one certificate file");
        }
    }

    private byte[] readCertificateFile(MultipartFile certificateFile) throws IOException {
        if (certificateFile == null || certificateFile.isEmpty()) {
            return null;
        }
        if (certificateFile.getSize() > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
            throw certificateFileTooLarge();
        }

        byte[] certificateBytes = certificateFile.getBytes();
        if (certificateBytes.length > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
            throw certificateFileTooLarge();
        }
        return certificateBytes;
    }

    private ResponseStatusException certificateFileTooLarge() {
        return new ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE, "Certificate file exceeds the 5 MiB limit");
    }
}
