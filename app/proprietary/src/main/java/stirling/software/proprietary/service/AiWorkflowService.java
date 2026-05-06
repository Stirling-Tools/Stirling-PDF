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
import org.springframework.http.HttpHeaders;
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
import stirling.software.proprietary.model.api.ai.AiFile;
import stirling.software.proprietary.model.api.ai.AiRagIngestRequest;
import stirling.software.proprietary.model.api.ai.AiRagPageText;
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

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiWorkflowService {

    private static final String RAG_DOCUMENTS_ENDPOINT = "/api/v1/rag/documents";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final AiEngineClient aiEngineClient;
    private final PdfContentExtractor pdfContentExtractor;
    private final ObjectMapper objectMapper;
    private final InternalApiClient internalApiClient;
    private final FileStorage fileStorage;
    private final ToolMetadataService toolMetadataService;
    private final TempFileManager tempFileManager;
    private final FileIdStrategy fileIdStrategy;
    private final AiEngineEndpointResolver endpointResolver;

    @FunctionalInterface
    public interface ProgressListener {
        void onProgress(AiWorkflowProgressEvent event);
    }

    private static final ProgressListener NOOP_LISTENER = event -> {};

    private sealed interface WorkflowState {
        record Pending(WorkflowTurnRequest request) implements WorkflowState {}

        record Terminal(AiWorkflowResponse response) implements WorkflowState {}
    }

    /**
     * Internal value-class for tool responses. {@code files} holds any result files (typically one;
     * multiple for ZIP-response tools). {@code report} holds an optional structured metadata
     * payload the tool chose to surface alongside (or instead of) a file.
     *
     * <p>Tools populate the report either by returning a JSON body (whole body → report) or by
     * adding the {@link AiToolResponseHeaders#TOOL_REPORT} header alongside a file body.
     */
    private record ToolResult(List<Resource> files, JsonNode report) {}

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request) throws IOException {
        return orchestrate(request, NOOP_LISTENER);
    }

    public AiWorkflowResponse orchestrate(AiWorkflowRequest request, ProgressListener listener)
            throws IOException {
        validateRequest(request);

        // Key by opaque file id, not filename. Filenames aren't guaranteed unique across an
        // upload (users can rotate the same 'scan.pdf' twice), and the engine identifies files
        // by id in every response shape that asks Java to look a file up again.
        Map<String, MultipartFile> filesById = new LinkedHashMap<>();
        List<AiFile> files = new ArrayList<>();
        for (AiWorkflowFileInput fileInput : request.getFileInputs()) {
            MultipartFile multipartFile = fileInput.getFileInput();
            AiFile aiFile =
                    new AiFile(
                            fileIdStrategy.idFor(multipartFile),
                            multipartFile.getOriginalFilename());
            filesById.put(aiFile.getId(), multipartFile);
            files.add(aiFile);
        }

        WorkflowTurnRequest initialRequest = new WorkflowTurnRequest();
        initialRequest.setUserMessage(request.getUserMessage().trim());
        initialRequest.setFiles(files);
        initialRequest.setConversationHistory(
                request.getConversationHistory() == null
                        ? new ArrayList<>()
                        : new ArrayList<>(request.getConversationHistory()));
        initialRequest.setEnabledEndpoints(endpointResolver.getEnabledEndpointUrls());

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.ANALYZING));

        WorkflowState state = new WorkflowState.Pending(initialRequest);
        while (state instanceof WorkflowState.Pending pending) {
            state = advance(pending.request(), filesById, listener);
        }
        return ((WorkflowState.Terminal) state).response();
    }

    private WorkflowState advance(
            WorkflowTurnRequest request,
            Map<String, MultipartFile> filesById,
            ProgressListener listener)
            throws IOException {
        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.CALLING_ENGINE));
        AiWorkflowResponse response = invokeOrchestrator(request);
        return switch (response.getOutcome()) {
            case NEED_CONTENT -> onNeedContent(response, filesById, request, listener);
            case NEED_INGEST -> onNeedIngest(response, filesById, request, listener);
            case TOOL_CALL -> onToolCall(response, filesById, listener);
            case PLAN -> onPlan(response, filesById, request, listener);
            case ANSWER -> onAnswer(response, filesById, request, listener);
            case NOT_FOUND,
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
            Map<String, MultipartFile> filesById,
            WorkflowTurnRequest request,
            ProgressListener listener)
            throws IOException {
        if (!request.getArtifacts().isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine requested content extraction more than once."));
        }

        List<AiWorkflowFileRequest> requestedFiles = response.getFiles();

        // Validate requested file ids before loading anything
        if (requestedFiles != null && !requestedFiles.isEmpty()) {
            for (AiWorkflowFileRequest fileReq : requestedFiles) {
                AiFile file = fileReq.getFile();
                if (file == null || !filesById.containsKey(file.getId())) {
                    String display = file == null ? "<missing file>" : file.getName();
                    return new WorkflowState.Terminal(
                            cannotContinue("AI engine requested unknown file: " + display));
                }
            }
        }

        List<AiFile> filesToLoad =
                (requestedFiles == null || requestedFiles.isEmpty())
                        ? new ArrayList<>(request.getFiles())
                        : requestedFiles.stream().map(AiWorkflowFileRequest::getFile).toList();

        Map<String, AiWorkflowFileRequest> requestedById =
                requestedFiles == null || requestedFiles.isEmpty()
                        ? Map.of()
                        : requestedFiles.stream()
                                .collect(Collectors.toMap(r -> r.getFile().getId(), r -> r));

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.EXTRACTING_CONTENT));

        List<LoadedFile> loadedFiles = new ArrayList<>();
        try {
            for (AiFile file : filesToLoad) {
                PDDocument doc = pdfDocumentFactory.load(filesById.get(file.getId()), true);
                loadedFiles.add(new LoadedFile(file.getId(), file.getName(), doc));
            }

            List<PdfContentResult> contentResults =
                    pdfContentExtractor.extractContent(
                            loadedFiles,
                            requestedById,
                            response.getMaxPages(),
                            response.getMaxCharacters());

            listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.PROCESSING));

            WorkflowTurnRequest nextRequest = new WorkflowTurnRequest();
            nextRequest.setUserMessage(request.getUserMessage());
            nextRequest.setFiles(request.getFiles());
            nextRequest.setConversationHistory(request.getConversationHistory());
            nextRequest.setArtifacts(pdfContentExtractor.buildArtifacts(contentResults));
            nextRequest.setResumeWith(response.getResumeWith());
            nextRequest.setEnabledEndpoints(request.getEnabledEndpoints());
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

    private WorkflowState onNeedIngest(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesById,
            WorkflowTurnRequest request,
            ProgressListener listener)
            throws IOException {
        List<AiFile> filesToIngest = response.getFilesToIngest();
        if (filesToIngest == null || filesToIngest.isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue(
                            "AI engine returned need_ingest without listing any files to ingest."));
        }
        // Guard against a retry loop: if we've already ingested this turn and the engine still
        // asks for more, something is wrong on its side.
        if (!request.getArtifacts().isEmpty() || request.getResumeWith() != null) {
            return new WorkflowState.Terminal(
                    cannotContinue(
                            "AI engine requested ingest after the workflow had already been resumed."));
        }

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.EXTRACTING_CONTENT));

        for (AiFile file : filesToIngest) {
            MultipartFile multipartFile = filesById.get(file.getId());
            if (multipartFile == null) {
                return new WorkflowState.Terminal(
                        cannotContinue(
                                "AI engine requested ingest for unknown file: " + file.getName()));
            }
            ingestFile(file, multipartFile);
        }

        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.PROCESSING));

        WorkflowTurnRequest nextRequest = new WorkflowTurnRequest();
        nextRequest.setUserMessage(request.getUserMessage());
        nextRequest.setFiles(request.getFiles());
        nextRequest.setConversationHistory(request.getConversationHistory());
        nextRequest.setResumeWith(response.getResumeWith());
        return new WorkflowState.Pending(nextRequest);
    }

    private void ingestFile(AiFile file, MultipartFile multipartFile) throws IOException {
        List<AiRagPageText> pages = new ArrayList<>();
        try (PDDocument document = pdfDocumentFactory.load(multipartFile, true)) {
            int pageCount = document.getNumberOfPages();
            for (int pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
                String pageText = pdfContentExtractor.extractPageTextRaw(document, pageNumber);
                if (pageText != null && !pageText.isBlank()) {
                    pages.add(new AiRagPageText(pageNumber, pageText));
                }
            }
        }
        AiRagIngestRequest ingestRequest =
                new AiRagIngestRequest(file.getId(), file.getName(), pages);
        String body = objectMapper.writeValueAsString(ingestRequest);
        aiEngineClient.postLongRunning(RAG_DOCUMENTS_ENDPOINT, body);
        log.debug(
                "Ingested file into RAG: id={}, name={}, pages={}",
                file.getId(),
                file.getName(),
                pages.size());
    }

    @SuppressWarnings("unchecked")
    private WorkflowState onToolCall(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesById,
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
            List<Resource> inputFiles = toResources(filesById);
            listener.onProgress(AiWorkflowProgressEvent.executingTool(endpointPath, 1, 1));
            ToolResult result = executeStep(endpointPath, parameters, inputFiles);
            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            response.getRationale(),
                            result.files(),
                            inputFileNames(filesById),
                            result.report()));
        } catch (Exception e) {
            log.error("Failed to execute tool {}: {}", endpointPath, e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue("Tool execution failed: " + e.getMessage()));
        }
    }

    private WorkflowState onPlan(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesById,
            WorkflowTurnRequest previousRequest,
            ProgressListener listener) {
        return runPlan(
                response.getSteps(),
                response.getResumeWith(),
                response.getSummary(),
                filesById,
                previousRequest,
                listener);
    }

    private WorkflowState onAnswer(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesById,
            WorkflowTurnRequest previousRequest,
            ProgressListener listener) {
        return new WorkflowState.Terminal(response);
    }

    @SuppressWarnings("unchecked")
    private WorkflowState runPlan(
            List<Map<String, Object>> steps,
            String resumeWith,
            String summary,
            Map<String, MultipartFile> filesById,
            WorkflowTurnRequest previousRequest,
            ProgressListener listener) {
        if (steps == null || steps.isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue("AI engine returned a plan with no steps."));
        }

        try {
            List<Resource> currentFiles = toResources(filesById);
            // Propagate the *last* non-null report — the terminal step defines the output.
            JsonNode lastReport = null;
            String lastReportTool = null;

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
                        AiWorkflowProgressEvent.executingTool(endpointPath, i + 1, steps.size()));
                ToolResult stepResult = executeStep(endpointPath, parameters, currentFiles);
                currentFiles = stepResult.files();
                if (stepResult.report() != null) {
                    lastReport = stepResult.report();
                    lastReportTool = endpointPath;
                }
            }

            // Multi-turn: if the plan was emitted with resume_with set, the delegate wants
            // Java to re-invoke the orchestrator with any captured report as an artifact.
            if (resumeWith != null && !resumeWith.isBlank() && lastReport != null) {
                WorkflowTurnRequest resumeRequest = new WorkflowTurnRequest();
                resumeRequest.setUserMessage(previousRequest.getUserMessage());
                resumeRequest.setFiles(previousRequest.getFiles());
                resumeRequest.setConversationHistory(previousRequest.getConversationHistory());
                resumeRequest.setArtifacts(new ArrayList<>(previousRequest.getArtifacts()));
                resumeRequest
                        .getArtifacts()
                        .add(
                                new PdfContentExtractor.ToolReportArtifact(
                                        lastReportTool, lastReport));
                resumeRequest.setResumeWith(resumeWith);
                return new WorkflowState.Pending(resumeRequest);
            }

            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            summary, currentFiles, inputFileNames(filesById), lastReport));
        } catch (Exception e) {
            log.error("Failed to execute plan: {}", e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue("Plan execution failed: " + e.getMessage()));
        }
    }

    private static List<String> inputFileNames(Map<String, MultipartFile> filesById) {
        return filesById.values().stream().map(MultipartFile::getOriginalFilename).toList();
    }

    /**
     * Execute a single tool step. If the endpoint accepts multiple files, all files are sent in one
     * call. Otherwise, the endpoint is called once per file. ZIP responses are unpacked so each
     * inner file is treated as its own result (e.g. split outputs a ZIP of pages).
     *
     * <p>A structured {@code report} may be returned alongside (or instead of) files — see {@link
     * ToolResult}. For per-file dispatch (single-input endpoints called once per input), the first
     * non-null report wins.
     */
    private ToolResult executeStep(
            String endpointPath, Map<String, Object> parameters, List<Resource> inputFiles)
            throws IOException {
        List<Resource> files = new ArrayList<>();
        JsonNode report = null;
        if (toolMetadataService.isMultiInput(endpointPath)) {
            ToolResult r = callEndpoint(endpointPath, parameters, inputFiles);
            files.addAll(r.files());
            report = r.report();
        } else {
            for (Resource file : inputFiles) {
                ToolResult r = callEndpoint(endpointPath, parameters, List.of(file));
                files.addAll(r.files());
                if (report == null) {
                    report = r.report();
                }
            }
        }
        return new ToolResult(files, report);
    }

    /**
     * Call an endpoint and return its result files and optional report.
     *
     * <ul>
     *   <li>JSON body (Content-Type: application/json) → the entire body is the report, no files
     *       are returned.
     *   <li>File body (PDF etc.) → the file is returned; if an {@link
     *       AiToolResponseHeaders#TOOL_REPORT} header is present, its (minified JSON) value is
     *       parsed as the report.
     *   <li>ZIP responses declared by the tool metadata service are unpacked so callers always see
     *       a flat list of result files.
     * </ul>
     */
    private ToolResult callEndpoint(
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
        Resource resource = response.getBody();
        HttpHeaders headers = response.getHeaders();
        MediaType contentType = headers.getContentType();

        // JSON-only response — the whole body is the structured report, no result file.
        if (contentType != null && MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
            try (java.io.InputStream is = resource.getInputStream()) {
                JsonNode report = objectMapper.readTree(is);
                return new ToolResult(List.of(), report);
            }
        }

        JsonNode report = parseReportHeader(headers, endpointPath);
        if (toolMetadataService.shouldUnpackZipResponse(endpointPath)) {
            return new ToolResult(ZipExtractionUtils.extractZip(resource, tempFileManager), report);
        }
        return new ToolResult(List.of(resource), report);
    }

    /**
     * Parse the optional {@link AiToolResponseHeaders#TOOL_REPORT} header into a {@link JsonNode},
     * or return null.
     */
    private JsonNode parseReportHeader(HttpHeaders headers, String endpointPath) {
        String raw = headers.getFirst(AiToolResponseHeaders.TOOL_REPORT);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(raw);
        } catch (JacksonException e) {
            log.warn(
                    "Ignoring malformed {} header from {}: {}",
                    AiToolResponseHeaders.TOOL_REPORT,
                    endpointPath,
                    e.getMessage());
            return null;
        }
    }

    private List<Resource> toResources(Map<String, MultipartFile> filesById) throws IOException {
        List<Resource> resources = new ArrayList<>();
        for (MultipartFile file : filesById.values()) {
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
            String summary,
            List<Resource> resultFiles,
            List<String> inputFileNames,
            JsonNode report)
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
        completed.setReport(report);
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
        private List<AiFile> files = new ArrayList<>();
        private List<AiConversationMessage> conversationHistory = new ArrayList<>();
        private List<WorkflowArtifact> artifacts = new ArrayList<>();
        private String resumeWith;
        private List<String> enabledEndpoints = new ArrayList<>();
    }
}
