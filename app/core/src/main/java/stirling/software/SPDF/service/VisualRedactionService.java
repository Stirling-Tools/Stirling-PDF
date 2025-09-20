package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

class VisualRedactionService implements RedactionModeStrategy {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    VisualRedactionService(CustomPDFDocumentFactory pdfDocumentFactory, RedactionService helper) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @Override
    public byte[] redact(RedactPdfRequest request) throws IOException {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWord = Boolean.TRUE.equals(request.getWholeWordSearch());

        try (PDDocument document = pdfDocumentFactory.load(request.getFileInput())) {
            Map<Integer, List<PDFText>> allFound =
                    RedactionService.findTextToRedact(document, listOfText, useRegex, wholeWord);
            if (allFound.isEmpty()) {
                try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    document.save(baos);
                    return baos.toByteArray();
                }
            }
            String effectiveColor =
                    (request.getRedactColor() == null || request.getRedactColor().isBlank())
                            ? "#000000"
                            : request.getRedactColor();
            return RedactionService.finalizeRedaction(
                    document,
                    allFound,
                    effectiveColor,
                    request.getCustomPadding(),
                    request.getConvertPDFToImage(),
                    false);
        }
    }
}
