package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.Principal;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.workflow.dto.ParticipantRequest;
import stirling.software.proprietary.workflow.dto.WorkflowCreationRequest;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;
import stirling.software.proprietary.workflow.service.UserServerCertificateService;
import stirling.software.proprietary.workflow.service.WorkflowSessionService;

@Slf4j
@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs - Signing Workflows")
@RequiredArgsConstructor
public class SigningSessionController {

    private final WorkflowSessionService workflowSessionService;
    private final WorkflowParticipantRepository participantRepository;
    private final UserService userService;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private final ServerCertificateServiceInterface serverCertificateService;

    @Autowired(required = false)
    private final UserServerCertificateService userServerCertificateService;

    @Operation(summary = "List all signing sessions for current user")
    @Transactional(readOnly = true)
    @GetMapping(value = "/cert-sign/sessions")
    public ResponseEntity<?> listSessions(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            User user = getCurrentUser(principal);
            List<WorkflowSession> sessions = workflowSessionService.listUserSessions(user);
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
                    "Applies collected certificates in order and returns the signed document. "
                            + "Step 1: Apply wet signatures (visual annotations). "
                            + "Step 2: Apply digital certificates. "
                            + "Step 3: Clean up metadata.")
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

            // Get original PDF
            byte[] pdf = workflowSessionService.getOriginalFile(sessionId);

            // Step 1: Apply wet signatures (visual annotations) FIRST
            try {
                pdf = applyWetSignatures(pdf, session);
            } catch (Exception e) {
                log.error(
                        "Failed to apply wet signatures for session {}: {}",
                        sessionId,
                        e.getMessage());
                // Continue with certificate signing even if wet signatures fail
            }

            // Extract session settings
            SessionSignatureSettings sessionSettings = extractSessionSettings(session);

            // Step 1.5: Add summary page BEFORE digital signing (if enabled)
            // CRITICAL: Must be done before signing to avoid invalidating signatures
            if (sessionSettings.includeSummaryPage) {
                log.info("Adding summary page before digital signing for session {}", sessionId);
                pdf = appendSignatureSummaryPage(pdf, session);
            }

            // Suppress DIGITAL CERTIFICATE visual signatures if summary page is enabled
            // NOTE: This does NOT affect wet signatures (hand-drawn images), which were
            // already applied in Step 1 and will still appear on pages
            Boolean showVisualSignature =
                    sessionSettings.includeSummaryPage ? false : sessionSettings.showSignature;

            log.info(
                    "Finalization settings: includeSummaryPage={}, showVisualSignature={}",
                    sessionSettings.includeSummaryPage,
                    showVisualSignature);

            // Step 2: Apply digital certificates with per-participant settings
            for (WorkflowParticipant participant : session.getParticipants()) {
                if (participant.getStatus() != ParticipantStatus.SIGNED) {
                    log.debug(
                            "Skipping participant {} - status is {}",
                            participant.getEmail(),
                            participant.getStatus());
                    continue;
                }

                // Reload participant from database to get fresh metadata
                WorkflowParticipant freshParticipant =
                        participantRepository
                                .findById(participant.getId())
                                .orElseThrow(
                                        () ->
                                                new ResponseStatusException(
                                                        HttpStatus.INTERNAL_SERVER_ERROR,
                                                        "Participant not found"));

                // Extract certificate submission
                CertificateSubmission submission = extractCertificateSubmission(freshParticipant);
                if (submission == null) {
                    log.warn(
                            "No certificate submission found for participant {}, skipping",
                            freshParticipant.getEmail());
                    continue;
                }

                // Extract per-participant reason/location
                ParticipantSignatureMetadata participantMetadata =
                        extractParticipantSignatureMetadata(freshParticipant, submission);

                log.info(
                        "Applying signature for {} with reason='{}', location='{}'",
                        freshParticipant.getEmail(),
                        participantMetadata.reason,
                        participantMetadata.location);

                // Apply digital signature with per-participant settings
                pdf =
                        applyDigitalSignature(
                                pdf,
                                freshParticipant,
                                submission,
                                showVisualSignature, // Suppressed if summary page enabled
                                sessionSettings.pageNumber,
                                participantMetadata.reason, // Per-participant
                                participantMetadata.location, // Per-participant
                                sessionSettings.showLogo);
            }

            // Step 3: Store processed file
            String filename = session.getDocumentName().replace(".pdf", "") + "_shared_signed.pdf";
            workflowSessionService.storeProcessedFile(session, pdf, filename);

