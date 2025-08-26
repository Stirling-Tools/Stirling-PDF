package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@Service
public final class ModerateRedactionService implements RedactionModeStrategy {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RedactionService helper;

    ModerateRedactionService(CustomPDFDocumentFactory pdfDocumentFactory, RedactionService helper) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.helper = helper;
    }

    private static String[] extractSearchTerms(RedactPdfRequest request) {
        if (request == null || request.getListOfText() == null) {
            return new String[0];
        }
        // Normalize by line breaks (handles \n, \r\n, etc.), trim, and drop blanks/duplicates while
        // preserving order
        List<String> terms =
                Arrays.stream(request.getListOfText().split("\\R"))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .distinct()
                        .collect(Collectors.toList());
        return terms.toArray(new String[0]);
    }

    private static byte[] toByteArray(PDDocument doc) throws IOException {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Override
    public byte[] redact(RedactPdfRequest request) throws IOException {
        String[] listOfText = extractSearchTerms(request);
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWord = Boolean.TRUE.equals(request.getWholeWordSearch());

        try (PDDocument doc = pdfDocumentFactory.load(request.getFileInput())) {
            // If no valid search terms provided, return original document unmodified
            if (listOfText.length == 0) {
                return toByteArray(doc);
            }

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
}
