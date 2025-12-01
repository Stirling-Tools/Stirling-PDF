package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.util.Locale;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.controller.api.security.CertSignController.CreateSignature;
import stirling.software.SPDF.model.api.security.CreateSigningSessionRequest;
import stirling.software.SPDF.model.api.security.NotifySigningParticipantsRequest;
import stirling.software.SPDF.model.api.security.ParticipantCertificateRequest;
import stirling.software.SPDF.model.api.security.ParticipantCertificateSubmission;
import stirling.software.SPDF.model.api.security.ParticipantStatus;
import stirling.software.SPDF.model.api.security.SigningParticipant;
import stirling.software.SPDF.model.api.security.SigningSession;
import stirling.software.SPDF.service.SigningSessionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
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

    public SigningSessionController(
            SigningSessionService signingSessionService,
            CustomPDFDocumentFactory pdfDocumentFactory,
            @Autowired(required = false)
                    ServerCertificateServiceInterface serverCertificateServiceInterface) {
        this.signingSessionService = signingSessionService;
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.serverCertificateServiceInterface = serverCertificateServiceInterface;
    }

    @AutoJobPostMapping(
            consumes = {
                MediaType.MULTIPART_FORM_DATA_VALUE,
                MediaType.APPLICATION_FORM_URLENCODED_VALUE
            },
            value = "/cert-sign/sessions")
    @Operation(
            summary = "Create a shared signing session",
            description =
                    "Starts a collaboration session, distributes share links, and optionally notifies participants."
                            + " Input:PDF Output:JSON Type:SISO")
    public SigningSession createSession(@ModelAttribute CreateSigningSessionRequest request)
            throws Exception {
        return signingSessionService.createSession(request);
    }

    @Operation(summary = "Fetch signing session details")
    @GetMapping(value = "/cert-sign/sessions/{sessionId}")
    public SigningSession getSession(@PathVariable("sessionId") @NotBlank String sessionId) {
        return signingSessionService.getSession(sessionId);
    }

    @PostMapping(value = "/cert-sign/sessions/{sessionId}/notify")
    @Operation(summary = "Notify signing participants about outstanding requests")
    public SigningSession notifyParticipants(
            @PathVariable("sessionId") @NotBlank String sessionId,
            @RequestBody NotifySigningParticipantsRequest request) {
        return signingSessionService.notifyParticipants(sessionId, request);
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
        return signingSessionService.attachCertificate(sessionId, participantEmail, request);
    }

    @PostMapping(value = "/cert-sign/sessions/{sessionId}/finalize")
    @Operation(
            summary = "Finalize signing session",
            description =
                    "Applies collected certificates in order and returns the signed document.")
    @StandardPdfResponse
    public ResponseEntity<byte[]> finalizeSession(
            @PathVariable("sessionId") @NotBlank String sessionId) throws Exception {
        SigningSession session = signingSessionService.getSession(sessionId);
        byte[] pdf = session.getOriginalPdf();

        for (SigningParticipant participant : session.getParticipants()) {
            ParticipantCertificateSubmission submission = participant.getCertificateSubmission();
            if (submission == null || participant.getStatus() != ParticipantStatus.SIGNED) {
                continue;
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
                    submission.getLocation(),
                    submission.getReason(),
                    submission.getShowLogo());

            pdf = baos.toByteArray();
        }

        session.setSignedPdf(pdf);
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
