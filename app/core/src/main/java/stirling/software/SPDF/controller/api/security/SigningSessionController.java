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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.constraints.NotBlank;

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

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class SigningSessionController {

    private final SigningSessionService signingSessionService;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ServerCertificateServiceInterface serverCertificateServiceInterface;
    private final SigningSessionServiceInterface sessionServiceInterface;

    public SigningSessionController(
            SigningSessionService signingSessionService,
            CustomPDFDocumentFactory pdfDocumentFactory,
            @Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateServiceInterface,
            @Autowired(required = false)
                    List<SigningSessionServiceInterface> signingSessionServices) {
        this.signingSessionService = signingSessionService;
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.serverCertificateServiceInterface = serverCertificateServiceInterface;
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
    @DeleteMapping(value = "/cert-sign/sessions/{sessionId}/participants/{participantEmail}")
    public ResponseEntity<?> removeParticipant(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @PathVariable("participantEmail") @NotBlank String participantEmail,
            Principal principal) {
        if (principal == null || !sessionServiceInterface.isDatabaseBacked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Authentication required");
        }
        try {
            sessionServiceInterface.removeParticipant(
                    sessionId, participantEmail, principal.getName());
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Cannot remove participant: " + e.getMessage());
        }
    }

    @Operation(summary = "Get session PDF for participant view")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}/pdf")
    public ResponseEntity<byte[]> getSessionPdf(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @RequestParam @NotBlank String token) {
        try {
            byte[] pdfBytes = sessionServiceInterface.getSessionPdf(sessionId, token);
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
            value = "/cert-sign/sessions/{sessionId}/participants/{participantEmail}/certificate",
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            })
    @Operation(summary = "Attach certificate details for a specific participant")
    public SigningSession attachCertificate(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @PathVariable("participantEmail") @NotBlank String participantEmail,
            @ModelAttribute ParticipantCertificateRequest request)
            throws Exception {
        return (SigningSession)
                sessionServiceInterface.attachCertificate(sessionId, participantEmail, request);
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

            KeyStore keystore = buildKeystore(submission);
            boolean usingServer = "SERVER".equalsIgnoreCase(submission.getCertType());
            String password =
                    usingServer && serverCertificateServiceInterface != null
                            ? serverCertificateServiceInterface.getServerCertificatePassword()
                            : submission.getPassword();
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

        return WebResponseUtils.bytesToWebResponse(
                pdf,
                GeneralUtils.generateFilename(session.getDocumentName(), "_shared_signed.pdf"));
    }

    private KeyStore buildKeystore(ParticipantCertificateSubmission submission) throws Exception {
        CertSignController certSignController =
                new CertSignController(pdfDocumentFactory, serverCertificateServiceInterface);
        String certType = submission.getCertType().toUpperCase(Locale.ROOT);
        String password = submission.getPassword();
        switch (certType) {
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
}