            // Mark session as finalized
            workflowSessionService.finalizeSession(sessionId, owner);

            // Step 4: Clean up wet signature metadata (GDPR compliance)
            try {
                clearWetSignatureMetadata(session);
            } catch (Exception e) {
                log.error(
                        "Failed to clear wet signature metadata for session {}: {}",
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

    // ===== SIGNING LOGIC (Moved from SigningWorkflowService) =====

    /**
     * Applies wet signatures (visual annotations) to the PDF. This must be done BEFORE applying
     * digital certificates.
     */
    private byte[] applyWetSignatures(byte[] pdfBytes, WorkflowSession session) throws Exception {
        log.info("Starting wet signature extraction for session {}", session.getSessionId());
        List<WetSignatureMetadata> wetSignatures = extractAllWetSignatures(session);
        if (wetSignatures.isEmpty()) {
            log.warn(
                    "No wet signatures to apply for session {} - this may indicate participants haven't placed signatures",
                    session.getSessionId());
            return pdfBytes;
        }

        log.info(
                "Applying {} wet signatures to session {}",
                wetSignatures.size(),
                session.getSessionId());

        // Load PDF document
        PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes));

        try {
            for (WetSignatureMetadata wetSig : wetSignatures) {
                applyWetSignatureToPage(document, wetSig);
            }

            // Save modified PDF
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        } finally {
            document.close();
        }
    }

    /** Applies a single wet signature to the appropriate page of the PDF. */
    private void applyWetSignatureToPage(PDDocument document, WetSignatureMetadata wetSig)
            throws Exception {
        if (wetSig.getPage() >= document.getNumberOfPages()) {
            log.warn(
                    "Wet signature page {} exceeds document pages {}, skipping",
                    wetSig.getPage(),
                    document.getNumberOfPages());
            return;
        }

        org.apache.pdfbox.pdmodel.PDPage page = document.getPage(wetSig.getPage());
        org.apache.pdfbox.pdmodel.PDPageContentStream contentStream =
                new org.apache.pdfbox.pdmodel.PDPageContentStream(
                        document,
                        page,
                        org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode.APPEND,
                        true,
                        true);

        try {
            // Extract base64 data (remove data:image/png;base64, prefix if present)
            String base64Data = extractBase64Data(wetSig.getData());
            byte[] imageBytes = java.util.Base64.getDecoder().decode(base64Data);

            // Create PDImageXObject from bytes
            org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject image =
                    org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject.createFromByteArray(
                            document, imageBytes, "signature");

            // Convert Y coordinate from UI (top-left) to PDF (bottom-left) coordinate system
            float pdfY = page.getMediaBox().getHeight() - wetSig.getY() - wetSig.getHeight();

            // Draw image at specified position
            contentStream.drawImage(
                    image, wetSig.getX(), pdfY, wetSig.getWidth(), wetSig.getHeight());

            log.info(
                    "Applied wet signature at page {} coordinates ({}, {}) size {}x{}",
                    wetSig.getPage(),
                    wetSig.getX(),
                    pdfY,
                    wetSig.getWidth(),
                    wetSig.getHeight());
        } finally {
            contentStream.close();
        }
    }

