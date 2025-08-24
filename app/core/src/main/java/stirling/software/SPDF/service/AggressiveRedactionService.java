package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

class AggressiveRedactionService implements RedactionModeStrategy {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RedactionService helper;

    AggressiveRedactionService(
            CustomPDFDocumentFactory pdfDocumentFactory, RedactionService helper) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.helper = helper;
    }

    @Override
    public byte[] redact(RedactPdfRequest request) throws IOException {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWord = Boolean.TRUE.equals(request.getWholeWordSearch());

        PDDocument doc = null;
        PDDocument fb = null;
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
            helper.performTextReplacementAggressive(doc, allFound, listOfText, useRegex, wholeWord);
            Map<Integer, List<PDFText>> residual =
                    RedactionService.findTextToRedact(doc, listOfText, useRegex, wholeWord);
            boolean residualExists = residual.values().stream().mapToInt(List::size).sum() > 0;
            String effectiveColor =
                    (request.getRedactColor() == null || request.getRedactColor().isBlank())
                            ? "#000000"
                            : request.getRedactColor();
            if (residualExists) {
                fb = pdfDocumentFactory.load(request.getFileInput());
                Map<Integer, List<PDFText>> fbFound =
                        RedactionService.findTextToRedact(fb, listOfText, useRegex, wholeWord);
                return RedactionService.finalizeRedaction(
                        fb,
                        fbFound,
                        effectiveColor,
                        request.getCustomPadding(), /*force*/
                        true,
                        false);
            }
            return RedactionService.finalizeRedaction(
                    doc,
                    allFound,
                    request.getRedactColor(),
                    request.getCustomPadding(),
                    request.getConvertPDFToImage(), /*text removal*/
                    true);
        } catch (Exception e) {
            throw new IOException("Aggressive redaction failed: " + e.getMessage(), e);
        } finally {
            if (doc != null)
                try {
                    doc.close();
                } catch (IOException ignore) {
                }
            if (fb != null)
                try {
                    fb.close();
                } catch (IOException ignore) {
                }
        }
    }
}
