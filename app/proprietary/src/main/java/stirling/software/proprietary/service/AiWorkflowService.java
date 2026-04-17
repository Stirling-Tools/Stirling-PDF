package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowPhase;
import stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.service.PdfContentExtractor.LoadedFile;
import stirling.software.proprietary.service.PdfContentExtractor.PdfContentResult;
import stirling.software.proprietary.service.PdfContentExtractor.WorkflowArtifact;

import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiWorkflowService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final AiEngineClient aiEngineClient;
    private final PdfContentExtractor pdfContentExtractor;
    private final ObjectMapper objectMapper;

    @FunctionalInterface
    public interface ProgressListener {
        void onProgress(AiWorkflowProgressEvent event);
    }

    private static final ProgressListener NOOP_LISTENER = event -> {};

    private sealed interface WorkflowState {
        record Pending(WorkflowTurnRequest request) implements WorkflowState {}

        record Terminal(AiWorkflowResponse response) implements WorkflowState {}
    }

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request) throws IOException {
        return orchestrate(request, NOOP_LISTENER);
    }

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request, ProgressListener listener)
            throws IOException {
        validateRequest(request);

        Map<String, MultipartFile> filesByName = new LinkedHashMap<>();
        for (AiWorkflowFileInput fileInput : request.getFileInputs()) {
            filesByName.put(
                    fileInput.getFileInput().getOriginalFilename(), fileInput.getFileInput());
        }

        WorkflowTurnRequest initialRequest = new WorkflowTurnRequest();
        initialRequest.setUserMessage(request.getUserMessage().trim());
        initialRequest.setFileNames(new ArrayList<>(filesByName.keySet()));

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.ANALYZING));

        WorkflowState state = new WorkflowState.Pending(initialRequest);
        while (state instanceof WorkflowState.Pending pending) {
            state = advance(pending.request(), filesByName, listener);
        }
        return ((WorkflowState.Terminal) state).response();
    }

    private WorkflowState advance(
            WorkflowTurnRequest request,
            Map<String, MultipartFile> filesByName,
            ProgressListener listener)
            throws IOException {
        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.CALLING_ENGINE));
        AiWorkflowResponse response = invokeOrchestrator(request);
        return switch (response.getOutcome()) {
            case NEED_CONTENT -> onNeedContent(response, filesByName, request, listener);
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
            WorkflowTurnRequest request,
            ProgressListener listener)
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

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.EXTRACTING_CONTENT));

        List<LoadedFile> loadedFiles = new ArrayList<>();
        try {
            for (String fileName : fileNamesToLoad) {
                PDDocument doc = pdfDocumentFactory.load(filesByName.get(fileName), true);
                loadedFiles.add(new LoadedFile(fileName, doc));
            }

            List<PdfContentResult> contentResults =
                    pdfContentExtractor.extractContent(
                            loadedFiles,
                            requestedByName,
                            response.getMaxPages(),
                            response.getMaxCharacters());

            listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.PROCESSING));

            WorkflowTurnRequest nextRequest = new WorkflowTurnRequest();
            nextRequest.setUserMessage(request.getUserMessage());
            nextRequest.setFileNames(request.getFileNames());
            nextRequest.setArtifacts(pdfContentExtractor.buildArtifacts(contentResults));
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

    @Data
    private static class WorkflowTurnRequest {
        private String userMessage;
        private List<String> fileNames = new ArrayList<>();
        private List<WorkflowArtifact> artifacts = new ArrayList<>();
        private String resumeWith;
    }
}