    /**
     * Appends a custom signature summary page to the end of the PDF. Shows Stirling logo, session
     * metadata, and all participant signatures.
     */
    private byte[] appendSignatureSummaryPage(byte[] pdfBytes, WorkflowSession session)
            throws Exception {
        log.info("Appending signature summary page to session {}", session.getSessionId());

        try (PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes))) {
            // Create new A4 page at end
            PDPage summaryPage = new PDPage(PDRectangle.A4);
            document.addPage(summaryPage);

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document,
                            summaryPage,
                            PDPageContentStream.AppendMode.APPEND,
                            true,
                            true);

            try {
                PDRectangle pageSize = summaryPage.getMediaBox();
                float margin = 50;
                float yPosition = pageSize.getHeight() - margin;

                // === HEADER SECTION ===

                // Load Stirling logo
                ClassPathResource logoResource =
                        new ClassPathResource("static/images/signature.png");
                PDImageXObject logoImage;
                try (InputStream logoStream = logoResource.getInputStream()) {
                    File tempLogo = Files.createTempFile("summary-logo", ".png").toFile();
                    FileUtils.copyInputStreamToFile(logoStream, tempLogo);
                    logoImage = PDImageXObject.createFromFileByExtension(tempLogo, document);
                    tempLogo.delete();
                }

                // Draw logo (top-left, 60x60)
                contentStream.drawImage(logoImage, margin, yPosition - 60, 60, 60);

                // Title next to logo
                PDFont titleFont = new PDType1Font(FontName.TIMES_BOLD);
                contentStream.beginText();
                contentStream.setFont(titleFont, 20);
                contentStream.newLineAtOffset(margin + 70, yPosition - 30);
                contentStream.showText("Signature Summary");
                contentStream.endText();

                yPosition -= 80;

                // === DOCUMENT INFO SECTION ===

                PDFont headerFont = new PDType1Font(FontName.TIMES_BOLD);
                PDFont bodyFont = new PDType1Font(FontName.TIMES_ROMAN);

                contentStream.beginText();
                contentStream.setFont(headerFont, 12);
                contentStream.newLineAtOffset(margin, yPosition);
                contentStream.showText("Document: " + session.getDocumentName());
                contentStream.endText();
                yPosition -= 20;

                contentStream.beginText();
                contentStream.setFont(bodyFont, 10);
                contentStream.newLineAtOffset(margin, yPosition);
                contentStream.showText("Session Owner: " + session.getOwner().getUsername());
                contentStream.endText();
                yPosition -= 15;

                contentStream.beginText();
                contentStream.setFont(bodyFont, 10);
                contentStream.newLineAtOffset(margin, yPosition);
                contentStream.showText(
                        "Finalized: "
                                + java.time.LocalDateTime.now()
                                        .format(
                                                java.time.format.DateTimeFormatter.ofPattern(
                                                        "yyyy-MM-dd HH:mm:ss")));
                contentStream.endText();
                yPosition -= 30;

                // Draw separator line
                contentStream.setLineWidth(1f);
                contentStream.moveTo(margin, yPosition);
                contentStream.lineTo(pageSize.getWidth() - margin, yPosition);
                contentStream.stroke();
                yPosition -= 20;

                // === SIGNATURES SECTION ===

                contentStream.beginText();
                contentStream.setFont(headerFont, 14);
                contentStream.newLineAtOffset(margin, yPosition);
                contentStream.showText("Signatures");
                contentStream.endText();
                yPosition -= 25;

                // Iterate through participants
                for (WorkflowParticipant participant : session.getParticipants()) {
                    // Only show SIGNED or DECLINED participants (skip PENDING/VIEWED)
                    if (participant.getStatus() != ParticipantStatus.SIGNED
                            && participant.getStatus() != ParticipantStatus.DECLINED) {
                        continue;
                    }

                    // Check if we need a new page
                    if (yPosition < 100) {
                        contentStream.close();
                        summaryPage = new PDPage(PDRectangle.A4);
                        document.addPage(summaryPage);
                        contentStream =
                                new PDPageContentStream(
                                        document,
                                        summaryPage,
                                        PDPageContentStream.AppendMode.APPEND,
                                        true,
                                        true);
                        yPosition = pageSize.getHeight() - margin;
                    }

                    // Participant name/email
                    contentStream.beginText();
                    contentStream.setFont(headerFont, 11);
                    contentStream.newLineAtOffset(margin, yPosition);
                    contentStream.showText(
                            participant.getName() + " <" + participant.getEmail() + ">");
                    contentStream.endText();
                    yPosition -= 15;

                    // Status
                    contentStream.beginText();
                    contentStream.setFont(bodyFont, 9);
                    contentStream.newLineAtOffset(margin + 10, yPosition);
                    contentStream.showText("Status: " + participant.getStatus().toString());
                    contentStream.endText();
                    yPosition -= 12;

                    if (participant.getStatus() == ParticipantStatus.SIGNED) {
                        // Extract metadata for this participant
                        CertificateSubmission submission =
                                extractCertificateSubmission(participant);
                        ParticipantSignatureMetadata metadata =
                                submission != null
                                        ? extractParticipantSignatureMetadata(
                                                participant, submission)
                                        : new ParticipantSignatureMetadata("Document Signing", "");

                        // Timestamp
                        contentStream.beginText();
                        contentStream.setFont(bodyFont, 9);
                        contentStream.newLineAtOffset(margin + 10, yPosition);
                        contentStream.showText(
                                "Signed: "
                                        + participant
                                                .getLastUpdated()
                                                .format(
                                                        java.time.format.DateTimeFormatter
                                                                .ofPattern("yyyy-MM-dd HH:mm:ss")));
                        contentStream.endText();
                        yPosition -= 12;

                        // Reason (if provided and not default)
                        if (metadata.reason != null
                                && !metadata.reason.isEmpty()
                                && !"Document Signing".equals(metadata.reason)) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Reason: " + metadata.reason);
                            contentStream.endText();
                            yPosition -= 12;
                        }

                        // Location (if provided)
                        if (metadata.location != null && !metadata.location.isEmpty()) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Location: " + metadata.location);
                            contentStream.endText();
                            yPosition -= 12;
                        }

                        // Certificate type
                        if (submission != null) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Certificate Type: " + submission.getCertType());
                            contentStream.endText();
                            yPosition -= 12;
                        }
                    }

                    yPosition -= 10; // Space between participants
                }

            } finally {
                contentStream.close();
            }

            // Save modified document to bytes
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    /** Extracts base64 data from data URL format. */
    private String extractBase64Data(String data) {
        if (data == null) {
            return "";
        }
        // Remove data URL prefix if present
        if (data.contains(",")) {
            return data.substring(data.indexOf(",") + 1);
        }
        return data;
    }

    /**
     * Extracts session-level signature settings from workflowMetadata. Includes new
     * includeSummaryPage flag.
     */
    private SessionSignatureSettings extractSessionSettings(WorkflowSession session) {
        Map<String, Object> workflowMetadata = session.getWorkflowMetadata();

        Boolean showSignature = false;
        Integer pageNumber = null;
        Boolean showLogo = false;
        Boolean includeSummaryPage = false;

        if (workflowMetadata != null && !workflowMetadata.isEmpty()) {
            showSignature =
                    workflowMetadata.containsKey("showSignature")
                            ? (Boolean) workflowMetadata.get("showSignature")
                            : false;
            pageNumber =
                    workflowMetadata.containsKey("pageNumber")
                            ? ((Number) workflowMetadata.get("pageNumber")).intValue()
                            : null;
            showLogo =
                    workflowMetadata.containsKey("showLogo")
                            ? (Boolean) workflowMetadata.get("showLogo")
                            : false;
            includeSummaryPage =
                    workflowMetadata.containsKey("includeSummaryPage")
                            ? (Boolean) workflowMetadata.get("includeSummaryPage")
                            : false;
        }

        return new SessionSignatureSettings(
                showSignature, pageNumber, showLogo, includeSummaryPage);
    }

    /**
     * Extracts per-participant reason and location with proper fallback logic: - Reason:
     * participant override > owner default > "Document Signing" - Location: participant provided
     * (no default)
     */
    private ParticipantSignatureMetadata extractParticipantSignatureMetadata(
            WorkflowParticipant participant, CertificateSubmission submission) {

        // Reason resolution: participant > owner default > fallback
        String reason = "Document Signing"; // Fallback

        // Check participant's override first
        if (submission != null
                && submission.getReason() != null
                && !submission.getReason().isBlank()) {
            reason = submission.getReason();
        } else {
            // Check owner's default
            Map<String, Object> metadata = participant.getParticipantMetadata();
            if (metadata != null && metadata.containsKey("defaultReason")) {
                reason = (String) metadata.get("defaultReason");
            }
        }

        // Location: only from participant (no default)
        String location =
                submission != null && submission.getLocation() != null
                        ? submission.getLocation()
                        : "";

        return new ParticipantSignatureMetadata(reason, location);
    }

    /**
     * Applies a digital signature using the participant's certificate.
     *
     * @param pdfBytes Current PDF bytes
     * @param participant Participant applying the signature
     * @param submission Certificate submission details
     * @param showSignature Whether to show visible signature (from session settings)
     * @param pageNumber Page number for signature (from session settings)
     * @param reason Signing reason (from session settings)
     * @param location Signing location (from session settings)
     * @param showLogo Whether to show logo (from session settings)
     * @return PDF bytes with digital signature applied
     */
    private byte[] applyDigitalSignature(
            byte[] pdfBytes,
            WorkflowParticipant participant,
            CertificateSubmission submission,
            Boolean showSignature,
            Integer pageNumber,
            String reason,
            String location,
            Boolean showLogo)
            throws Exception {
        log.info(
                "Applying digital signature for participant {} with settings: showSignature={}, pageNumber={}, reason={}, location={}, showLogo={}",
                participant.getEmail(),
                showSignature,
                pageNumber,
                reason,
                location,
                showLogo);

        // Build keystore from submission
        KeyStore keystore = buildKeystore(submission, participant);
        String password = getKeystorePassword(submission, participant);

        // Create signature instance
        CertSignController.CreateSignature createSignature =
                new CertSignController.CreateSignature(
                        keystore, password != null ? password.toCharArray() : new char[0]);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        // Wrap bytes in MultipartFile for CertSignController
        ByteArrayMultipartFile inputFile =
                new ByteArrayMultipartFile(pdfBytes, "document.pdf", "application/pdf");

        // Apply digital signature using CertSignController with SESSION settings (not submission
        // settings)
        CertSignController.sign(
                pdfDocumentFactory,
                inputFile,
                outputStream,
                createSignature,
                showSignature != null ? showSignature : false,
                pageNumber != null ? pageNumber - 1 : null,
                participant.getName() != null ? participant.getName() : "Shared Signing",
                location != null ? location : "",
                reason != null ? reason : "Document Signing",
                showLogo != null ? showLogo : false);

        byte[] signedBytes = outputStream.toByteArray();

        log.info(
                "Digital signature applied for participant {} using cert type {}",
                participant.getEmail(),
                submission.getCertType());

        return signedBytes;
    }

    /** Builds a KeyStore from the certificate submission. */
    private KeyStore buildKeystore(
            CertificateSubmission submission, WorkflowParticipant participant) throws Exception {
        String certType = submission.getCertType();
        String password = submission.getPassword();

        switch (certType) {
            case "P12":
                if (submission.getP12Keystore() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "P12 keystore data is required");
                }
                KeyStore p12Store = KeyStore.getInstance("PKCS12");
                p12Store.load(
                        new ByteArrayInputStream(submission.getP12Keystore()),
                        password != null ? password.toCharArray() : new char[0]);
                return p12Store;

            case "JKS":
                if (submission.getJksKeystore() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "JKS keystore data is required");
                }
                KeyStore jksStore = KeyStore.getInstance("JKS");
                jksStore.load(
                        new ByteArrayInputStream(submission.getJksKeystore()),
                        password != null ? password.toCharArray() : new char[0]);
                return jksStore;

            case "SERVER":
                if (serverCertificateService == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Server certificate service is not available");
                }
                if (!serverCertificateService.isEnabled()
                        || !serverCertificateService.hasServerCertificate()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Server certificate is not configured");
                }
                return serverCertificateService.getServerKeyStore();

            case "USER_CERT":
                // User certificate - auto-generated server certificate for the user
                if (userServerCertificateService == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "User certificate service is not available");
                }
                if (participant.getUser() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "User certificate requires authenticated user");
                }

                try {
                    // Auto-generate or retrieve user certificate
                    userServerCertificateService.getOrCreateUserCertificate(
                            participant.getUser().getId());
                    return userServerCertificateService.getUserKeyStore(
                            participant.getUser().getId());
                } catch (Exception e) {
                    log.error(
                            "Failed to get user certificate for user {}: {}",
                            participant.getUser().getId(),
                            e.getMessage());
                    throw new ResponseStatusException(
                            HttpStatus.INTERNAL_SERVER_ERROR,
                            "Failed to generate or retrieve user certificate: " + e.getMessage());
                }

            default:
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Invalid certificate type: " + certType);
        }
    }

    /** Gets the keystore password based on certificate type. */
    private String getKeystorePassword(
            CertificateSubmission submission, WorkflowParticipant participant) {
        String certType = submission.getCertType();

        if ("SERVER".equalsIgnoreCase(certType) && serverCertificateService != null) {
            return serverCertificateService.getServerCertificatePassword();
        }

        if ("USER_CERT".equalsIgnoreCase(certType) && userServerCertificateService != null) {
            // Password is auto-generated based on user ID
            if (participant.getUser() != null) {
                try {
                    return userServerCertificateService.getUserKeystorePassword(
                            participant.getUser().getId());
                } catch (Exception e) {
                    log.error("Failed to get user certificate password: {}", e.getMessage());
                    return null;
                }
            }
        }

        return submission.getPassword();
    }

    /** Extracts certificate submission from participant metadata JSON. */
    private CertificateSubmission extractCertificateSubmission(WorkflowParticipant participant) {
        log.info(
                "Extracting cert for participant ID: {}, email: {}",
                participant.getId(),
                participant.getEmail());
        Map<String, Object> metadata = participant.getParticipantMetadata();
        if (metadata == null || metadata.isEmpty()) {
            log.info("No metadata found for participant {}", participant.getEmail());
            return null;
        }

        if (!metadata.containsKey("certificateSubmission")) {
            log.info(
                    "certificateSubmission key not found in metadata for participant {}",
                    participant.getEmail());
            return null;
        }

        try {
            // Convert metadata to JsonNode for processing
            var node = objectMapper.valueToTree(metadata);

            log.info("JSON node has certificateSubmission: {}", node.has("certificateSubmission"));
            if (node.has("certificateSubmission")) {
                CertificateSubmission submission =
                        objectMapper.treeToValue(
                                node.get("certificateSubmission"), CertificateSubmission.class);

                // Decode base64 keystore data if present
                var certNode = node.get("certificateSubmission");
                if (certNode.has("p12Keystore")) {
                    String base64 = certNode.get("p12Keystore").asText();
                    submission.setP12Keystore(java.util.Base64.getDecoder().decode(base64));
                }
                if (certNode.has("jksKeystore")) {
                    String base64 = certNode.get("jksKeystore").asText();
                    submission.setJksKeystore(java.util.Base64.getDecoder().decode(base64));
                }

                return submission;
            }
        } catch (Exception e) {
            log.error(
                    "Failed to parse certificate submission from metadata for participant {}: {}",
                    participant.getEmail(),
                    e.getMessage(),
                    e);
        }

        return null;
    }

    /** Extracts all wet signatures from all participants in the session. */
    private List<WetSignatureMetadata> extractAllWetSignatures(WorkflowSession session) {
        List<WetSignatureMetadata> signatures = new java.util.ArrayList<>();

        for (WorkflowParticipant participant : session.getParticipants()) {
            // Reload participant from database to get fresh metadata (same as certificate
            // extraction)
            WorkflowParticipant freshParticipant;
            try {
                freshParticipant =
                        participantRepository
                                .findById(participant.getId())
                                .orElseThrow(
                                        () ->
                                                new RuntimeException(
                                                        "Participant not found: "
                                                                + participant.getId()));
            } catch (Exception e) {
                log.error(
                        "Failed to reload participant {}: {}",
                        participant.getEmail(),
                        e.getMessage());
                continue;
            }

            Map<String, Object> metadata = freshParticipant.getParticipantMetadata();
            if (metadata == null || metadata.isEmpty()) {
                log.debug("No metadata found for participant {}", freshParticipant.getEmail());
                continue;
            }

            if (!metadata.containsKey("wetSignatures")) {
                log.debug(
                        "No wetSignatures key found for participant {}",
                        freshParticipant.getEmail());
                continue;
            }

            try {
                // Convert metadata to JsonNode for processing
                var node = objectMapper.valueToTree(metadata);

                if (node.has("wetSignatures")) {
                    // wetSignatures is an array of signatures
                    var wetSigsNode = node.get("wetSignatures");
                    if (wetSigsNode.isArray()) {
                        log.info(
                                "Found {} wet signature(s) for participant {}",
                                wetSigsNode.size(),
                                freshParticipant.getEmail());
                        for (var wetSigNode : wetSigsNode) {
                            WetSignatureMetadata wetSig =
                                    objectMapper.treeToValue(
                                            wetSigNode, WetSignatureMetadata.class);
                            signatures.add(wetSig);
                            log.debug(
                                    "Extracted wet signature at page {} for participant {}",
                                    wetSig.getPage(),
                                    freshParticipant.getEmail());
                        }
                    }
                }
            } catch (Exception e) {
                log.error(
                        "Failed to parse wet signatures from participant {} metadata",
                        freshParticipant.getEmail(),
                        e);
            }
        }

        log.info("Total wet signatures extracted: {}", signatures.size());
        return signatures;
    }

    /**
     * Clears wet signature metadata from all participants (GDPR compliance). Removes sensitive
     * visual signature data after finalization.
     */
    private void clearWetSignatureMetadata(WorkflowSession session) {
        log.info("Clearing wet signature metadata for session {}", session.getSessionId());

        for (WorkflowParticipant participant : session.getParticipants()) {
            Map<String, Object> metadata = participant.getParticipantMetadata();
            if (metadata == null || metadata.isEmpty()) {
                continue;
            }

            if (metadata.containsKey("wetSignatures")) {
                metadata.remove("wetSignatures");
                participant.setParticipantMetadata(metadata);
                participantRepository.save(participant);
                log.debug("Cleared wet signatures for participant {}", participant.getEmail());
            }
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

    // ===== DTO CLASSES =====

    /** Certificate submission details extracted from participant metadata */
    public static class CertificateSubmission {
        private String certType; // P12, JKS, SERVER, USER_CERT
        private String password;
        private byte[] p12Keystore;
        private byte[] jksKeystore;
        private Boolean showSignature;
        private Integer pageNumber;
        private String location;
        private String reason;
        private Boolean showLogo;

        // Getters and setters
        public String getCertType() {
            return certType;
        }

        public void setCertType(String certType) {
            this.certType = certType;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public byte[] getP12Keystore() {
            return p12Keystore;
        }

        public void setP12Keystore(byte[] p12Keystore) {
            this.p12Keystore = p12Keystore;
        }

        public byte[] getJksKeystore() {
            return jksKeystore;
        }

        public void setJksKeystore(byte[] jksKeystore) {
            this.jksKeystore = jksKeystore;
        }

        public Boolean getShowSignature() {
            return showSignature;
        }

        public void setShowSignature(Boolean showSignature) {
            this.showSignature = showSignature;
        }

        public Integer getPageNumber() {
            return pageNumber;
        }

        public void setPageNumber(Integer pageNumber) {
            this.pageNumber = pageNumber;
        }

        public String getLocation() {
            return location;
        }

        public void setLocation(String location) {
            this.location = location;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }

        public Boolean getShowLogo() {
            return showLogo;
        }

        public void setShowLogo(Boolean showLogo) {
            this.showLogo = showLogo;
        }
    }

    /** Wet signature metadata with coordinates and image/text data */
    public static class WetSignatureMetadata {
        private int page;
        private float x;
        private float y;
        private float width;
        private float height;
        private String type; // IMAGE, TEXT, CANVAS
        private String data; // Base64 encoded image or text content

        // Getters and setters
        public int getPage() {
            return page;
        }

        public void setPage(int page) {
            this.page = page;
        }

        public float getX() {
            return x;
        }

        public void setX(float x) {
            this.x = x;
        }

        public float getY() {
            return y;
        }

        public void setY(float y) {
            this.y = y;
        }

        public float getWidth() {
            return width;
        }

        public void setWidth(float width) {
            this.width = width;
        }

        public float getHeight() {
            return height;
        }

        public void setHeight(float height) {
            this.height = height;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getData() {
            return data;
        }

        public void setData(String data) {
            this.data = data;
        }
    }

    /** Session-level signature settings extracted from workflowMetadata */
    private static class SessionSignatureSettings {
        final Boolean showSignature;
        final Integer pageNumber;
        final Boolean showLogo;
        final Boolean includeSummaryPage;

        SessionSignatureSettings(
                Boolean showSignature,
                Integer pageNumber,
                Boolean showLogo,
                Boolean includeSummaryPage) {
            this.showSignature = showSignature;
            this.pageNumber = pageNumber;
            this.showLogo = showLogo;
            this.includeSummaryPage = includeSummaryPage;
        }
    }

    /** Per-participant signature metadata (reason + location) */
    private static class ParticipantSignatureMetadata {
        final String reason;
        final String location;

        ParticipantSignatureMetadata(String reason, String location) {
            this.reason = reason;
            this.location = location;
        }
    }

    /** Simple MultipartFile wrapper for byte[] content. Used for wrapping PDF bytes. */
    private static class ByteArrayMultipartFile
            implements org.springframework.web.multipart.MultipartFile {
        private final byte[] content;
        private final String filename;
        private final String contentType;

        public ByteArrayMultipartFile(byte[] content, String filename, String contentType) {
            this.content = content;
            this.filename = filename;
            this.contentType = contentType;
        }

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return filename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        @Override
        public boolean isEmpty() {
            return content == null || content.length == 0;
        }

        @Override
        public long getSize() {
            return content == null ? 0 : content.length;
        }

        @Override
        public byte[] getBytes() {
            return content;
        }

        @Override
        public java.io.InputStream getInputStream() {
            return new ByteArrayInputStream(content);
        }

        @Override
        public void transferTo(java.io.File dest) throws java.io.IOException {
            java.nio.file.Files.write(dest.toPath(), content);
        }
    }
}
