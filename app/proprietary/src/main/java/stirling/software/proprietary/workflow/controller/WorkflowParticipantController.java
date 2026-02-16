package stirling.software.proprietary.workflow.controller;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.constraints.NotBlank;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.SignatureSubmissionRequest;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;
import stirling.software.proprietary.workflow.util.WorkflowMapper;

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

    private final WorkflowSessionService workflowSessionService;
    private final WorkflowParticipantRepository participantRepository;
    private final ObjectMapper objectMapper;

    @Operation(
            summary = "Get workflow session details by participant token",
            description = "Allows participants to view session details using their share token")
    @GetMapping(value = "/session", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WorkflowSessionResponse> getSessionByToken(
            @RequestParam("token") @NotBlank String token) {

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

        // Mark as viewed if not already
        if (participant.getStatus() == ParticipantStatus.PENDING
                || participant.getStatus() == ParticipantStatus.NOTIFIED) {
            workflowSessionService.updateParticipantStatus(
                    participant.getId(), ParticipantStatus.VIEWED);
        }

        WorkflowSession session = participant.getWorkflowSession();
        return ResponseEntity.ok(WorkflowMapper.toResponse(session));
    }

    @Operation(
            summary = "Get participant details by token",
            description = "Returns participant-specific information")
    @GetMapping(value = "/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ParticipantResponse> getParticipantDetails(
            @RequestParam("token") @NotBlank String token) {

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant));
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

            return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant));

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
            @RequestParam(value = "reason", required = false) String reason) {

        WorkflowParticipant participant =
                participantRepository
                        .findByShareToken(token)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Invalid or expired participant token"));

        if (participant.hasCompleted()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Participant has already completed their action");
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

        return ResponseEntity.ok(WorkflowMapper.toParticipantResponse(participant));
    }

    @Operation(
            summary = "Get original PDF for review",
            description = "Participant downloads the original document")
    @GetMapping(value = "/document", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> getDocument(@RequestParam("token") @NotBlank String token) {

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
                            "Content-Disposition",
                            "attachment; filename=\"" + session.getDocumentName() + "\"")
                    .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                    .body(pdf);

        } catch (IOException e) {
            log.error("Error retrieving document for participant", e);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve document", e);
        }
    }

    /**
     * Builds metadata map from signature submission request. Includes certificate submission and
     * wet signature data.
     */
    private Map<String, Object> buildSubmissionMetadata(SignatureSubmissionRequest request)
            throws IOException {
        Map<String, Object> metadata = new HashMap<>();

        // Add certificate submission if provided
        if (request.getCertType() != null) {
            Map<String, Object> certSubmission = new HashMap<>();
            certSubmission.put("certType", request.getCertType());
            certSubmission.put("password", request.getPassword());
            certSubmission.put("showSignature", request.getShowSignature());
            certSubmission.put("pageNumber", request.getPageNumber());
            certSubmission.put("location", request.getLocation());
            certSubmission.put("reason", request.getReason());
            certSubmission.put("showLogo", request.getShowLogo());

            // Store certificate files as base64
            if (request.getP12File() != null && !request.getP12File().isEmpty()) {
                certSubmission.put(
                        "p12Keystore",
                        java.util.Base64.getEncoder()
                                .encodeToString(request.getP12File().getBytes()));
            }
            if (request.getJksFile() != null && !request.getJksFile().isEmpty()) {
                certSubmission.put(
                        "jksKeystore",
                        java.util.Base64.getEncoder()
                                .encodeToString(request.getJksFile().getBytes()));
            }

            metadata.put("certificateSubmission", certSubmission);
        }

        // Add wet signatures data if provided - parse once and store as List directly
        if (request.getWetSignaturesData() != null && !request.getWetSignaturesData().isBlank()) {
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> wetSigs =
                    objectMapper.readValue(
                            request.getWetSignaturesData(),
                            new com.fasterxml.jackson.core.type.TypeReference<
                                    java.util.List<Map<String, Object>>>() {});
            metadata.put("wetSignatures", wetSigs);
        }

        return metadata;
    }
}
