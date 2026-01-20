package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.KeyStore;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.util.List;
import java.util.Locale;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.constraints.NotBlank;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.controller.api.security.CertSignController.CreateSignature;
import stirling.software.SPDF.service.SigningSessionService;
import stirling.software.common.model.api.security.*;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.SigningSessionServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.service.UserServerCertificateService;

@Slf4j
@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class SigningSessionController {

    private final SigningSessionService signingSessionService;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ServerCertificateServiceInterface serverCertificateServiceInterface;
    private final SigningSessionServiceInterface sessionServiceInterface;
    private final UserServerCertificateService userServerCertificateService;

    public SigningSessionController(
            SigningSessionService signingSessionService,
            CustomPDFDocumentFactory pdfDocumentFactory,
            @Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateServiceInterface,
            @Autowired(required = false)
                    List<SigningSessionServiceInterface> signingSessionServices,
            @Autowired(required = false)
                    UserServerCertificateService userServerCertificateService) {
        this.signingSessionService = signingSessionService;
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.serverCertificateServiceInterface = serverCertificateServiceInterface;
        this.userServerCertificateService = userServerCertificateService;
        // Use database-backed service if available, otherwise fall back to in-memory
        this.sessionServiceInterface =
                signingSessionServices != null && !signingSessionServices.isEmpty()
                        ? signingSessionServices.stream()
                                .filter(SigningSessionServiceInterface::isDatabaseBacked)
                                .findFirst()
                                .orElse(signingSessionService)
                        : signingSessionService;
    }

    @Operation(summary = "List all signing sessions for current user")
    @GetMapping(value = "/cert-sign/sessions")
    public ResponseEntity<?> listSessions(Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            List<?> sessions = sessionServiceInterface.listUserSessions(principal.getName());
            return ResponseEntity.ok(sessions);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error listing sessions");
        }
    }

    @PostMapping(
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            },
            value = "/cert-sign/sessions",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create a shared signing session",
            description =
                    "Starts a collaboration session, distributes share links, and optionally notifies participants."
                            + " Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> createSession(
            @ModelAttribute CreateSigningSessionRequest request, Principal principal)
            throws Exception {
        if (sessionServiceInterface.isDatabaseBacked() && principal != null) {
            Object session = sessionServiceInterface.createSession(request, principal.getName());
            return ResponseEntity.ok(session);
        } else {
            SigningSession session = signingSessionService.createSession(request);
            return ResponseEntity.ok(session);
        }
    }

    @Operation(summary = "Fetch signing session details")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}")
    public ResponseEntity<?> getSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (sessionServiceInterface.isDatabaseBacked() && principal != null) {
            try {
                Object session =
                        sessionServiceInterface.getSessionDetail(sessionId, principal.getName());
                return ResponseEntity.ok(session);
            } catch (Exception e) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body("Access denied or session not found");
            }
        } else {
            SigningSession session = signingSessionService.getSession(sessionId);
            return ResponseEntity.ok(session);
        }
    }

    @Operation(summary = "Delete a signing session")
    @DeleteMapping(value = "/cert-sign/sessions/{sessionId}")
    public ResponseEntity<?> deleteSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            sessionServiceInterface.deleteSession(sessionId, principal.getName());
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot delete session: " + e.getMessage());
        }
    }

    @Operation(summary = "Add participants to an existing session")
    @PostMapping(value = "/cert-sign/sessions/{sessionId}/participants")
    public ResponseEntity<?> addParticipants(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @RequestBody AddParticipantsRequest request,
            Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            Object session =
                    sessionServiceInterface.addParticipants(
                            sessionId, request, principal.getName());
            return ResponseEntity.ok(session);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot add participants: " + e.getMessage());
        }
    }

    @Operation(summary = "Remove a participant from a session")
    @DeleteMapping(value = "/cert-sign/sessions/{sessionId}/participants/{userId}")
    public ResponseEntity<?> removeParticipant(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @PathVariable("userId") Long userId,
            Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            sessionServiceInterface.removeParticipant(sessionId, userId, principal.getName());
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot remove participant: " + e.getMessage());
        }
    }

    @Operation(summary = "Get session PDF for participant view")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}/pdf")
    public ResponseEntity<byte[]> getSessionPdf(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            byte[] pdfBytes = sessionServiceInterface.getSessionPdf(sessionId, principal.getName());
            return WebResponseUtils.bytesToWebResponse(pdfBytes, "document.pdf");
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @PostMapping(value = "/cert-sign/sessions/{sessionId}/notify")
    @Operation(summary = "Notify signing participants about outstanding requests")
    public SigningSession notifyParticipants(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @RequestBody NotifySigningParticipantsRequest request) {
        return (SigningSession) sessionServiceInterface.notifyParticipants(sessionId, request);
    }

    @PostMapping(
            value = "/cert-sign/sessions/{sessionId}/participants/{userId}/certificate",
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            })
    @Operation(summary = "Attach certificate details for a specific participant")
    public SigningSession attachCertificate(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @PathVariable("userId") Long userId,
            @ModelAttribute ParticipantCertificateRequest request)
            throws Exception {
        return (SigningSession)
                sessionServiceInterface.attachCertificate(sessionId, userId, request);
    }

    @Operation(summary = "Get signed PDF from finalized session")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}/signed-pdf")
    @StandardPdfResponse
    public ResponseEntity<byte[]> getSignedPdf(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            byte[] signedPdf = sessionServiceInterface.getSignedPdf(sessionId, principal.getName());
            if (signedPdf == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body("Session not finalized".getBytes());
            }
            SigningSession session = (SigningSession) sessionServiceInterface.getSession(sessionId);
            return WebResponseUtils.bytesToWebResponse(
                    signedPdf,
                    GeneralUtils.generateFilename(session.getDocumentName(), "_shared_signed.pdf"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @PostMapping(value = "/cert-sign/sessions/{sessionId}/finalize")
    @Operation(
            summary = "Finalize signing session",
            description =
                    "Applies collected certificates in order and returns the signed document.")
    @StandardPdfResponse
    public ResponseEntity<byte[]> finalizeSession(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal)
            throws Exception {
        // Validate ownership if database service is available
        if (sessionServiceInterface.isDatabaseBacked() && principal != null) {
            try {
                sessionServiceInterface.getSessionDetail(sessionId, principal.getName());
            } catch (Exception e) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }

        SigningSession session = (SigningSession) sessionServiceInterface.getSession(sessionId);
        byte[] pdf = session.getOriginalPdf();

        // Step 1: Apply wet signatures (visual annotations) FIRST
        if (sessionServiceInterface.isDatabaseBacked()) {
            try {
                pdf = applyWetSignatures(pdf, sessionId);
            } catch (Exception e) {
                log.error(
                        "Failed to apply wet signatures for session {}: {}",
                        sessionId,
                        e.getMessage());
                // Continue with certificate signing even if wet signatures fail
            }
        }

        // Step 2: Apply digital certificates
        for (SigningParticipant participant : session.getParticipants()) {
            ParticipantCertificateSubmission submission = participant.getCertificateSubmission();
            if (submission == null || participant.getStatus() != ParticipantStatus.SIGNED) {
                continue;
            }

            // Skip SERVER certificate type if feature is not available/enabled
            if ("SERVER".equalsIgnoreCase(submission.getCertType())) {
                if (serverCertificateServiceInterface == null
                        || !serverCertificateServiceInterface.isEnabled()
                        || !serverCertificateServiceInterface.hasServerCertificate()) {
                    // Skip this participant - server certificate not available
                    continue;
                }
            }

            // Handle USER_CERT type - auto-generate if needed
            if ("USER_CERT".equalsIgnoreCase(submission.getCertType())) {
                if (userServerCertificateService == null
                        || !sessionServiceInterface.isDatabaseBacked()) {
                    log.warn(
                            "USER_CERT requested but service not available, skipping participant: {}",
                            participant.getEmail());
                    continue;
                }
            }

            KeyStore keystore = buildKeystore(submission, participant);
            boolean usingServer = "SERVER".equalsIgnoreCase(submission.getCertType());
            boolean usingUserCert = "USER_CERT".equalsIgnoreCase(submission.getCertType());
            String password;
            if (usingServer && serverCertificateServiceInterface != null) {
                password = serverCertificateServiceInterface.getServerCertificatePassword();
            } else if (usingUserCert && userServerCertificateService != null) {
                password = submission.getPassword(); // Password stored in submission for user cert
            } else {
                password = submission.getPassword();
            }
            CreateSignature createSignature =
                    new CreateSignature(
                            keystore, password != null ? password.toCharArray() : new char[0]);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            CertSignController.sign(
                    pdfDocumentFactory,
                    new ByteArrayInputStream(pdf),
                    baos,
                    createSignature,
                    submission.getShowSignature(),
                    submission.getPageNumber() != null
                            ? Math.max(submission.getPageNumber() - 1, 0)
                            : null,
                    StringUtils.defaultIfBlank(participant.getName(), "Shared Signing"),
                    StringUtils.defaultIfBlank(submission.getLocation(), ""),
                    StringUtils.defaultIfBlank(submission.getReason(), "Document Signing"),
                    submission.getShowLogo());

            pdf = baos.toByteArray();
        }

        session.setSignedPdf(pdf);

        // Mark session as finalized in database if database service is available
        sessionServiceInterface.markSessionFinalized(sessionId, pdf);

        // Step 3: Clean up wet signature metadata (GDPR compliance)
        if (sessionServiceInterface.isDatabaseBacked()) {
            try {
                clearWetSignatureMetadata(sessionId);
            } catch (Exception e) {
                log.error(
                        "Failed to clear wet signature metadata for session {}: {}",
                        sessionId,
                        e.getMessage());
                // Don't fail the finalization if cleanup fails
            }
        }

        return WebResponseUtils.bytesToWebResponse(
                pdf,
                GeneralUtils.generateFilename(session.getDocumentName(), "_shared_signed.pdf"));
    }

    private KeyStore buildKeystore(
            ParticipantCertificateSubmission submission, SigningParticipant participant)
            throws Exception {
        CertSignController certSignController =
                new CertSignController(pdfDocumentFactory, serverCertificateServiceInterface);
        String certType = submission.getCertType().toUpperCase(Locale.ROOT);
        String password = submission.getPassword();
        switch (certType) {
            case "USER_CERT":
                if (userServerCertificateService == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.userCertificateNotAvailable",
                            "User certificate service is not available in this edition");
                }
                // Get user ID from participant
                Long userId = getUserIdFromParticipant(participant);
                if (userId == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.userNotFound", "Cannot determine user ID for participant");
                }
                // Auto-generate certificate if user doesn't have one
                try {
                    userServerCertificateService.getOrCreateUserCertificate(userId);
                    KeyStore userKeyStore = userServerCertificateService.getUserKeyStore(userId);
                    String userPassword =
                            userServerCertificateService.getUserKeystorePassword(userId);
                    // Store password in submission for later use
                    submission.setPassword(userPassword);
                    return userKeyStore;
                } catch (Exception e) {
                    log.error("Failed to get/create user certificate for user {}", userId, e);
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.userCertificateFailure",
                            "Failed to get user certificate: " + e.getMessage());
                }
            case "PEM":
                KeyStore pemStore = KeyStore.getInstance("JKS");
                pemStore.load(null);
                if (submission.getPrivateKey() == null || submission.getCertificate() == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.optionsNotSpecified",
                            "{0} options are not specified",
                            "PEM certificate and key bytes for signer");
                }
                PrivateKey privateKey =
                        certSignController.getPrivateKeyFromPEM(
                                submission.getPrivateKey(), password);
                Certificate certificate =
                        (Certificate)
                                certSignController.getCertificateFromPEM(
                                        submission.getCertificate());
                pemStore.setKeyEntry(
                        "alias",
                        privateKey,
                        password.toCharArray(),
                        new Certificate[] {certificate});
                return pemStore;
            case "PKCS12":
            case "PFX":
                if (submission.getP12Keystore() == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.optionsNotSpecified",
                            "{0} options are not specified",
                            "PKCS12 keystore bytes");
                }
                KeyStore p12Store = KeyStore.getInstance("PKCS12");
                p12Store.load(
                        new ByteArrayInputStream(submission.getP12Keystore()),
                        password.toCharArray());
                return p12Store;
            case "JKS":
                if (submission.getJksKeystore() == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.optionsNotSpecified",
                            "{0} options are not specified",
                            "JKS keystore bytes");
                }
                KeyStore jksStore = KeyStore.getInstance("JKS");
                jksStore.load(
                        new ByteArrayInputStream(submission.getJksKeystore()),
                        password.toCharArray());
                return jksStore;
            case "SERVER":
                if (serverCertificateServiceInterface == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateNotAvailable",
                            "Server certificate service is not available in this edition");
                }
                if (!serverCertificateServiceInterface.isEnabled()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateDisabled",
                            "Server certificate feature is disabled");
                }
                if (!serverCertificateServiceInterface.hasServerCertificate()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.serverCertificateNotFound", "No server certificate configured");
                }
                return serverCertificateServiceInterface.getServerKeyStore();
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidArgument",
                        "Invalid argument: {0}",
                        "certificate type: " + submission.getCertType());
        }
    }

    /**
     * Applies wet signatures (visual annotations) to the PDF. This must be done BEFORE applying
     * digital certificates.
     *
     * @param pdfBytes Original PDF bytes
     * @param sessionId Session ID
     * @return PDF bytes with wet signatures overlaid
     * @throws Exception if PDF processing fails
     */
    private byte[] applyWetSignatures(byte[] pdfBytes, String sessionId) throws Exception {
        // Cast to database service to access wet signature methods
        if (!(sessionServiceInterface
                instanceof
                stirling.software.proprietary.security.service.DatabaseSigningSessionService)) {
            return pdfBytes; // Skip if not database service
        }

        stirling.software.proprietary.security.service.DatabaseSigningSessionService dbService =
                (stirling.software.proprietary.security.service.DatabaseSigningSessionService)
                        sessionServiceInterface;

        List<WetSignatureMetadata> wetSignatures = dbService.getAllWetSignatures(sessionId);
        if (wetSignatures.isEmpty()) {
            return pdfBytes; // No wet signatures to apply
        }

        // Load PDF document
        org.apache.pdfbox.pdmodel.PDDocument document =
                pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes));

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

    /**
     * Applies a single wet signature to the appropriate page of the PDF.
     *
     * @param document PDF document
     * @param wetSig Wet signature metadata
     * @throws Exception if image processing or PDF manipulation fails
     */
    private void applyWetSignatureToPage(
            org.apache.pdfbox.pdmodel.PDDocument document, WetSignatureMetadata wetSig)
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
            String base64Data = wetSig.extractBase64Data();
            byte[] imageBytes = java.util.Base64.getDecoder().decode(base64Data);

            // Create PDImageXObject from bytes
            org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject image =
                    org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject.createFromByteArray(
                            document, imageBytes, "signature");

            // Convert Y coordinate from UI (top-left) to PDF (bottom-left) coordinate system
            float pdfY =
                    page.getMediaBox().getHeight()
                            - wetSig.getY().floatValue()
                            - wetSig.getHeight().floatValue();

            // Draw image at specified position
            contentStream.drawImage(
                    image,
                    wetSig.getX().floatValue(),
                    pdfY,
                    wetSig.getWidth().floatValue(),
                    wetSig.getHeight().floatValue());
        } finally {
            contentStream.close();
        }
    }

    /**
     * Clears wet signature metadata from all participants. Called after successful finalization for
     * GDPR compliance.
     *
     * @param sessionId Session ID
     */
    private void clearWetSignatureMetadata(String sessionId) {
        if (sessionServiceInterface
                instanceof
                stirling.software.proprietary.security.service.DatabaseSigningSessionService) {
            stirling.software.proprietary.security.service.DatabaseSigningSessionService dbService =
                    (stirling.software.proprietary.security.service.DatabaseSigningSessionService)
                            sessionServiceInterface;
            dbService.clearWetSignatureMetadata(sessionId);
        }
    }

    /**
     * Helper method to get user ID from participant. Returns null if not available (e.g., in-memory
     * sessions).
     *
     * @param participant The signing participant
     * @return User ID or null
     */
    private Long getUserIdFromParticipant(SigningParticipant participant) {
        return participant.getUserId();
    }

    @Operation(summary = "List sign requests for authenticated user")
    @GetMapping(value = "/cert-sign/sign-requests")
    public ResponseEntity<?> listSignRequests(Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            return ResponseEntity.ok(sessionServiceInterface.listSignRequests(principal.getName()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Cannot list sign requests: " + e.getMessage());
        }
    }

    @Operation(summary = "Get sign request detail for participant")
    @GetMapping(value = "/cert-sign/sign-requests/{sessionId}")
    public ResponseEntity<?> getSignRequestDetail(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            return ResponseEntity.ok(
                    sessionServiceInterface.getSignRequestDetail(sessionId, principal.getName()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Access denied or sign request not found: " + e.getMessage());
        }
    }

    @Operation(summary = "Decline a sign request")
    @PostMapping(value = "/cert-sign/sign-requests/{sessionId}/decline")
    public ResponseEntity<?> declineSignRequest(
            @PathVariable("sessionId") @NotBlank String sessionId, Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            sessionServiceInterface.declineSignRequest(sessionId, principal.getName());
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot decline sign request: " + e.getMessage());
        }
    }

    @Operation(
            summary = "Sign a document with optional wet signature",
            description =
                    "Submits certificate and optional wet signature annotation metadata for a signing session")
    @PostMapping(
            value = "/cert-sign/sessions/{sessionId}/sign",
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            })
    public ResponseEntity<?> signDocument(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @ModelAttribute SignDocumentRequest request,
            Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            sessionServiceInterface.signDocument(sessionId, principal.getName(), request);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Cannot sign document: " + e.getMessage());
        }
    }
}
