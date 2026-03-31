package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import lombok.Data;
import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.ai.AiWorkflowOutcome;
import stirling.software.SPDF.model.api.ai.AiWorkflowRequest;
import stirling.software.SPDF.model.api.ai.AiWorkflowResponse;
import stirling.software.SPDF.model.api.ai.AiWorkflowTextSelection;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class AiWorkflowService {

    private static final int MAX_CHARACTERS_PER_PAGE = 4_000;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final AiEngineClient aiEngineClient;
    private final ObjectMapper objectMapper;

    private sealed interface StepResult {
        record Continue() implements StepResult {}

        record Done(AiWorkflowResponse response) implements StepResult {}
    }

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request) throws IOException {
        validateRequest(request);

        WorkflowTurnRequest turnRequest = new WorkflowTurnRequest();
        turnRequest.setUserMessage(request.getUserMessage().trim());
        turnRequest.setFileName(request.getFileInput().getOriginalFilename());

        try (PDDocument document = pdfDocumentFactory.load(request.getFileInput(), true)) {
            boolean textExtracted = false;

            while (true) {
                AiWorkflowResponse response = invokeOrchestrator(turnRequest);
                StepResult result =
                        switch (response.getOutcome()) {
                            case NEED_TEXT ->
                                    onNeedText(response, document, turnRequest, textExtracted);
                            case ANSWER,
                                NOT_FOUND,
                                PLAN,
                                CLARIFICATION_REQUEST,
                                CANNOT_DO,
                                UNSUPPORTED_CAPABILITY,
                                CANNOT_CONTINUE ->
                                    new StepResult.Done(response);
                        };

                switch (result) {
                    case StepResult.Continue c -> textExtracted = true;
                    case StepResult.Done d -> {
                        return d.response();
                    }
                }
            }
        }
    }

    private StepResult onNeedText(
            AiWorkflowResponse response,
            PDDocument document,
            WorkflowTurnRequest turnRequest,
            boolean textExtracted)
            throws IOException {
        if (textExtracted) {
            return new StepResult.Done(
                    cannotContinue("AI engine requested text extraction more than once."));
        }

        List<AiWorkflowTextSelection> extractedPages = extractRequestedText(response, document);
        turnRequest.setArtifacts(List.of(createExtractedTextArtifact(extractedPages)));
        turnRequest.setResumeWith(response.getResumeWith());
        return new StepResult.Continue();
    }

    private void validateRequest(AiWorkflowRequest request) {
        if (request.getFileInput().isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
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

    private List<AiWorkflowTextSelection> extractRequestedText(
            AiWorkflowResponse response, PDDocument document) throws IOException {
        List<Integer> selectedPages =
                selectPages(
                        document.getNumberOfPages(),
                        response.getPageNumbers(),
                        response.getMaxPages());
        return extractPageText(document, selectedPages, response.getMaxCharacters());
    }

    private List<Integer> selectPages(
            int totalPages, List<Integer> requestedPageNumbers, int maxPages) {
        if (totalPages <= 0) {
            throw ExceptionUtils.createPdfNoPages();
        }

        List<Integer> pages = new ArrayList<>();

        if (requestedPageNumbers == null || requestedPageNumbers.isEmpty()) {
            for (int pageNumber = 1;
                    pageNumber <= totalPages && pages.size() < maxPages;
                    pageNumber++) {
                pages.add(pageNumber);
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

    private ExtractedTextArtifact createExtractedTextArtifact(List<AiWorkflowTextSelection> pages) {
        ExtractedTextArtifact artifact = new ExtractedTextArtifact();
        artifact.setPages(pages);
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

    @Data
    private static class WorkflowTurnRequest {
        private String userMessage;
        private String fileName;
        private List<ExtractedTextArtifact> artifacts = new ArrayList<>();
        private String resumeWith;
    }

    @Data
    private static class ExtractedTextArtifact {
        private final String kind = "extracted_text";
        private List<AiWorkflowTextSelection> pages = new ArrayList<>();
    }
}
