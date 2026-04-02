package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.annotation.JsonValue;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection;

import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiWorkflowService {

    private static final int MAX_CHARACTERS_PER_PAGE = 4_000;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final AiEngineClient aiEngineClient;
    private final ObjectMapper objectMapper;

    private sealed interface WorkflowState {
        record Pending(WorkflowTurnRequest request) implements WorkflowState {}

        record Terminal(AiWorkflowResponse response) implements WorkflowState {}
    }

    private record LoadedFile(String fileName, PDDocument document) {}

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request) throws IOException {
        validateRequest(request);

        Map<String, MultipartFile> filesByName = new LinkedHashMap<>();
        for (AiWorkflowFileInput fileInput : request.getFileInputs()) {
            filesByName.put(
                    fileInput.getFileInput().getOriginalFilename(), fileInput.getFileInput());
        }

        WorkflowTurnRequest initialRequest = new WorkflowTurnRequest();
        initialRequest.setUserMessage(request.getUserMessage().trim());
        initialRequest.setFileNames(new ArrayList<>(filesByName.keySet()));

        WorkflowState state = new WorkflowState.Pending(initialRequest);
        while (state instanceof WorkflowState.Pending pending) {
            state = advance(pending.request(), filesByName);
        }
        return ((WorkflowState.Terminal) state).response();
    }

    private WorkflowState advance(
            WorkflowTurnRequest request, Map<String, MultipartFile> filesByName)
            throws IOException {
        AiWorkflowResponse response = invokeOrchestrator(request);
        return switch (response.getOutcome()) {
            case NEED_CONTENT -> onNeedContent(response, filesByName, request);
            case ANSWER,
                    NOT_FOUND,
                    PLAN,
                    NEED_CLARIFICATION,
                    CANNOT_DO,
                    TOOL_CALL,
                    COMPLETED,
                    UNSUPPORTED_CAPABILITY,
                    CANNOT_CONTINUE ->
                    new WorkflowState.Terminal(response);
        };
    }

    private WorkflowState onNeedContent(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesByName,
            WorkflowTurnRequest request)
            throws IOException {
        if (!request.getArtifacts().isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine requested content extraction more than once."));
        }

        List<AiWorkflowFileRequest> requestedFiles = response.getFiles();

        // Validate requested file names before loading anything
        if (requestedFiles != null && !requestedFiles.isEmpty()) {
            for (AiWorkflowFileRequest fileReq : requestedFiles) {
                if (!filesByName.containsKey(fileReq.getFileName())) {
                    return new WorkflowState.Terminal(
                            cannotContinue(
                                    "AI engine requested unknown file: " + fileReq.getFileName()));
                }
            }
        }

        List<String> fileNamesToLoad =
                (requestedFiles == null || requestedFiles.isEmpty())
                        ? new ArrayList<>(filesByName.keySet())
                        : requestedFiles.stream().map(AiWorkflowFileRequest::getFileName).toList();

        Map<String, AiWorkflowFileRequest> requestedByName =
                requestedFiles == null || requestedFiles.isEmpty()
                        ? Map.of()
                        : requestedFiles.stream()
                                .collect(
                                        Collectors.toMap(
                                                AiWorkflowFileRequest::getFileName, r -> r));

        List<LoadedFile> loadedFiles = new ArrayList<>();
        try {
            for (String fileName : fileNamesToLoad) {
                PDDocument doc = pdfDocumentFactory.load(filesByName.get(fileName), true);
                loadedFiles.add(new LoadedFile(fileName, doc));
            }

            List<PdfContentResult> contentResults = new ArrayList<>();
            int remainingPages = response.getMaxPages();
            int remainingCharacters = response.getMaxCharacters();

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

            WorkflowTurnRequest nextRequest = new WorkflowTurnRequest();
            nextRequest.setUserMessage(request.getUserMessage());
            nextRequest.setFileNames(request.getFileNames());
            nextRequest.setArtifacts(buildArtifacts(contentResults));
            nextRequest.setResumeWith(response.getResumeWith());
            return new WorkflowState.Pending(nextRequest);
        } finally {
            for (LoadedFile lf : loadedFiles) {
                try {
                    lf.document().close();
                } catch (IOException e) {
                    log.warn("Failed to close PDF document: {}", lf.fileName(), e);
                }
            }
        }
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

    private void validateRequest(AiWorkflowRequest request) {
        for (AiWorkflowFileInput fileInput : request.getFileInputs()) {
            if (fileInput.getFileInput().isEmpty()) {
                throw ExceptionUtils.createFileNullOrEmptyException();
            }
        }
    }

    private AiWorkflowResponse cannotContinue(String reason) {
        AiWorkflowResponse response = new AiWorkflowResponse();
        response.setOutcome(AiWorkflowOutcome.CANNOT_CONTINUE);
        response.setReason(reason);
        return response;
    }

    private AiWorkflowResponse invokeOrchestrator(WorkflowTurnRequest request) throws IOException {
        String requestBody = objectMapper.writeValueAsString(request);
        String responseBody = aiEngineClient.post("/api/v1/orchestrator", requestBody);
        return objectMapper.readValue(responseBody, AiWorkflowResponse.class);
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

    private List<WorkflowArtifact> buildArtifacts(List<PdfContentResult> results) {
        List<WorkflowArtifact> artifacts = new ArrayList<>();
        Map<ArtifactKind, List<PdfContentResult>> byKind =
                results.stream().collect(Collectors.groupingBy(PdfContentResult::getArtifactKind));
        for (var entry : byKind.entrySet()) {
            artifacts.add(buildArtifact(entry.getKey(), entry.getValue()));
        }
        return artifacts;
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

    /**
     * Values MUST match {@code ArtifactKind} in {@code engine/src/stirling/contracts/common.py}.
     */
    private enum ArtifactKind {
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

    private interface WorkflowArtifact {
        ArtifactKind getKind();
    }

    @Data
    private static class WorkflowTurnRequest {
        private String userMessage;
        private List<String> fileNames = new ArrayList<>();
        private List<WorkflowArtifact> artifacts = new ArrayList<>();
        private String resumeWith;
    }

    private interface PdfContentResult {
        ArtifactKind getArtifactKind();

        default int pagesConsumed() {
            return 0;
        }

        default int charactersConsumed() {
            return 0;
        }
    }

    @Data
    private static class ExtractedFileText implements PdfContentResult {
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
    private static final class ExtractedTextArtifact implements WorkflowArtifact {
        private final ArtifactKind kind = ArtifactKind.EXTRACTED_TEXT;
        private List<ExtractedFileText> files = new ArrayList<>();
    }
}
