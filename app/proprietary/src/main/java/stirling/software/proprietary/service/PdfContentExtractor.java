package stirling.software.proprietary.service;

import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonValue;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.pdf.FlexibleCSVWriter;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@Slf4j
@Service
public class PdfContentExtractor {

    private static final int MAX_CHARACTERS_PER_PAGE = 4_000;

    private static final int TEXT_PRESENCE_THRESHOLD = 20;

    record LoadedFile(String fileName, PDDocument document) {}

    // -----------------------------------------------------------------------
    // Low-level extraction methods (usable by any agent)
    // -----------------------------------------------------------------------

    /**
     * Classify a single page as TEXT, IMAGE, or MIXED.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     */
    public FolioType classifyPage(PDDocument document, int pageNumber) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);
        String text = stripper.getText(document).trim();

        boolean hasText = text.length() > TEXT_PRESENCE_THRESHOLD;
        boolean hasImages = PdfUtils.hasImagesOnPage(document.getPage(pageNumber - 1));

        if (hasText && hasImages) {
            return FolioType.MIXED;
        } else if (hasText) {
            return FolioType.TEXT;
        } else {
            return FolioType.IMAGE;
        }
    }

    /**
     * Extract plain text from a single page, clipped to {@link #MAX_CHARACTERS_PER_PAGE}.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     * @return trimmed text, or empty string if the page has no extractable text
     */
    public String extractPageTextRaw(PDDocument document, int pageNumber) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);
        String text = stripper.getText(document).trim();
        return clip(text, MAX_CHARACTERS_PER_PAGE);
    }

    /**
     * Extract all tables from a single page as CSV strings.
     *
     * @param document the open PDF
     * @param pageNumber 1-based page number
     * @return list of CSV strings (one per table), empty if no tables found
     */
    public List<String> extractTablesAsCsv(PDDocument document, int pageNumber) throws IOException {
        SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
        CSVFormat format =
                CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();
        List<String> csvStrings = new ArrayList<>();

        try (ObjectExtractor extractor = new ObjectExtractor(document)) {
            Page tabulaPage = extractor.extract(pageNumber);
            List<Table> tables = sea.extract(tabulaPage);

            for (Table table : tables) {
                StringWriter sw = new StringWriter();
                FlexibleCSVWriter csvWriter = new FlexibleCSVWriter(format);
                csvWriter.write(sw, Collections.singletonList(table));
                csvStrings.add(sw.toString());
            }
        }
        return csvStrings;
    }

    // -----------------------------------------------------------------------
    // Workflow extraction (used by AiWorkflowService)
    // -----------------------------------------------------------------------

    /**
     * Extracts content from the loaded files according to the requested content types and budget
     * constraints.
     */
    List<PdfContentResult> extractContent(
            List<LoadedFile> loadedFiles,
            Map<String, AiWorkflowFileRequest> requestedByName,
            int maxPages,
            int maxCharacters)
            throws IOException {
        List<PdfContentResult> contentResults = new ArrayList<>();
        int remainingPages = maxPages;
        int remainingCharacters = maxCharacters;

        for (LoadedFile lf : loadedFiles) {
            if (remainingPages <= 0 || remainingCharacters <= 0) break;
            AiWorkflowFileRequest fileReq = requestedByName.get(lf.fileName());
            List<AiPdfContentType> contentTypes =
                    fileReq != null && !fileReq.getContentTypes().isEmpty()
                            ? fileReq.getContentTypes()
                            : List.of(AiPdfContentType.PAGE_TEXT);

            for (AiPdfContentType contentType : contentTypes) {
                Optional<PdfContentResult> result =
                        dispatchContentType(
                                contentType, lf, fileReq, remainingPages, remainingCharacters);
                if (result.isPresent()) {
                    PdfContentResult content = result.get();
                    contentResults.add(content);
                    remainingPages -= content.pagesConsumed();
                    remainingCharacters -= content.charactersConsumed();
                }
            }
        }
        return contentResults;
    }

    /** Groups content results by artifact kind and builds the corresponding workflow artifacts. */
    List<WorkflowArtifact> buildArtifacts(List<PdfContentResult> results) {
        List<WorkflowArtifact> artifacts = new ArrayList<>();
        Map<ArtifactKind, List<PdfContentResult>> byKind =
                results.stream().collect(Collectors.groupingBy(PdfContentResult::getArtifactKind));
        for (var entry : byKind.entrySet()) {
            artifacts.add(buildArtifact(entry.getKey(), entry.getValue()));
        }
        return artifacts;
    }

    private Optional<PdfContentResult> dispatchContentType(
            AiPdfContentType contentType,
            LoadedFile lf,
            AiWorkflowFileRequest fileReq,
            int remainingPages,
            int remainingCharacters)
            throws IOException {
        return switch (contentType) {
            case PAGE_TEXT, FULL_TEXT ->
                    Optional.<PdfContentResult>ofNullable(
                            extractText(lf, fileReq, remainingPages, remainingCharacters));
            default -> {
                log.warn(
                        "Content type {} not yet implemented, skipping for {}",
                        contentType,
                        lf.fileName());
                yield Optional.empty();
            }
        };
    }

    private ExtractedFileText extractText(
            LoadedFile lf,
            AiWorkflowFileRequest fileReq,
            int remainingPages,
            int remainingCharacters)
            throws IOException {
        List<Integer> requestedPages = fileReq != null ? fileReq.getPageNumbers() : null;
        List<Integer> pages =
                selectPages(lf.document().getNumberOfPages(), requestedPages, remainingPages);
        List<AiWorkflowTextSelection> extracted =
                extractPageText(lf.document(), pages, remainingCharacters);
        return extracted.isEmpty() ? null : buildExtractedFileText(lf.fileName(), extracted);
    }

    private WorkflowArtifact buildArtifact(ArtifactKind kind, List<PdfContentResult> results) {
        return switch (kind) {
            case EXTRACTED_TEXT -> {
                ExtractedTextArtifact artifact = new ExtractedTextArtifact();
                artifact.setFiles(results.stream().map(ExtractedFileText.class::cast).toList());
                yield artifact;
            }
            case TOOL_REPORT ->
                    // TOOL_REPORT artifacts don't come from PDF content extraction — they're
                    // built by AiWorkflowService from tool-response metadata. Never reached
                    // from this code path; presence in the enum is to satisfy the switch.
                    throw new IllegalArgumentException(
                            "TOOL_REPORT artifacts are not produced by PdfContentExtractor");
        };
    }

    private List<Integer> selectPages(
            int totalPages, List<Integer> requestedPageNumbers, int maxPages) {
        if (totalPages <= 0) {
            throw ExceptionUtils.createPdfNoPages();
        }

        List<Integer> pages = new ArrayList<>();

        if (requestedPageNumbers == null || requestedPageNumbers.isEmpty()) {
            for (int p = 1; p <= totalPages && pages.size() < maxPages; p++) {
                pages.add(p);
            }
            return pages;
        }

        Set<Integer> deduplicatedPages = new LinkedHashSet<>(requestedPageNumbers);
        for (Integer pageNumber : deduplicatedPages) {
            if (pageNumber == null || pageNumber < 1 || pageNumber > totalPages) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidPageNumber",
                        "Requested page number %s is outside the PDF page range.",
                        pageNumber);
            }
            pages.add(pageNumber);
            if (pages.size() >= maxPages) {
                break;
            }
        }
        return pages;
    }

    private List<AiWorkflowTextSelection> extractPageText(
            PDDocument document, List<Integer> selectedPages, int maxCharacters)
            throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        List<AiWorkflowTextSelection> pages = new ArrayList<>();
        int remainingCharacters = maxCharacters;

        for (Integer pageNumber : selectedPages) {
            if (remainingCharacters <= 0) {
                break;
            }

            textStripper.setStartPage(pageNumber);
            textStripper.setEndPage(pageNumber);

            String pageText = textStripper.getText(document).trim();
            if (pageText.isBlank()) {
                continue;
            }

            int allowedCharacters = Math.min(remainingCharacters, MAX_CHARACTERS_PER_PAGE);
            String clippedText = clip(pageText, allowedCharacters);
            if (clippedText.isBlank()) {
                continue;
            }

            AiWorkflowTextSelection selection = new AiWorkflowTextSelection();
            selection.setPageNumber(pageNumber);
            selection.setText(clippedText);
            pages.add(selection);
            remainingCharacters -= clippedText.length();
        }
        return pages;
    }

    private ExtractedFileText buildExtractedFileText(
            String fileName, List<AiWorkflowTextSelection> pages) {
        ExtractedFileText fileText = new ExtractedFileText();
        fileText.setFileName(fileName);
        fileText.setPages(pages);
        return fileText;
    }

    private String clip(String text, int maxLength) {
        if (text.length() <= maxLength) {
            return text;
        }
        // Avoid splitting a surrogate pair at the boundary
        int end = maxLength;
        if (Character.isHighSurrogate(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(0, end);
    }

    // --- Types shared with AiWorkflowService (package-private) ---

    interface PdfContentResult {
        @JsonIgnore
        ArtifactKind getArtifactKind();

        @JsonIgnore
        default int pagesConsumed() {
            return 0;
        }

        @JsonIgnore
        default int charactersConsumed() {
            return 0;
        }
    }

    /**
     * Values MUST match {@code ArtifactKind} in {@code engine/src/stirling/contracts/common.py}.
     */
    enum ArtifactKind {
        EXTRACTED_TEXT("extracted_text"),
        TOOL_REPORT("tool_report");

        private final String value;

        ArtifactKind(String value) {
            this.value = value;
        }

        @JsonValue
        public String getValue() {
            return value;
        }
    }

    interface WorkflowArtifact {
        ArtifactKind getKind();
    }

    @Data
    static class ExtractedFileText implements PdfContentResult {
        private String fileName;
        private List<AiWorkflowTextSelection> pages = new ArrayList<>();

        @Override
        public ArtifactKind getArtifactKind() {
            return ArtifactKind.EXTRACTED_TEXT;
        }

        @Override
        public int pagesConsumed() {
            return pages.size();
        }

        @Override
        public int charactersConsumed() {
            return pages.stream().mapToInt(p -> p.getText().length()).sum();
        }
    }

    @Data
    static final class ExtractedTextArtifact implements WorkflowArtifact {
        private final ArtifactKind kind = ArtifactKind.EXTRACTED_TEXT;
        private List<ExtractedFileText> files = new ArrayList<>();
    }

    /**
     * Carries a structured report produced by a specialist tool back to the orchestrator on a
     * resume turn. Shape matches {@code engine/src/stirling/contracts/common.py ToolReportArtifact}
     * — {@code sourceTool} must be a valid endpoint path string.
     */
    @Data
    static final class ToolReportArtifact implements WorkflowArtifact {
        private final ArtifactKind kind = ArtifactKind.TOOL_REPORT;
        private String sourceTool;
        private tools.jackson.databind.JsonNode report;

        ToolReportArtifact() {}

        ToolReportArtifact(String sourceTool, tools.jackson.databind.JsonNode report) {
            this.sourceTool = sourceTool;
            this.report = report;
        }
    }
}
