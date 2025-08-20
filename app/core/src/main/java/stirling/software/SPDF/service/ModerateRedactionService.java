package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

class ModerateRedactionService implements RedactionModeStrategy {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RedactionService helper;

    ModerateRedactionService(CustomPDFDocumentFactory pdfDocumentFactory, RedactionService helper) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.helper = helper;
    }

    @Override
    public byte[] redact(RedactPdfRequest request) throws IOException {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWord = Boolean.TRUE.equals(request.getWholeWordSearch());

        PDDocument doc = null;
        PDDocument fallback = null;
        try {
            doc = pdfDocumentFactory.load(request.getFileInput());
            Map<Integer, List<PDFText>> allFound =
                    RedactionService.findTextToRedact(doc, listOfText, useRegex, wholeWord);
            if (allFound.isEmpty()) {
                try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    doc.save(baos);
                    return baos.toByteArray();
                }
            }
            boolean fallbackToBoxOnly =
                    helper.performTextReplacement(doc, allFound, listOfText, useRegex, wholeWord);
            String effectiveColor =
                    (request.getRedactColor() == null || request.getRedactColor().isBlank())
                            ? "#000000"
                            : request.getRedactColor();
            if (fallbackToBoxOnly) {
                fallback = pdfDocumentFactory.load(request.getFileInput());
                allFound =
                        RedactionService.findTextToRedact(
                                fallback, listOfText, useRegex, wholeWord);
                return RedactionService.finalizeRedaction(
                        fallback,
                        allFound,
                        effectiveColor,
                        request.getCustomPadding(),
                        request.getConvertPDFToImage(),
                        false);
            }
            return RedactionService.finalizeRedaction(
                    doc,
                    allFound,
                    effectiveColor,
                    request.getCustomPadding(),
                    request.getConvertPDFToImage(),
                    false);
        } catch (Exception e) {
            throw new IOException("Moderate redaction failed: " + e.getMessage(), e);
        } finally {
            if (doc != null)
                try {
                    doc.close();
                } catch (IOException ignore) {
                }
            if (fallback != null)
                try {
                    fallback.close();
                } catch (IOException ignore) {
                }
        }
    }
}
