package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.annotation.JsonValue;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection;

@Slf4j
@Service
public class PdfContentExtractor {

    private static final int MAX_CHARACTERS_PER_PAGE = 4_000;

    record LoadedFile(String fileName, PDDocument document) {}

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
        ArtifactKind getArtifactKind();

        default int pagesConsumed() {
            return 0;
        }

        default int charactersConsumed() {
            return 0;
        }
    }

    /**
     * Values MUST match {@code ArtifactKind} in {@code engine/src/stirling/contracts/common.py}.
     */
    enum ArtifactKind {
        EXTRACTED_TEXT("extracted_text");

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
}
