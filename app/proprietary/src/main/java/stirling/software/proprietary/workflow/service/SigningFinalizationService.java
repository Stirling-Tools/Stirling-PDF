package stirling.software.proprietary.workflow.service;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
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
    private final MetadataEncryptionService metadataEncryptionService;

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
        // This must succeed before digital certificates are applied — continuing after a wet
        // signature failure would produce a document that appears fully signed but is missing
        // one or more participant signatures.
        pdf = applyWetSignatures(pdf, session);

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
            if (base64Data == null || base64Data.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Wet signature image data is missing or empty for participant");
            }
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

        // ---- Color palette — monochrome except badge accents and logo ----
        // Only signedGreen and declinedRed carry colour; everything else is neutral gray.
        final Color headerDark = new Color(31, 41, 55); // --gray-800  (#1f2937)
        final Color signedGreen = new Color(16, 185, 129); // --category-color-signing
        final Color declinedRed = new Color(239, 68, 68); // --category-color-removal
        final Color cardBg = new Color(249, 250, 251); // --color-gray-50
        final Color cardBorder = new Color(229, 231, 235); // --color-gray-200
        final Color stripBg = new Color(243, 244, 246); // --color-gray-100
        final Color textDark = new Color(17, 24, 39); // --gray-900
        final Color textMuted = new Color(107, 114, 128); // --gray-500
        final Color sectionLabel = new Color(55, 65, 81); // --gray-700
        final Color columnLabel = new Color(107, 114, 128); // --gray-500
        final Color headerSubtle = new Color(209, 213, 219); // --gray-300

        // ---- Fonts ----
        final PDFont fontBold = new PDType1Font(FontName.HELVETICA_BOLD);
        final PDFont fontReg = new PDType1Font(FontName.HELVETICA);

        // ---- Page geometry ----
        final float PAGE_W = PDRectangle.A4.getWidth(); // 595.3
        final float PAGE_H = PDRectangle.A4.getHeight(); // 841.9
        final float MARGIN = 40f;
        final float CONTENT_W = PAGE_W - 2 * MARGIN;

        // ---- Section heights ----
        final float HEADER_H = 72f;
        final float STRIP_H = 36f;

        // ---- Card geometry ----
        final float CARD_PADDING = 10f;
        final float ACCENT_W = 4f;
        final float INNER_W = CONTENT_W - ACCENT_W - CARD_PADDING * 2;
        final float COL_W = (INNER_W - CARD_PADDING) / 2f;
        final float LINE_H = 14f;

        // ---- Date formatters ----
        java.time.format.DateTimeFormatter tsFormatter =
                java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm:ss");

        try (PDDocument document = pdfDocumentFactory.load(new ByteArrayInputStream(pdfBytes))) {
            PDPage summaryPage = new PDPage(PDRectangle.A4);
            document.addPage(summaryPage);

            PDPageContentStream cs =
                    new PDPageContentStream(
                            document,
                            summaryPage,
                            PDPageContentStream.AppendMode.APPEND,
                            true,
                            true);

            try {
                float yPos = PAGE_H;

                // ========== 1. HEADER BAR ==========
                cs.setNonStrokingColor(headerDark);
                cs.addRect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H);
                cs.fill();

                // Landscape wordmark logo (white text PNG, aspect 118:26)
                // Rendered at 30pt height → ~136pt wide
                final float LOGO_H = 30f;
                final float LOGO_W = LOGO_H * (118f / 26f); // preserve aspect ratio
                final float logoX = MARGIN;
                final float logoY = PAGE_H - HEADER_H + (HEADER_H - LOGO_H) / 2f;
                try {
                    ClassPathResource logoRes =
                            new ClassPathResource("static/images/stirling-logo-white.png");
                    try (InputStream logoIn = logoRes.getInputStream()) {
                        BufferedImage logoImg = ImageIO.read(logoIn);
                        if (logoImg != null) {
                            PDImageXObject pdLogo =
                                    LosslessFactory.createFromImage(document, logoImg);
                            cs.drawImage(pdLogo, logoX, logoY, LOGO_W, LOGO_H);
                        }
                    }
                } catch (Exception e) {
                    // Fallback: just draw the name as text
                    log.debug(
                            "Could not load Stirling-PDF logo for summary page: {}",
                            e.getMessage());
                    cs.setNonStrokingColor(Color.WHITE);
                    cs.beginText();
                    cs.setFont(fontBold, 13);
                    cs.newLineAtOffset(logoX, PAGE_H - 28);
                    cs.showText("Stirling PDF");
                    cs.endText();
                }

                // "Signature Summary" below the wordmark logo
                cs.setNonStrokingColor(headerSubtle);
                cs.beginText();
                cs.setFont(fontReg, 10);
                cs.newLineAtOffset(MARGIN, PAGE_H - HEADER_H + 10);
                cs.showText("Signature Summary");
                cs.endText();

                // Document name (right-aligned, muted)
                String docName = session.getDocumentName() != null ? session.getDocumentName() : "";
                float maxDocW = CONTENT_W * 0.45f;
                while (docName.length() > 4
                        && fontReg.getStringWidth(docName) / 1000f * 9 > maxDocW) {
                    docName = docName.substring(0, docName.length() - 4) + "...";
                }
                float docNameW = fontReg.getStringWidth(docName) / 1000f * 9;
                cs.setNonStrokingColor(headerSubtle);
                cs.beginText();
                cs.setFont(fontReg, 9);
                cs.newLineAtOffset(PAGE_W - MARGIN - docNameW, PAGE_H - 26);
                cs.showText(docName);
                cs.endText();

                // Finalized timestamp (right-aligned, below doc name)
                String finalizedStr =
                        "Finalized: " + java.time.LocalDateTime.now().format(tsFormatter);
                float finalizedW = fontReg.getStringWidth(finalizedStr) / 1000f * 8;
                cs.setNonStrokingColor(new Color(156, 163, 175)); // --gray-400
                cs.beginText();
                cs.setFont(fontReg, 8);
                cs.newLineAtOffset(PAGE_W - MARGIN - finalizedW, PAGE_H - 42);
                cs.showText(finalizedStr);
                cs.endText();

                yPos = PAGE_H - HEADER_H;

                // ========== 2. INFO STRIP ==========
                cs.setNonStrokingColor(stripBg);
                cs.addRect(0, yPos - STRIP_H, PAGE_W, STRIP_H);
                cs.fill();

                cs.setNonStrokingColor(textDark);
                cs.beginText();
                cs.setFont(fontReg, 9);
                cs.newLineAtOffset(MARGIN, yPos - STRIP_H + 13);
                cs.showText("Session Owner:  " + session.getOwner().getUsername());
                cs.endText();

                long signedCount =
                        session.getParticipants().stream()
                                .filter(p -> p.getStatus() == ParticipantStatus.SIGNED)
                                .count();
                long totalCount = session.getParticipants().size();
                String countStr = signedCount + " of " + totalCount + " participant(s) signed";
                float countW = fontReg.getStringWidth(countStr) / 1000f * 9;
                cs.setNonStrokingColor(textDark);
                cs.beginText();
                cs.setFont(fontReg, 9);
                cs.newLineAtOffset(PAGE_W - MARGIN - countW, yPos - STRIP_H + 13);
                cs.showText(countStr);
                cs.endText();

                yPos -= STRIP_H + 14;

                // ========== 3. DIVIDER ==========
                cs.setStrokingColor(cardBorder);
                cs.setLineWidth(0.5f);
                cs.moveTo(MARGIN, yPos);
                cs.lineTo(PAGE_W - MARGIN, yPos);
                cs.stroke();
                yPos -= 16;

                // ========== 4. SECTION HEADER ==========
                cs.setNonStrokingColor(sectionLabel);
                cs.beginText();
                cs.setFont(fontBold, 13);
                cs.newLineAtOffset(MARGIN, yPos);
                cs.showText("Signatories");
                cs.endText();
                yPos -= 20;

                // ========== 5. SIGNER CARDS ==========
                for (WorkflowParticipant participant : session.getParticipants()) {
                    if (participant.getStatus() != ParticipantStatus.SIGNED
                            && participant.getStatus() != ParticipantStatus.DECLINED) {
                        continue;
                    }

                    boolean isSigned = participant.getStatus() == ParticipantStatus.SIGNED;
                    Color statusColor = isSigned ? signedGreen : declinedRed;
                    String statusLabel = isSigned ? "SIGNED" : "DECLINED";

                    // Gather data before measuring card height
                    CertificateSubmission submission =
                            isSigned ? extractCertificateSubmission(participant) : null;
                    ParticipantSignatureMetadata meta = null;
                    CertificateInfo certInfo = null;
                    if (isSigned && submission != null) {
                        meta = extractParticipantSignatureMetadata(participant, submission);
                        certInfo = extractCertificateInfo(submission, participant);
                    }

                    // Dynamic card height:
                    //   header row (28) + inner divider (10) + body + top/bottom padding
                    boolean hasLocation =
                            meta != null && meta.location != null && !meta.location.isEmpty();
                    boolean hasReason =
                            meta != null
                                    && meta.reason != null
                                    && !meta.reason.isEmpty()
                                    && !"Document Signing".equals(meta.reason);
                    // left col: column label row + data rows
                    int leftDataRows = 0;
                    if (isSigned) leftDataRows++; // timestamp
                    if (hasReason) leftDataRows++;
                    if (hasLocation) leftDataRows++;
                    if (submission != null) leftDataRows++; // cert type
                    // right col: 6 data rows (subjectCN, issuerCN, serial, validFrom, validUntil,
                    // algorithm)
                    int rightDataRows = certInfo != null ? 6 : 0;
                    int bodyRows =
                            1 + Math.max(leftDataRows, rightDataRows); // +1 for column label row
                    float cardBodyH = bodyRows * LINE_H + CARD_PADDING;
                    float cardH = 28 + 10 + cardBodyH + CARD_PADDING;

                    // Overflow to new page
                    if (yPos - cardH < 50) {
                        cs.close();
                        summaryPage = new PDPage(PDRectangle.A4);
                        document.addPage(summaryPage);
                        cs =
                                new PDPageContentStream(
                                        document,
                                        summaryPage,
                                        PDPageContentStream.AppendMode.APPEND,
                                        true,
                                        true);
                        yPos = PAGE_H - MARGIN;
                    }

                    float cardLeft = MARGIN;
                    float cardTop = yPos;

                    // Card background
                    cs.setNonStrokingColor(cardBg);
                    cs.addRect(cardLeft, cardTop - cardH, CONTENT_W, cardH);
                    cs.fill();

                    // Card border
                    cs.setStrokingColor(cardBorder);
                    cs.setLineWidth(0.5f);
                    cs.addRect(cardLeft, cardTop - cardH, CONTENT_W, cardH);
                    cs.stroke();

                    // Left accent bar
                    cs.setNonStrokingColor(statusColor);
                    cs.addRect(cardLeft, cardTop - cardH, ACCENT_W, cardH);
                    cs.fill();

                    // Card header: Name
                    float headerY = cardTop - CARD_PADDING - 14;
                    String nameStr =
                            participant.getName() != null ? participant.getName() : "Unknown";
                    cs.setNonStrokingColor(textDark);
                    cs.beginText();
                    cs.setFont(fontBold, 11);
                    cs.newLineAtOffset(cardLeft + ACCENT_W + CARD_PADDING, headerY);
                    cs.showText(nameStr);
                    cs.endText();

                    // Email (muted, same line)
                    float nameW = fontBold.getStringWidth(nameStr) / 1000f * 11;
                    String emailStr =
                            participant.getEmail() != null
                                    ? "<" + participant.getEmail() + ">"
                                    : "";
                    cs.setNonStrokingColor(textMuted);
                    cs.beginText();
                    cs.setFont(fontReg, 9);
                    cs.newLineAtOffset(cardLeft + ACCENT_W + CARD_PADDING + nameW + 5, headerY);
                    cs.showText(emailStr);
                    cs.endText();

                    // Status badge (filled rect with white text)
                    float badgeW = fontBold.getStringWidth(statusLabel) / 1000f * 7 + 10;
                    float badgeX = cardLeft + CONTENT_W - badgeW - CARD_PADDING;
                    float badgeY = headerY - 3;
                    cs.setNonStrokingColor(statusColor);
                    cs.addRect(badgeX, badgeY, badgeW, 13);
                    cs.fill();
                    cs.setNonStrokingColor(Color.WHITE);
                    cs.beginText();
                    cs.setFont(fontBold, 7);
                    cs.newLineAtOffset(badgeX + 4, badgeY + 3);
                    cs.showText(statusLabel);
                    cs.endText();

                    // Inner card divider
                    float divY = cardTop - CARD_PADDING - 26;
                    cs.setStrokingColor(cardBorder);
                    cs.setLineWidth(0.5f);
                    cs.moveTo(cardLeft + ACCENT_W + CARD_PADDING, divY);
                    cs.lineTo(cardLeft + CONTENT_W - CARD_PADDING, divY);
                    cs.stroke();

                    // Two-column body
                    float bodyTopY = divY - LINE_H;
                    float leftColX = cardLeft + ACCENT_W + CARD_PADDING;
                    float rightColX = leftColX + COL_W + CARD_PADDING;
                    float rowY = bodyTopY;

                    // Left column label
                    cs.setNonStrokingColor(columnLabel);
                    cs.beginText();
                    cs.setFont(fontBold, 8);
                    cs.newLineAtOffset(leftColX, rowY);
                    cs.showText("Signature Details");
                    cs.endText();
                    rowY -= LINE_H;

                    if (isSigned && participant.getLastUpdated() != null) {
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                leftColX,
                                rowY,
                                textDark,
                                textMuted,
                                "Signed:",
                                participant.getLastUpdated().format(tsFormatter));
                        rowY -= LINE_H;
                    } else if (!isSigned) {
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                leftColX,
                                rowY,
                                textDark,
                                textMuted,
                                "Status:",
                                "Declined signing");
                        rowY -= LINE_H;
                    }

                    if (hasReason) {
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                leftColX,
                                rowY,
                                textDark,
                                textMuted,
                                "Reason:",
                                meta.reason);
                        rowY -= LINE_H;
                    }
                    if (hasLocation) {
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                leftColX,
                                rowY,
                                textDark,
                                textMuted,
                                "Location:",
                                meta.location);
                        rowY -= LINE_H;
                    }
                    if (submission != null && submission.getCertType() != null) {
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                leftColX,
                                rowY,
                                textDark,
                                textMuted,
                                "Cert Type:",
                                submission.getCertType());
                    }

                    // Right column: Certificate Details
                    if (certInfo != null) {
                        float rRowY = bodyTopY;
                        cs.setNonStrokingColor(columnLabel);
                        cs.beginText();
                        cs.setFont(fontBold, 8);
                        cs.newLineAtOffset(rightColX, rRowY);
                        cs.showText("Certificate Details");
                        cs.endText();
                        rRowY -= LINE_H;

                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Subject:",
                                certInfo.subjectCN);
                        rRowY -= LINE_H;
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Issuer:",
                                certInfo.issuerCN);
                        rRowY -= LINE_H;
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Serial:",
                                certInfo.serialNumber);
                        rRowY -= LINE_H;
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Valid From:",
                                certInfo.validFrom);
                        rRowY -= LINE_H;
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Valid Until:",
                                certInfo.validUntil);
                        rRowY -= LINE_H;
                        drawLabelValue(
                                cs,
                                fontBold,
                                fontReg,
                                rightColX,
                                rRowY,
                                textDark,
                                textMuted,
                                "Algorithm:",
                                certInfo.algorithm);
                    }

                    yPos -= cardH + 12;
                }

                // ========== 6. FOOTER ==========
                cs.setStrokingColor(cardBorder);
                cs.setLineWidth(0.5f);
                cs.moveTo(MARGIN, 44);
                cs.lineTo(PAGE_W - MARGIN, 44);
                cs.stroke();

                String footerText = "Generated by Stirling-PDF";
                float footerTextW = fontReg.getStringWidth(footerText) / 1000f * 9;
                cs.setNonStrokingColor(textMuted);
                cs.beginText();
                cs.setFont(fontReg, 9);
                cs.newLineAtOffset((PAGE_W - footerTextW) / 2f, 30);
                cs.showText(footerText);
                cs.endText();

            } finally {
                cs.close();
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
        validateCertificateNotExpired(keystore, participant.getEmail());
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
                        showLogo != null ? showLogo : false,
                        null,
                        null,
                        null,
                        null);

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
            case "PKCS12":
            case "PFX":
                if (submission.getP12Keystore() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "P12 keystore data is required");
                }
                try {
                    KeyStore p12Store = KeyStore.getInstance("PKCS12");
                    p12Store.load(
                            new ByteArrayInputStream(submission.getP12Keystore()),
                            password != null ? password.toCharArray() : new char[0]);
                    return p12Store;
                } catch (Exception e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Failed to open P12 keystore — check that the file is valid and the password is correct");
                }

            case "JKS":
                if (submission.getJksKeystore() == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "JKS keystore data is required");
                }
                try {
                    KeyStore jksStore = KeyStore.getInstance("JKS");
                    jksStore.load(
                            new ByteArrayInputStream(submission.getJksKeystore()),
                            password != null ? password.toCharArray() : new char[0]);
                    return jksStore;
                } catch (Exception e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Failed to open JKS keystore — check that the file is valid and the password is correct");
                }

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

    private void validateCertificateNotExpired(KeyStore keystore, String participantEmail)
            throws Exception {
        Enumeration<String> aliases = keystore.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            java.security.cert.Certificate cert = keystore.getCertificate(alias);
            if (cert instanceof java.security.cert.X509Certificate x509) {
                try {
                    x509.checkValidity();
                } catch (java.security.cert.CertificateExpiredException e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Certificate for participant '"
                                    + participantEmail
                                    + "' has expired. Please upload a valid certificate.");
                } catch (java.security.cert.CertificateNotYetValidException e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Certificate for participant '"
                                    + participantEmail
                                    + "' is not yet valid.");
                }
            }
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
                log.error("Failed to get user certificate password", e);
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

                // Decrypt password (supports both legacy plaintext and encrypted values)
                if (submission.getPassword() != null) {
                    submission.setPassword(
                            metadataEncryptionService.decrypt(submission.getPassword()));
                }

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

    /**
     * Extracts X509 certificate fields from a participant's keystore for display on the summary
     * page. Returns null gracefully if the certificate cannot be loaded (e.g. missing data).
     */
    private CertificateInfo extractCertificateInfo(
            CertificateSubmission submission, WorkflowParticipant participant) {
        try {
            KeyStore keystore = buildKeystore(submission, participant);
            Enumeration<String> aliases = keystore.aliases();
            if (!aliases.hasMoreElements()) {
                return null;
            }
            String alias = aliases.nextElement();
            Certificate cert = keystore.getCertificate(alias);
            if (!(cert instanceof X509Certificate)) {
                return null;
            }
            X509Certificate x509 = (X509Certificate) cert;

            String subjectCN = extractCN(x509.getSubjectX500Principal().getName());
            String issuerCN = extractCN(x509.getIssuerX500Principal().getName());

            java.time.format.DateTimeFormatter dtf =
                    java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy");
            String validFrom =
                    x509.getNotBefore()
                            .toInstant()
                            .atZone(ZoneOffset.UTC)
                            .toLocalDate()
                            .format(dtf);
            String validUntil =
                    x509.getNotAfter().toInstant().atZone(ZoneOffset.UTC).toLocalDate().format(dtf);

            String serial = x509.getSerialNumber().toString(16).toUpperCase();
            if (serial.length() > 20) {
                serial = serial.substring(0, 17) + "...";
            }

            return new CertificateInfo(
                    subjectCN, issuerCN, serial, validFrom, validUntil, x509.getSigAlgName());

        } catch (Exception e) {
            log.warn(
                    "Could not extract certificate info for {}: {}",
                    participant.getEmail(),
                    e.getMessage(),
                    e);
            return null;
        }
    }

    /** Extracts the CN value from an RFC 2253 DN string. Uses BouncyCastle with simple fallback. */
    private String extractCN(String dnString) {
        try {
            X500Name x500Name = new X500Name(dnString);
            RDN[] cns = x500Name.getRDNs(BCStyle.CN);
            if (cns.length > 0) {
                return IETFUtils.valueToString(cns[0].getFirst().getValue());
            }
        } catch (Exception ignored) {
            // fall through to simple parse
        }
        for (String part : dnString.split(",")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("CN=")) {
                return trimmed.substring(3);
            }
        }
        return dnString;
    }

    /**
     * Draws a bold label followed by a regular-weight value on the same baseline. Clamps value to
     * 26 characters to prevent overflow into adjacent column.
     */
    private void drawLabelValue(
            PDPageContentStream cs,
            PDFont labelFont,
            PDFont valueFont,
            float x,
            float y,
            Color labelColor,
            Color valueColor,
            String label,
            String value)
            throws java.io.IOException {
        String safeValue = value != null ? value : "";
        if (safeValue.length() > 26) {
            safeValue = safeValue.substring(0, 23) + "...";
        }
        cs.setNonStrokingColor(labelColor);
        cs.beginText();
        cs.setFont(labelFont, 8);
        cs.newLineAtOffset(x, y);
        cs.showText(label);
        cs.endText();

        float labelW = labelFont.getStringWidth(label) / 1000f * 8;
        cs.setNonStrokingColor(valueColor);
        cs.beginText();
        cs.setFont(valueFont, 8);
        cs.newLineAtOffset(x + labelW + 3, y);
        cs.showText(safeValue);
        cs.endText();
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
            log.error("Failed to map wet signature entry {}", sigMap, e);
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

    private static class CertificateInfo {
        final String subjectCN;
        final String issuerCN;
        final String serialNumber;
        final String validFrom;
        final String validUntil;
        final String algorithm;

        CertificateInfo(
                String subjectCN,
                String issuerCN,
                String serialNumber,
                String validFrom,
                String validUntil,
                String algorithm) {
            this.subjectCN = subjectCN;
            this.issuerCN = issuerCN;
            this.serialNumber = serialNumber;
            this.validFrom = validFrom;
            this.validUntil = validUntil;
            this.algorithm = algorithm;
        }
    }
}
