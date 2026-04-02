package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.annotation.JsonValue;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
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
        List<LoadedFile> loadedFiles = new ArrayList<>();
        try {
            for (AiWorkflowFileInput fileInput : request.getFileInputs()) {
                PDDocument doc = pdfDocumentFactory.load(fileInput.getFileInput(), true);
                loadedFiles.add(
                        new LoadedFile(fileInput.getFileInput().getOriginalFilename(), doc));
            }

            WorkflowTurnRequest initialRequest = new WorkflowTurnRequest();
            initialRequest.setUserMessage(request.getUserMessage().trim());
            initialRequest.setFileNames(loadedFiles.stream().map(LoadedFile::fileName).toList());

            WorkflowState state = new WorkflowState.Pending(initialRequest);
            while (state instanceof WorkflowState.Pending pending) {
                state = advance(pending.request(), loadedFiles);
            }
            return ((WorkflowState.Terminal) state).response();
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

    private WorkflowState advance(WorkflowTurnRequest request, List<LoadedFile> loadedFiles)
            throws IOException {
        AiWorkflowResponse response = invokeOrchestrator(request);
        return switch (response.getOutcome()) {
            case NEED_TEXT -> onNeedText(response, loadedFiles, request);
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

    private WorkflowState onNeedText(
            AiWorkflowResponse response, List<LoadedFile> loadedFiles, WorkflowTurnRequest request)
            throws IOException {
        if (!request.getArtifacts().isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine requested text extraction more than once."));
        }

        List<AiWorkflowFileRequest> requestedFiles = response.getFiles();
        List<ExtractedFileText> extracted;

        if (requestedFiles == null || requestedFiles.isEmpty()) {
            extracted =
                    extractFromAllFiles(
                            loadedFiles, response.getMaxPages(), response.getMaxCharacters());
        } else {
            Map<String, LoadedFile> filesByName =
                    loadedFiles.stream().collect(Collectors.toMap(LoadedFile::fileName, f -> f));
            for (AiWorkflowFileRequest fileReq : requestedFiles) {
                if (!filesByName.containsKey(fileReq.getFileName())) {
                    return new WorkflowState.Terminal(
                            cannotContinue(
                                    "AI engine requested unknown file: " + fileReq.getFileName()));
                }
            }
            extracted =
                    extractFromRequestedFiles(
                            requestedFiles,
                            filesByName,
                            response.getMaxPages(),
                            response.getMaxCharacters());
        }

        WorkflowTurnRequest nextRequest = new WorkflowTurnRequest();
        nextRequest.setUserMessage(request.getUserMessage());
        nextRequest.setFileNames(request.getFileNames());
        nextRequest.setArtifacts(List.of(createExtractedTextArtifact(extracted)));
        nextRequest.setResumeWith(response.getResumeWith());
        return new WorkflowState.Pending(nextRequest);
    }

    private record FileExtractionRequest(
            String fileName, PDDocument document, List<Integer> requestedPageNumbers) {}

    private List<ExtractedFileText> extractFromAllFiles(
            List<LoadedFile> loadedFiles, int maxPages, int maxCharacters) throws IOException {
        List<FileExtractionRequest> requests =
                loadedFiles.stream()
                        .map(lf -> new FileExtractionRequest(lf.fileName(), lf.document(), null))
                        .toList();
        return extractFiles(requests, maxPages, maxCharacters);
    }

    private List<ExtractedFileText> extractFromRequestedFiles(
            List<AiWorkflowFileRequest> requestedFiles,
            Map<String, LoadedFile> filesByName,
            int maxPages,
            int maxCharacters)
            throws IOException {
        List<FileExtractionRequest> requests =
                requestedFiles.stream()
                        .map(
                                r ->
                                        new FileExtractionRequest(
                                                r.getFileName(),
                                                filesByName.get(r.getFileName()).document(),
                                                r.getPageNumbers()))
                        .toList();
        return extractFiles(requests, maxPages, maxCharacters);
    }

    private List<ExtractedFileText> extractFiles(
            List<FileExtractionRequest> requests, int maxPages, int maxCharacters)
            throws IOException {
        List<ExtractedFileText> result = new ArrayList<>();
        int remainingPages = maxPages;
        int remainingCharacters = maxCharacters;
        for (FileExtractionRequest req : requests) {
            if (remainingPages <= 0 || remainingCharacters <= 0) break;
            List<Integer> pages =
                    selectPages(
                            req.document().getNumberOfPages(),
                            req.requestedPageNumbers(),
                            remainingPages);
            List<AiWorkflowTextSelection> extracted =
                    extractPageText(req.document(), pages, remainingCharacters);
            if (!extracted.isEmpty()) {
                result.add(buildExtractedFileText(req.fileName(), extracted));
                remainingPages -= extracted.size();
                remainingCharacters -= extracted.stream().mapToInt(s -> s.getText().length()).sum();
            }
        }
        return result;
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

    private ExtractedTextArtifact createExtractedTextArtifact(List<ExtractedFileText> files) {
        ExtractedTextArtifact artifact = new ExtractedTextArtifact();
        artifact.setFiles(files);
        return artifact;
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

    @Data
    private static class ExtractedFileText {
        private String fileName;
        private List<AiWorkflowTextSelection> pages = new ArrayList<>();
    }

    @Data
    private static final class ExtractedTextArtifact implements WorkflowArtifact {
        private final ArtifactKind kind = ArtifactKind.EXTRACTED_TEXT;
        private List<ExtractedFileText> files = new ArrayList<>();
    }
}
