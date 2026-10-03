package stirling.software.SPDF.controller.api.security;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.springframework.stereotype.Service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.utils.text.TextFinderUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.redact.PdfRedactor;
import stirling.software.jpdfium.redact.RedactOptions;
import stirling.software.jpdfium.redact.RedactResult;

@Service
@Slf4j
class TextRedactionService {

    Map<Integer, List<PDFText>> findTextToRedact(
            PDDocument document, String[] listOfText, boolean useRegex, boolean wholeWordSearch) {

        Set<String> terms =
                Arrays.stream(listOfText)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty() && s.length() <= 4096)
                        .collect(Collectors.toSet());

        if (terms.isEmpty()) {
            return new HashMap<>();
        }

        List<Pattern> patterns =
                TextFinderUtils.createOptimizedSearchPatterns(terms, useRegex, wholeWordSearch);

        if (patterns.isEmpty()) {
            return new HashMap<>();
        }

        log.debug(
                "Scanning document once for {} pattern(s) (useRegex={}, wholeWord={})",
                patterns.size(),
                useRegex,
                wholeWordSearch);

        try {
            MultiPatternTextFinder finder = new MultiPatternTextFinder(patterns);
            finder.getText(document);
            Map<Integer, List<PDFText>> result = finder.getFoundTextsByPage();
            int total = result.values().stream().mapToInt(List::size).sum();
            log.debug("Multi-pattern scan: {} match(es) across {} page(s)", total, result.size());
            return result;
        } catch (Exception e) {
            log.error("Multi-pattern text search failed: {}", e.getMessage());
            return new HashMap<>();
        }
    }

    boolean performTextReplacement(
            PDDocument document,
            Map<Integer, List<PDFText>> allFoundTextsByPage,
            String[] listOfText,
            boolean useRegex,
            boolean wholeWordSearchBool) {
        if (allFoundTextsByPage == null || allFoundTextsByPage.isEmpty()) {
            return false;
        }

        List<String> terms =
                Arrays.stream(listOfText)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty() && s.length() <= 4096)
                        .toList();

        if (terms.isEmpty()) {
            return false;
        }

        File tempIn = null;
        File tempOut = null;
        try {
            tempIn = File.createTempFile("jpdfium_redact_in_", ".pdf");
            tempOut = File.createTempFile("jpdfium_redact_out_", ".pdf");

            document.save(tempIn);

            RedactOptions options =
                    RedactOptions.builder()
                            .addWords(terms)
                            .useRegex(useRegex)
                            .wholeWord(wholeWordSearchBool)
                            .boxColor(0)
                            .removeContent(true)
                            .normalizeFonts(false)
                            .fixToUnicode(false)
                            .repairWidths(false)
                            .glyphAware(true)
                            .ligatureAware(true)
                            .bidiAware(true)
                            .graphemeSafe(true)
                            .sanitizeStructure(false)
                            .build();

            try (PdfDocument checkDoc = PdfDocument.open(tempIn.toPath())) {
                if (checkDoc.pageCount() <= 0) {
                    return true;
                }
            }

            // Never log the terms themselves - they are the secret being removed.
            log.debug("Calling JPDFium PdfRedactor.redact ({} term(s))", terms.size());
            RedactResult result = PdfRedactor.redact(tempIn.toPath(), options);
            log.debug(
                    "JPDFium PdfRedactor.redact complete (matches={})",
                    result != null ? result.totalMatches() : -1);
            if (result == null) {
                log.warn(
                        "JPDFium PdfRedactor.redact returned null result, falling back to box-only redaction mode");
                return true;
            }

            try {
                result.save(tempOut.toPath());
            } finally {
                if (result.document() != null) {
                    result.document().close();
                }
            }

            try (PDDocument redactedDoc = Loader.loadPDF(tempOut)) {
                while (document.getNumberOfPages() > 0) {
                    document.removePage(0);
                }
                PDFMergerUtility merger = new PDFMergerUtility();
                merger.appendDocument(document, redactedDoc);
            }

            log.info("JPDFium text replacement complete: {} total matches", result.totalMatches());
            return false;
        } catch (Exception e) {
            log.warn(
                    "JPDFium native text replacement failed, falling back to box-only redaction mode: {}",
                    e.getMessage());
            return true;
        } finally {
            if (tempIn != null && tempIn.exists()) {
                try {
                    Files.delete(tempIn.toPath());
                } catch (IOException _) {
                    log.warn("Failed to delete temporary file: {}", tempIn.getAbsolutePath());
                }
            }
            if (tempOut != null && tempOut.exists()) {
                try {
                    Files.delete(tempOut.toPath());
                } catch (IOException _) {
                    log.warn("Failed to delete temporary file: {}", tempOut.getAbsolutePath());
                }
            }
        }
    }

    @Data
    @AllArgsConstructor
    static class TextSegment {
        private int tokenIndex;
        private String operatorName;
        private String text;
        private int startPos;
        private int endPos;
        private PDFont font;
        private float fontSize;
    }

    @Data
    @AllArgsConstructor
    static class MatchRange {
        private int startPos;
        private int endPos;
    }
}
