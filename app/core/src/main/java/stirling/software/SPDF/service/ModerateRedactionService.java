package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@Service
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

        try (PDDocument doc = pdfDocumentFactory.load(request.getFileInput())) {
            Map<Integer, List<PDFText>> allFound =
                    RedactionService.findTextToRedact(doc, listOfText, useRegex, wholeWord);
            if (allFound.isEmpty()) {
                return toByteArray(doc);
            }

            boolean fallbackToBoxOnly =
                    helper.performTextReplacement(doc, allFound, listOfText, useRegex, wholeWord);
            if (fallbackToBoxOnly) {
                return helper.performVisualRedactionWithOcrRestoration(
                        request, listOfText, useRegex, wholeWord);
            }

            return RedactionService.finalizeRedaction(
                    doc,
                    allFound,
                    request.getRedactColor(),
                    request.getCustomPadding(),
                    request.getConvertPDFToImage(),
                    false);
        } catch (Exception e) {
            throw new IOException("Moderate redaction failed: " + e.getMessage(), e);
        }
    }

    private byte[] toByteArray(PDDocument doc) throws IOException {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
