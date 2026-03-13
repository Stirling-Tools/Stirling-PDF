package stirling.software.proprietary.workflow.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.ArrayList;
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
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfSigningService;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.proprietary.workflow.dto.CertificateSubmission;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.repository.WorkflowParticipantRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * Service responsible for finalizing a signing session. Encapsulates all PDF manipulation logic
 * (wet signatures, summary page, digital certificate application) that was previously spread across
 * the controller.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SigningFinalizationService {

    private final WorkflowParticipantRepository participantRepository;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final PdfSigningService pdfSigningService;

    @Autowired(required = false)
    private final ServerCertificateServiceInterface serverCertificateService;

    @Autowired(required = false)
    private final UserServerCertificateService userServerCertificateService;

    // ===== PUBLIC API =====

    /**
     * Runs all finalization steps and returns the fully signed PDF bytes.
     *
     * <p>Order: 1. Apply wet signature image overlays 2. Append signature summary page (if enabled)
     * 3. Apply digital certificates per participant
     *
     * @param session Session with participants loaded
     * @param originalPdf The original PDF bytes to sign
     * @return Signed PDF bytes
     */
    public byte[] finalizeDocument(WorkflowSession session, byte[] originalPdf) throws Exception {
        byte[] pdf = originalPdf;

        // Step 1: Apply wet signatures (visual annotations) FIRST
        try {
            pdf = applyWetSignatures(pdf, session);
        } catch (Exception e) {
            log.error(
                    "Failed to apply wet signatures for session {}: {}",
                    session.getSessionId(),
                    e.getMessage());
            // Continue with certificate signing even if wet signatures fail
        }

        // Extract session-level settings
        SessionSignatureSettings settings = extractSessionSettings(session);

        // Step 1.5: Add summary page BEFORE digital signing (if enabled)
        // CRITICAL: Must be done before signing to avoid invalidating signatures
        if (Boolean.TRUE.equals(settings.includeSummaryPage)) {
            log.info(
                    "Adding summary page before digital signing for session {}",
                    session.getSessionId());
            pdf = appendSignatureSummaryPage(pdf, session);
        }

        // Suppress digital certificate visual block when summary page is enabled
        // (wet signatures already applied in Step 1 and will still appear)
        Boolean showVisualSignature =
                Boolean.TRUE.equals(settings.includeSummaryPage) ? false : settings.showSignature;

        log.info(
                "Finalization settings: includeSummaryPage={}, showVisualSignature={}",
                settings.includeSummaryPage,
                showVisualSignature);

        // Step 2: Apply digital certificates per SIGNED participant
        for (WorkflowParticipant participant : session.getParticipants()) {
            if (participant.getStatus() != ParticipantStatus.SIGNED) {
                log.debug(
                        "Skipping participant {} - status is {}",
                        participant.getEmail(),
                        participant.getStatus());
                continue;
            }

            // Reload from DB to get fresh metadata
            WorkflowParticipant fresh =
                    participantRepository
                            .findById(participant.getId())
                            .orElseThrow(
                                    () ->
                                            new ResponseStatusException(
                                                    HttpStatus.INTERNAL_SERVER_ERROR,
                                                    "Participant not found: "
                                                            + participant.getId()));

            CertificateSubmission submission = extractCertificateSubmission(fresh);
            if (submission == null) {
                log.warn(
                        "No certificate submission found for participant {}, skipping",
                        fresh.getEmail());
                continue;
            }

            ParticipantSignatureMetadata sigMeta =
                    extractParticipantSignatureMetadata(fresh, submission);

            log.info(
                    "Applying signature for {} with reason='{}', location='{}'",
                    fresh.getEmail(),
                    sigMeta.reason,
                    sigMeta.location);

            pdf =
                    applyDigitalSignature(
                            pdf,
                            fresh,
                            submission,
                            showVisualSignature,
                            settings.pageNumber,
                            sigMeta.reason,
                            sigMeta.location,
                            settings.showLogo);
        }

        return pdf;
    }

    /**
     * Clears sensitive metadata from all participants after finalization (GDPR compliance). Removes
     * wet signature image data and certificate submission data (keystores + passwords).
     */
    public void clearSensitiveMetadata(WorkflowSession session) {
        log.info("Clearing sensitive metadata for session {}", session.getSessionId());

        for (WorkflowParticipant participant : session.getParticipants()) {
            Map<String, Object> metadata = participant.getParticipantMetadata();
            if (metadata == null || metadata.isEmpty()) {
                continue;
            }

            boolean modified = false;
            if (metadata.containsKey("wetSignatures")) {
                metadata.remove("wetSignatures");
                modified = true;
            }
            if (metadata.containsKey("certificateSubmission")) {
                metadata.remove("certificateSubmission");
                modified = true;
            }
            if (modified) {
                participant.setParticipantMetadata(metadata);
                participantRepository.save(participant);
                log.debug("Cleared sensitive metadata for participant {}", participant.getEmail());
            }
        }
    }

    // ===== WET SIGNATURE APPLICATION =====

    private byte[] applyWetSignatures(byte[] pdfBytes, WorkflowSession session) throws Exception {
        log.info("Starting wet signature extraction for session {}", session.getSessionId());
        List<WetSignatureMetadata> wetSignatures = extractAllWetSignatures(session);
        if (wetSignatures.isEmpty()) {
            log.warn(
                    "No wet signatures to apply for session {} - participants may not have placed signatures",
                    session.getSessionId());
            return pdfBytes;
        }

        log.info(
                "Applying {} wet signature(s) to session {}",
                wetSignatures.size(),
                session.getSessionId());

        PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes));
        try {
            for (WetSignatureMetadata wetSig : wetSignatures) {
                applyWetSignatureToPage(document, wetSig);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        } finally {
            document.close();
        }
    }

    private void applyWetSignatureToPage(PDDocument document, WetSignatureMetadata wetSig)
            throws Exception {
        int pageIndex = wetSig.getPage();
        if (pageIndex >= document.getNumberOfPages()) {
            log.warn(
                    "Wet signature page {} exceeds document pages {}, skipping",
                    pageIndex,
                    document.getNumberOfPages());
            return;
        }

        PDPage page = document.getPage(pageIndex);
        PDPageContentStream contentStream =
                new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.APPEND, true, true);

        try {
            // Use WetSignatureMetadata.extractBase64Data() to strip data URL prefix
            String base64Data = wetSig.extractBase64Data();
            byte[] imageBytes = java.util.Base64.getDecoder().decode(base64Data);

            PDImageXObject image =
                    PDImageXObject.createFromByteArray(document, imageBytes, "signature");

            // Coordinates are stored as fractions (0–1) of the page dimensions.
            // Multiply by page size to get absolute PDF points, then convert Y from
            // UI top-left origin to PDF bottom-left origin.
            float pageWidth = page.getMediaBox().getWidth();
            float pageHeight = page.getMediaBox().getHeight();
            float x = wetSig.getX().floatValue() * pageWidth;
            float y = wetSig.getY().floatValue() * pageHeight;
            float width = wetSig.getWidth().floatValue() * pageWidth;
            float height = wetSig.getHeight().floatValue() * pageHeight;
            float pdfY = pageHeight - y - height;

            contentStream.drawImage(image, x, pdfY, width, height);

            log.info(
                    "Applied wet signature at page {} coordinates ({}, {}) size {}x{}",
                    pageIndex,
                    x,
                    pdfY,
                    width,
                    height);
        } finally {
            contentStream.close();
        }
    }

    // ===== SUMMARY PAGE =====

    private byte[] appendSignatureSummaryPage(byte[] pdfBytes, WorkflowSession session)
            throws Exception {
        log.info("Appending signature summary page to session {}", session.getSessionId());

        try (PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes))) {
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

                // === HEADER ===

                ClassPathResource logoResource =
                        new ClassPathResource("static/images/signature.png");
                PDImageXObject logoImage;
                try (InputStream logoStream = logoResource.getInputStream()) {
                    File tempLogo = Files.createTempFile("summary-logo", ".png").toFile();
                    FileUtils.copyInputStreamToFile(logoStream, tempLogo);
                    logoImage = PDImageXObject.createFromFileByExtension(tempLogo, document);
                    tempLogo.delete();
                }

                contentStream.drawImage(logoImage, margin, yPosition - 60, 60, 60);

                PDFont titleFont = new PDType1Font(FontName.TIMES_BOLD);
                contentStream.beginText();
                contentStream.setFont(titleFont, 20);
                contentStream.newLineAtOffset(margin + 70, yPosition - 30);
                contentStream.showText("Signature Summary");
                contentStream.endText();

                yPosition -= 80;

                // === DOCUMENT INFO ===

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

                // Separator line
                contentStream.setLineWidth(1f);
                contentStream.moveTo(margin, yPosition);
                contentStream.lineTo(pageSize.getWidth() - margin, yPosition);
                contentStream.stroke();
                yPosition -= 20;

                // === SIGNATURES ===

                contentStream.beginText();
                contentStream.setFont(headerFont, 14);
                contentStream.newLineAtOffset(margin, yPosition);
                contentStream.showText("Signatures");
                contentStream.endText();
                yPosition -= 25;

                for (WorkflowParticipant participant : session.getParticipants()) {
                    if (participant.getStatus() != ParticipantStatus.SIGNED
                            && participant.getStatus() != ParticipantStatus.DECLINED) {
                        continue;
                    }

                    // Overflow to new page
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

                    contentStream.beginText();
                    contentStream.setFont(headerFont, 11);
                    contentStream.newLineAtOffset(margin, yPosition);
                    contentStream.showText(
                            participant.getName() + " <" + participant.getEmail() + ">");
                    contentStream.endText();
                    yPosition -= 15;

                    contentStream.beginText();
                    contentStream.setFont(bodyFont, 9);
                    contentStream.newLineAtOffset(margin + 10, yPosition);
                    contentStream.showText("Status: " + participant.getStatus());
                    contentStream.endText();
                    yPosition -= 12;

                    if (participant.getStatus() == ParticipantStatus.SIGNED) {
                        CertificateSubmission submission =
                                extractCertificateSubmission(participant);
                        ParticipantSignatureMetadata meta =
                                submission != null
                                        ? extractParticipantSignatureMetadata(
                                                participant, submission)
                                        : new ParticipantSignatureMetadata("Document Signing", "");

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

                        if (meta.reason != null
                                && !meta.reason.isEmpty()
                                && !"Document Signing".equals(meta.reason)) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Reason: " + meta.reason);
                            contentStream.endText();
                            yPosition -= 12;
                        }

                        if (meta.location != null && !meta.location.isEmpty()) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Location: " + meta.location);
                            contentStream.endText();
                            yPosition -= 12;
                        }

                        if (submission != null) {
                            contentStream.beginText();
                            contentStream.setFont(bodyFont, 9);
                            contentStream.newLineAtOffset(margin + 10, yPosition);
                            contentStream.showText("Certificate Type: " + submission.getCertType());
                            contentStream.endText();
                            yPosition -= 12;
                        }
                    }

                    yPosition -= 10;
                }

            } finally {
                contentStream.close();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    // ===== DIGITAL SIGNATURE APPLICATION =====

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
                "Applying digital signature for participant {} - showSignature={}, pageNumber={}, reason='{}', location='{}', showLogo={}",
                participant.getEmail(),
                showSignature,
                pageNumber,
                reason,
                location,
                showLogo);

        KeyStore keystore = buildKeystore(submission, participant);
        String password = getKeystorePassword(submission, participant);

        byte[] signed =
                pdfSigningService.signWithKeystore(
                        pdfBytes,
                        keystore,
                        password != null ? password.toCharArray() : new char[0],
                        showSignature != null ? showSignature : false,
                        pageNumber != null ? pageNumber - 1 : null,
                        participant.getName() != null ? participant.getName() : "Shared Signing",
                        location != null ? location : "",
                        reason != null ? reason : "Document Signing",
                        showLogo != null ? showLogo : false);

        log.info(
                "Digital signature applied for {} using cert type {}",
                participant.getEmail(),
                submission.getCertType());

        return signed;
    }

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
                if (serverCertificateService == null
                        || !serverCertificateService.isEnabled()
                        || !serverCertificateService.hasServerCertificate()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Server certificate is not available or not configured");
                }
                return serverCertificateService.getServerKeyStore();

            case "USER_CERT":
                if (userServerCertificateService == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "User certificate service is not available");
                }
                if (participant.getUser() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "User certificate requires authenticated user");
                }
                try {
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

    private String getKeystorePassword(
            CertificateSubmission submission, WorkflowParticipant participant) {
        String certType = submission.getCertType();

        if ("SERVER".equalsIgnoreCase(certType) && serverCertificateService != null) {
            return serverCertificateService.getServerCertificatePassword();
        }

        if ("USER_CERT".equalsIgnoreCase(certType)
                && userServerCertificateService != null
                && participant.getUser() != null) {
            try {
                return userServerCertificateService.getUserKeystorePassword(
                        participant.getUser().getId());
            } catch (Exception e) {
                log.error("Failed to get user certificate password: {}", e.getMessage());
                return null;
            }
        }

        return submission.getPassword();
    }

    // ===== METADATA EXTRACTION =====

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
     * Resolves reason and location for a participant's digital signature. Reason: participant
     * override → owner default → "Document Signing" Location: participant-provided only (no
     * default)
     */
    private ParticipantSignatureMetadata extractParticipantSignatureMetadata(
            WorkflowParticipant participant, CertificateSubmission submission) {

        String reason = "Document Signing";
        if (submission != null
                && submission.getReason() != null
                && !submission.getReason().isBlank()) {
            reason = submission.getReason();
        } else {
            Map<String, Object> metadata = participant.getParticipantMetadata();
            if (metadata != null && metadata.containsKey("defaultReason")) {
                reason = (String) metadata.get("defaultReason");
            }
        }

        String location =
                (submission != null && submission.getLocation() != null)
                        ? submission.getLocation()
                        : "";

        return new ParticipantSignatureMetadata(reason, location);
    }

    private CertificateSubmission extractCertificateSubmission(WorkflowParticipant participant) {
        log.info(
                "Extracting certificate for participant ID: {}, email: {}",
                participant.getId(),
                participant.getEmail());
        Map<String, Object> metadata = participant.getParticipantMetadata();
        if (metadata == null || metadata.isEmpty()) {
            log.info("No metadata found for participant {}", participant.getEmail());
            return null;
        }
        if (!metadata.containsKey("certificateSubmission")) {
            log.info(
                    "certificateSubmission key not found for participant {}",
                    participant.getEmail());
            return null;
        }

        try {
            var node = objectMapper.valueToTree(metadata);
            if (node.has("certificateSubmission")) {
                CertificateSubmission submission =
                        objectMapper.treeToValue(
                                node.get("certificateSubmission"), CertificateSubmission.class);

                // Decode base64 keystore bytes
                var certNode = node.get("certificateSubmission");
                if (certNode.has("p12Keystore")) {
                    submission.setP12Keystore(
                            java.util.Base64.getDecoder()
                                    .decode(certNode.get("p12Keystore").asText()));
                }
                if (certNode.has("jksKeystore")) {
                    submission.setJksKeystore(
                            java.util.Base64.getDecoder()
                                    .decode(certNode.get("jksKeystore").asText()));
                }
                return submission;
            }
        } catch (Exception e) {
            log.error(
                    "Failed to parse certificate submission for participant {}: {}",
                    participant.getEmail(),
                    e.getMessage(),
                    e);
        }
        return null;
    }

    private List<WetSignatureMetadata> extractAllWetSignatures(WorkflowSession session) {
        List<WetSignatureMetadata> signatures = new ArrayList<>();

        for (WorkflowParticipant participant : session.getParticipants()) {
            // Reload from DB for fresh metadata
            WorkflowParticipant fresh;
            try {
                fresh =
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

            Map<String, Object> metadata = fresh.getParticipantMetadata();
            if (metadata == null || metadata.isEmpty() || !metadata.containsKey("wetSignatures")) {
                continue;
            }

            try {
                Object wetSigsRaw = metadata.get("wetSignatures");
                if (!(wetSigsRaw instanceof List)) {
                    log.warn(
                            "wetSignatures for participant {} is not a List (was {}), skipping",
                            fresh.getEmail(),
                            wetSigsRaw == null ? "null" : wetSigsRaw.getClass().getName());
                    continue;
                }
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> wetSigsList = (List<Map<String, Object>>) wetSigsRaw;
                log.info(
                        "Found {} wet signature(s) for participant {}",
                        wetSigsList.size(),
                        fresh.getEmail());
                for (Map<String, Object> sigMap : wetSigsList) {
                    WetSignatureMetadata wetSig = mapToWetSignature(sigMap);
                    if (wetSig != null) {
                        signatures.add(wetSig);
                    }
                }
            } catch (Exception e) {
                log.error("Failed to parse wet signatures for participant {}", fresh.getEmail(), e);
            }
        }

        log.info("Total wet signatures extracted: {}", signatures.size());
        return signatures;
    }

    /**
     * Converts a raw metadata map entry to a WetSignatureMetadata object. Uses direct map access to
     * avoid any Jackson version-specific POJO deserialization issues.
     */
    private WetSignatureMetadata mapToWetSignature(Map<String, Object> sigMap) {
        if (sigMap == null) {
            return null;
        }
        try {
            WetSignatureMetadata wetSig = new WetSignatureMetadata();
            wetSig.setType((String) sigMap.get("type"));
            wetSig.setData((String) sigMap.get("data"));
            Object page = sigMap.get("page");
            wetSig.setPage(page instanceof Number ? ((Number) page).intValue() : null);
            Object x = sigMap.get("x");
            wetSig.setX(x instanceof Number ? ((Number) x).doubleValue() : null);
            Object y = sigMap.get("y");
            wetSig.setY(y instanceof Number ? ((Number) y).doubleValue() : null);
            Object width = sigMap.get("width");
            wetSig.setWidth(width instanceof Number ? ((Number) width).doubleValue() : null);
            Object height = sigMap.get("height");
            wetSig.setHeight(height instanceof Number ? ((Number) height).doubleValue() : null);
            return wetSig;
        } catch (Exception e) {
            log.error("Failed to map wet signature entry {}: {}", sigMap, e.getMessage());
            return null;
        }
    }

    // ===== PRIVATE INNER TYPES =====

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

    private static class ParticipantSignatureMetadata {
        final String reason;
        final String location;

        ParticipantSignatureMetadata(String reason, String location) {
            this.reason = reason;
            this.location = location;
        }
    }
}
