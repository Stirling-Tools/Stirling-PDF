package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;
import stirling.software.proprietary.model.api.ai.AiConversationMessage;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowPhase;
import stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowResultFile;
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
    private final InternalApiClient internalApiClient;
    private final FileStorage fileStorage;
    private final ToolMetadataService toolMetadataService;
    private final TempFileManager tempFileManager;

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
        initialRequest.setConversationHistory(
                request.getConversationHistory() == null
                        ? new ArrayList<>()
                        : new ArrayList<>(request.getConversationHistory()));

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
            case TOOL_CALL -> onToolCall(response, filesByName, listener);
            case PLAN -> onPlan(response, filesByName, listener);
            case ANSWER,
                    NOT_FOUND,
                    NEED_CLARIFICATION,
                    CANNOT_DO,
                    DRAFT,
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
            nextRequest.setConversationHistory(request.getConversationHistory());
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

    @SuppressWarnings("unchecked")
    private WorkflowState onToolCall(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesByName,
            ProgressListener listener) {
        String endpointPath = response.getTool();
        Map<String, Object> parameters = response.getParameters();
        if (endpointPath == null || endpointPath.isBlank()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine returned tool_call without a tool endpoint."));
        }
        if (parameters == null) {
            parameters = Map.of();
        }

        try {
            List<Resource> inputFiles = toResources(filesByName);
            listener.onProgress(
                    AiWorkflowProgressEvent.executingTool(endpointPath, 1, 1, parameters));
            StepOutput output = executeStep(endpointPath, parameters, inputFiles);
            String summary = output.summary() != null ? output.summary() : response.getRationale();
            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            summary, output.files(), new ArrayList<>(filesByName.keySet())));
        } catch (Exception e) {
            log.error("Failed to execute tool {}: {}", endpointPath, e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue("Tool execution failed: " + e.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    private WorkflowState onPlan(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesByName,
            ProgressListener listener) {
        List<Map<String, Object>> steps = response.getSteps();
        if (steps == null || steps.isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine returned a plan with no steps."));
        }

        try {
            List<Resource> currentFiles = toResources(filesByName);

            for (int i = 0; i < steps.size(); i++) {
                Map<String, Object> step = steps.get(i);
                String endpointPath = (String) step.get("tool");
                Map<String, Object> parameters =
                        step.containsKey("parameters")
                                ? (Map<String, Object>) step.get("parameters")
                                : Map.of();

                if (endpointPath == null || endpointPath.isBlank()) {
                    return new WorkflowState.Terminal(
                            cannotContinue("Plan step " + (i + 1) + " has no tool endpoint."));
                }

                listener.onProgress(
                        AiWorkflowProgressEvent.executingTool(
                                endpointPath, i + 1, steps.size(), parameters));
                StepOutput output = executeStep(endpointPath, parameters, currentFiles);
                currentFiles = output.files();
            }

            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            response.getSummary(),
                            currentFiles,
                            new ArrayList<>(filesByName.keySet())));
        } catch (Exception e) {
            log.error("Failed to execute plan: {}", e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue("Plan execution failed: " + e.getMessage()));
        }
    }

    /** Files produced by a single tool step, plus an optional human-readable summary. */
    private record StepOutput(List<Resource> files, String summary) {}

    /**
     * Execute a single tool step. If the endpoint accepts multiple files, all files are sent in one
     * call. Otherwise, the endpoint is called once per file. ZIP responses are unpacked so each
     * inner file is treated as its own result (e.g. split outputs a ZIP of pages).
     */
    private StepOutput executeStep(
            String toolId, Map<String, Object> parameters, List<Resource> inputFiles)
            throws IOException {
        if (toolMetadataService.isMultiInput(toolId)) {
            return callEndpoint(toolId, parameters, inputFiles);
        } else {
            List<Resource> results = new ArrayList<>();
            String lastSummary = null;
            for (Resource file : inputFiles) {
                StepOutput output = callEndpoint(toolId, parameters, List.of(file));
                results.addAll(output.files());
                if (output.summary() != null) {
                    lastSummary = output.summary();
                }
            }
            return new StepOutput(results, lastSummary);
        }
    }

    /**
     * Call an endpoint and return the response body plus any {@code X-Stirling-Summary} header.
     * Endpoints that are declared as ZIP-returning in the API spec (multi-output, or {@code
     * Output:ZIP-*}) are unpacked into their individual entries so callers always see a flat list
     * of result files.
     */
    private StepOutput callEndpoint(
            String endpointPath, Map<String, Object> parameters, List<Resource> files)
            throws IOException {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        for (Resource file : files) {
            body.add("fileInput", file);
        }
        for (Map.Entry<String, Object> entry : parameters.entrySet()) {
            if (entry.getValue() instanceof List<?> list) {
                for (Object item : list) {
                    body.add(entry.getKey(), item);
                }
            } else {
                body.add(entry.getKey(), entry.getValue());
            }
        }
        ResponseEntity<Resource> response = internalApiClient.post(endpointPath, body);
        if (!HttpStatus.OK.equals(response.getStatusCode()) || response.getBody() == null) {
            throw new IOException(
                    "Tool returned HTTP " + response.getStatusCode() + " for " + endpointPath);
        }
        String summary = response.getHeaders().getFirst("X-Stirling-Summary");
        Resource resource = response.getBody();
        List<Resource> resultFiles;
        if (toolMetadataService.shouldUnpackZipResponse(endpointPath)) {
            resultFiles = ZipExtractionUtils.extractZip(resource, tempFileManager);
        } else {
            resultFiles = List.of(resource);
        }
        return new StepOutput(resultFiles, summary);
    }

    private List<Resource> toResources(Map<String, MultipartFile> filesByName) throws IOException {
        List<Resource> resources = new ArrayList<>();
        for (MultipartFile file : filesByName.values()) {
            TempFile tempFile = tempFileManager.createManagedTempFile("ai-workflow");
            file.transferTo(tempFile.getPath());
            final String originalName = Filenames.toSimpleFileName(file.getOriginalFilename());
            resources.add(
                    new FileSystemResource(tempFile.getFile()) {
                        @Override
                        public String getFilename() {
                            return originalName;
                        }
                    });
        }
        return resources;
    }

    private AiWorkflowResponse buildCompletedResponse(
            String summary, List<Resource> resultFiles, List<String> inputFileNames)
            throws IOException {
        // Store every output file individually so each gets its own Stirling file ID and the
        // frontend can add them as independent variants without going through a zip.
        boolean preserveInputNames = inputFileNames.size() == resultFiles.size();
        List<AiWorkflowResultFile> descriptors = new ArrayList<>();
        for (int i = 0; i < resultFiles.size(); i++) {
            Resource resource = resultFiles.get(i);
            String responseName = resource.getFilename();
            String inputName = preserveInputNames ? inputFileNames.get(i) : null;
            // Prefer the input name only for 1:1 operations where the output keeps the same
            // extension (rotate, compress, etc.). For converters and other extension-changing
            // tools, the response filename from Content-Disposition is authoritative.
            String name;
            if (inputName != null
                    && FilenameUtils.getExtension(inputName)
                            .equalsIgnoreCase(FilenameUtils.getExtension(responseName))) {
                name = inputName;
            } else if (responseName != null) {
                name = responseName;
            } else {
                name = "result-" + (i + 1);
            }
            String contentType =
                    MediaTypeFactory.getMediaType(name)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM)
                            .toString();
            String fileId;
            try (java.io.InputStream is = resource.getInputStream()) {
                fileId = fileStorage.storeInputStream(is, name).fileId();
            }
            descriptors.add(new AiWorkflowResultFile(fileId, name, contentType));
        }

        AiWorkflowResponse completed = new AiWorkflowResponse();
        completed.setOutcome(AiWorkflowOutcome.COMPLETED);
        completed.setSummary(summary);
        completed.setResultFiles(descriptors);
        // Mirror the first file into the legacy single-file fields so existing clients still work.
        if (!descriptors.isEmpty()) {
            AiWorkflowResultFile first = descriptors.getFirst();
            completed.setFileId(first.getFileId());
            completed.setFileName(first.getFileName());
            completed.setContentType(first.getContentType());
        }
        return completed;
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
        private List<AiConversationMessage> conversationHistory = new ArrayList<>();
        private List<WorkflowArtifact> artifacts = new ArrayList<>();
        private String resumeWith;
    }
}
