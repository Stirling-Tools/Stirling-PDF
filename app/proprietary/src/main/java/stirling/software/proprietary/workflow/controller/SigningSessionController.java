package stirling.software.proprietary.workflow.controller;

import java.security.Principal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.constraints.NotBlank;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.service.SigningFinalizationService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

@Slf4j
@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs - Signing Workflows")
@RequiredArgsConstructor
public class SigningSessionController {

    private final WorkflowSessionService workflowSessionService;
    private final UserService userService;
    private final SigningFinalizationService signingFinalizationService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Operation(summary = "List all signing sessions for current user")
    @Transactional(readOnly = true)
    @GetMapping(value = "/cert-sign/sessions")
    public ResponseEntity<?> listSessions(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            List<stirling.software.proprietary.workflow.model.WorkflowSession> sessions =
                    workflowSessionService.listUserSessions(user);
            List<stirling.software.proprietary.workflow.dto.WorkflowSessionResponse> responses =
                    sessions.stream()
                            .map(
                                    stirling.software.proprietary.workflow.util.WorkflowMapper
                                            ::toResponse)
                            .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(responses);
        } catch (Exception e) {
            log.error("Error listing sessions for user {}", principal.getName(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error listing sessions");
        }
    }

    @PostMapping(
            consumes = {MediaType.MULTIPART_FORM_DATA_VALUE},
            value = "/cert-sign/sessions",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create a shared signing session",
            description =
                    "Starts a collaboration session, distributes share links, and optionally notifies"
                            + " participants. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> createSession(
            @org.springframework.web.bind.annotation.RequestParam("file")
                    org.springframework.web.multipart.MultipartFile file,
            @ModelAttribute WorkflowCreationRequest request,
            Principal principal)
            throws Exception {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }

        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session = workflowSessionService.createSession(owner, file, request);
            return ResponseEntity.ok(
                    stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(session));
        } catch (Exception e) {
            log.error("Error creating signing session", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }

    @Operation(summary = "Fetch signing session details")
    @Transactional(readOnly = true)
    @GetMapping(value = "/cert-sign/sessions/{sessionId}")
    public ResponseEntity<?> getSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session = workflowSessionService.getSessionForOwner(sessionId, owner);
            // Include wet signatures in response for owner preview
            return ResponseEntity.ok(
                    stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(
                            session, objectMapper));
        } catch (Exception e) {
            log.error("Error fetching session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Access denied or session not found");
        }
    }

    @Operation(summary = "Delete a signing session")
    @DeleteMapping(value = "/cert-sign/sessions/{sessionId}")
    public ResponseEntity<?> deleteSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.deleteSession(sessionId, owner);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("Error deleting session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot delete session: " + e.getMessage());
        }
    }

    @Operation(summary = "Add participants to an existing session")
    @PostMapping(value = "/cert-sign/sessions/{sessionId}/participants")
    public ResponseEntity<?> addParticipants(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @RequestBody List<ParticipantRequest> participants,
            Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.addParticipants(sessionId, participants, owner);
            WorkflowSession session = workflowSessionService.getSessionForOwner(sessionId, owner);
            return ResponseEntity.ok(
                    stirling.software.proprietary.workflow.util.WorkflowMapper.toResponse(session));
        } catch (Exception e) {
            log.error("Error adding participants to session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot add participants: " + e.getMessage());
        }
    }

    @Operation(summary = "Remove a participant from a session")
    @DeleteMapping(value = "/cert-sign/sessions/{sessionId}/participants/{participantId}")
    public ResponseEntity<?> removeParticipant(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @PathVariable("participantId") Long participantId,
            Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User owner = getCurrentUser(principal);
            workflowSessionService.removeParticipant(sessionId, participantId, owner);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("Error removing participant {} from session {}", participantId, sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot remove participant: " + e.getMessage());
        }
    }

    @Operation(summary = "Get session PDF for participant view")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}/pdf")
    public ResponseEntity<byte[]> getSessionPdf(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            byte[] pdfBytes = workflowSessionService.getOriginalFile(sessionId);
            return WebResponseUtils.bytesToWebResponse(pdfBytes, "document.pdf");
        } catch (Exception e) {
            log.error("Error fetching PDF for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @PostMapping(value = "/cert-sign/sessions/{sessionId}/finalize")
    @Operation(
            summary = "Finalize signing session",
            description =
                    "Applies collected wet signatures and digital certificates, then returns the"
                            + " signed document.")
    @StandardPdfResponse
    public ResponseEntity<byte[]> finalizeSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal)
            throws Exception {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            User owner = getCurrentUser(principal);
            WorkflowSession session =
                    workflowSessionService.getSessionWithParticipantsForOwner(sessionId, owner);

            byte[] originalPdf = workflowSessionService.getOriginalFile(sessionId);
            byte[] pdf = signingFinalizationService.finalizeDocument(session, originalPdf);

            String filename = session.getDocumentName().replace(".pdf", "") + "_shared_signed.pdf";
            workflowSessionService.storeProcessedFile(session, pdf, filename);
            workflowSessionService.finalizeSession(sessionId, owner);
            workflowSessionService.deleteOriginalFile(session);

            try {
                signingFinalizationService.clearSensitiveMetadata(session);
            } catch (Exception e) {
                log.error(
                        "Failed to clear sensitive metadata for session {}: {}",
                        sessionId,
                        e.getMessage());
                // Don't fail the finalization if cleanup fails
            }

            return WebResponseUtils.bytesToWebResponse(pdf, filename);
        } catch (Exception e) {
            log.error("Error finalizing session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @Operation(summary = "Get signed PDF from finalized session")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}/signed-pdf")
    @StandardPdfResponse
    public ResponseEntity<byte[]> getSignedPdf(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User owner = getCurrentUser(principal);
            byte[] signedPdf = workflowSessionService.getProcessedFile(sessionId, owner);
            if (signedPdf == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body("Session not finalized".getBytes());
            }
            WorkflowSession session = workflowSessionService.getSessionForOwner(sessionId, owner);
            return WebResponseUtils.bytesToWebResponse(
                    signedPdf,
                    GeneralUtils.generateFilename(session.getDocumentName(), "_shared_signed.pdf"));
        } catch (Exception e) {
            log.error("Error fetching signed PDF for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    // ===== SIGN REQUESTS (Participant View) =====

    @Operation(summary = "List sign requests for authenticated user")
    @Transactional(readOnly = true)
    @GetMapping(value = "/cert-sign/sign-requests")
    public ResponseEntity<?> listSignRequests(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            return ResponseEntity.ok(workflowSessionService.listSignRequests(user));
        } catch (Exception e) {
            log.error("Error listing sign requests for user {}", principal.getName(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Cannot list sign requests: " + e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    @Operation(summary = "Get sign request detail for participant")
    @GetMapping(value = "/cert-sign/sign-requests/{sessionId}")
    public ResponseEntity<?> getSignRequestDetail(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            return ResponseEntity.ok(workflowSessionService.getSignRequestDetail(sessionId, user));
        } catch (Exception e) {
            log.error("Error fetching sign request detail for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Access denied or sign request not found: " + e.getMessage());
        }
    }

    @Operation(summary = "Get document for sign request")
    @GetMapping(value = "/cert-sign/sign-requests/{sessionId}/document")
    public ResponseEntity<byte[]> getSignRequestDocument(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = getCurrentUser(principal);
            byte[] document = workflowSessionService.getSignRequestDocument(sessionId, user);
            return WebResponseUtils.bytesToWebResponse(document, "document.pdf");
        } catch (Exception e) {
            log.error("Error fetching document for sign request {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @Operation(summary = "Sign a document with certificate and optional wet signature")
    @PostMapping(
            value = "/cert-sign/sign-requests/{sessionId}/sign",
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            })
    public ResponseEntity<?> signDocument(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @ModelAttribute stirling.software.proprietary.workflow.dto.SignDocumentRequest request,
            Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            workflowSessionService.signDocument(sessionId, user, request);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid sign request for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        } catch (Exception e) {
            log.error("Error signing document for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Cannot sign document: " + e.getMessage());
        }
    }

    @Operation(summary = "Decline a sign request")
    @PostMapping(value = "/cert-sign/sign-requests/{sessionId}/decline")
    public ResponseEntity<?> declineSignRequest(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            workflowSessionService.declineSignRequest(sessionId, user);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("Error declining sign request for session {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot decline sign request: " + e.getMessage());
        }
    }

    // ===== HELPER METHODS =====

    private User getCurrentUser(Principal principal) {
        return userService
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.UNAUTHORIZED,
                                        "User not found: " + principal.getName()));
    }
}
