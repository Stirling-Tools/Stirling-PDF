package stirling.software.proprietary.service;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.model.api.ai.AiConversationMessage;
import stirling.software.proprietary.model.api.ai.AiDocumentIngestRequest;
import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail;
import stirling.software.proprietary.model.api.ai.AiFile;
import stirling.software.proprietary.model.api.ai.AiPageText;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileInput;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowPhase;
import stirling.software.proprietary.model.api.ai.AiWorkflowProgressEvent;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowResultFile;
import stirling.software.proprietary.policy.engine.PolicyExecutionResult;
import stirling.software.proprietary.policy.engine.PolicyExecutor;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.security.util.DesktopClientUtils;
import stirling.software.proprietary.service.PdfContentExtractor.LoadedFile;
import stirling.software.proprietary.service.PdfContentExtractor.PdfContentResult;
import stirling.software.proprietary.service.PdfContentExtractor.WorkflowArtifact;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
public class AiWorkflowService {

    private static final String DOCUMENTS_ENDPOINT = "/api/v1/documents";
    private static final String PDF_TO_MARKDOWN_ENDPOINT = "/api/v1/convert/pdf/markdown";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final AiEngineClient aiEngineClient;
    private final PdfContentExtractor pdfContentExtractor;
    private final ObjectMapper objectMapper;
    private final FileStorage fileStorage;
    private final TempFileManager tempFileManager;
    private final FileIdStrategy fileIdStrategy;
    private final AiEngineEndpointResolver endpointResolver;
    private final PolicyExecutor policyExecutor;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;

    public AiWorkflowService(
            CustomPDFDocumentFactory pdfDocumentFactory,
            AiEngineClient aiEngineClient,
            PdfContentExtractor pdfContentExtractor,
            ObjectMapper objectMapper,
            FileStorage fileStorage,
            TempFileManager tempFileManager,
            FileIdStrategy fileIdStrategy,
            AiEngineEndpointResolver endpointResolver,
            PolicyExecutor policyExecutor,
            @Autowired(required = false) UserServiceInterface userService,
            ApplicationProperties applicationProperties) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.aiEngineClient = aiEngineClient;
        this.pdfContentExtractor = pdfContentExtractor;
        this.objectMapper = objectMapper;
        this.fileStorage = fileStorage;
        this.tempFileManager = tempFileManager;
        this.fileIdStrategy = fileIdStrategy;
        this.endpointResolver = endpointResolver;
        this.policyExecutor = policyExecutor;
        this.userService = userService;
        this.applicationProperties = applicationProperties;
    }

    /**
     * How long an AI-workflow-ingested personal doc lives on the engine before the reaper deletes
     * it. Mirrors the configured web JWT lifetime, so a stale cookie can never see data the user
     * has lost their session to. Org-shared content (when we add it) bypasses this and sends a null
     * {@code expiresAt} so it's persistent.
     */
    private Duration personalDocTtl() {
        int minutes = DesktopClientUtils.getWebTokenExpiryMinutes(applicationProperties);
        return Duration.ofMinutes(minutes);
    }

    /**
     * Resolve the currently-authenticated user's id for X-User-Id propagation to the AI engine.
     * Returns null when security is disabled (no UserServiceInterface bean) or no one is logged in.
     * The engine rejects per-user routes (ingest, search) when this is null; non-tenant routes
     * (health, orchestrate without RAG) still work.
     */
    private String currentUserId() {
        return userService != null ? userService.getCurrentUsername() : null;
    }

    @FunctionalInterface
    public interface ProgressListener {
        void onProgress(AiWorkflowProgressEvent event);

        /**
         * Called when the engine emits a keep-alive heartbeat. Default is a no-op; consumers that
         * forward to a downstream connection (e.g. an SSE emitter) override this to push a
         * heartbeat through, so the next downstream-disconnect surfaces immediately rather than
         * waiting for the next real progress event.
         */
        default void onHeartbeat() {}
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
        initialRequest.setConversationHistory(new ArrayList<>(request.getConversationHistory()));
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
        AiWorkflowResponse response = invokeOrchestrator(request, listener);
        return switch (response.getOutcome()) {
            case NEED_CONTENT -> onNeedContent(response, filesById, request, listener);
            case NEED_INGEST -> onNeedIngest(response, filesById, request, listener);
            case CONVERT_MARKDOWN -> onConvertMarkdown(response, filesById, listener);
            case TOOL_CALL -> onToolCall(response, filesById, listener);
            case PLAN -> onPlan(response, filesById, request, listener);
            case ANSWER -> onAnswer(response, filesById, request, listener);
            case GENERATE_FILE -> onGenerateFile(response, listener);
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
        if (filesById.isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue(
                            "No files were uploaded. Please add a PDF to the workbench first."));
        }

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

    /**
     * Deterministically convert each requested PDF to Markdown via the {@code
     * /convert/pdf/markdown} endpoint (backed by {@code PdfMarkdownConverter}) and return the
     * {@code .md} file(s) as a completed result. No AI resume — the conversion output is the final
     * answer.
     */
    private WorkflowState onConvertMarkdown(
            AiWorkflowResponse response,
            Map<String, MultipartFile> filesById,
            ProgressListener listener) {
        List<AiFile> filesToConvert = response.getFilesToIngest();
        if (filesToConvert == null || filesToConvert.isEmpty()) {
            return new WorkflowState.Terminal(
                    cannotContinue(
                            "AI engine requested markdown conversion without listing any files."));
        }

        try {
            List<Resource> resultFiles = new ArrayList<>();
            List<String> inputNames = new ArrayList<>();
            for (int i = 0; i < filesToConvert.size(); i++) {
                AiFile file = filesToConvert.get(i);
                MultipartFile multipartFile = filesById.get(file.getId());
                if (multipartFile == null) {
                    return new WorkflowState.Terminal(
                            cannotContinue(
                                    "AI engine requested markdown conversion for unknown file: "
                                            + file.getName()));
                }
                listener.onProgress(
                        AiWorkflowProgressEvent.executingTool(
                                PDF_TO_MARKDOWN_ENDPOINT, i + 1, filesToConvert.size()));
                Resource input = toResource(multipartFile);
                PipelineDefinition definition =
                        new PipelineDefinition(
                                "convert-markdown",
                                List.of(new PipelineStep(PDF_TO_MARKDOWN_ENDPOINT, Map.of())),
                                null);
                PolicyExecutionResult result =
                        policyExecutor.execute(
                                definition,
                                PolicyInputs.of(List.of(input)),
                                PolicyProgressListener.NOOP);
                resultFiles.addAll(result.files());
                inputNames.add(multipartFile.getOriginalFilename());
            }
            return new WorkflowState.Terminal(
                    buildCompletedResponse(null, resultFiles, inputNames, null));
        } catch (InternalApiTimeoutException e) {
            log.error("PDF to Markdown conversion timed out: {}", e.getMessage());
            return new WorkflowState.Terminal(
                    cannotContinue(toolTimeoutMessage(PDF_TO_MARKDOWN_ENDPOINT, e)));
        } catch (Exception e) {
            AiWorkflowResponse limit = paygLimitResponseOrNull(e);
            if (limit != null) {
                log.info(
                        "AI markdown conversion blocked by downstream entitlement gate ({})",
                        limit.getErrorCode());
                return new WorkflowState.Terminal(limit);
            }
            log.error("Failed to convert PDF to Markdown: {}", e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue(toolFailureMessage(PDF_TO_MARKDOWN_ENDPOINT, e)));
        }
    }

    private Resource toResource(MultipartFile file) throws IOException {
        TempFile tempFile = tempFileManager.createManagedTempFile("ai-workflow");
        file.transferTo(tempFile.getPath());
        final String originalName = Filenames.toSimpleFileName(file.getOriginalFilename());
        return new FileSystemResource(tempFile.getFile()) {
            @Override
            public String getFilename() {
                return originalName;
            }
        };
    }

    private void ingestFile(AiFile file, MultipartFile multipartFile) throws IOException {
        List<AiPageText> pages = new ArrayList<>();
        try (PDDocument document = pdfDocumentFactory.load(multipartFile, true)) {
            int pageCount = document.getNumberOfPages();
            for (int pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
                String pageText = pdfContentExtractor.extractPageTextRaw(document, pageNumber);
                if (pageText != null && !pageText.isBlank()) {
                    pages.add(new AiPageText(pageNumber, pageText));
                }
            }
        }
        // Personal-doc semantics for AI workflows today: caller owns the doc and is its only
        // grantee, with a session-bounded expiry so the reaper cleans up if logout misses.
        // When org / shared-doc ingestion lands, the caller chooses owner, grantees, and
        // expiry (null = persistent) explicitly.
        String callerId = currentUserId();
        AiDocumentIngestRequest ingestRequest =
                new AiDocumentIngestRequest(
                        file.getId(),
                        file.getName(),
                        pages,
                        callerId,
                        callerId == null ? List.of() : List.of(callerId),
                        Instant.now().plus(personalDocTtl()));
        String body = objectMapper.writeValueAsString(ingestRequest);
        aiEngineClient.postLongRunning(DOCUMENTS_ENDPOINT, body, callerId);
        log.debug(
                "Ingested document: id={}, name={}, pages={}",
                file.getId(),
                file.getName(),
                pages.size());
    }

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
            PipelineDefinition definition =
                    new PipelineDefinition(
                            null,
                            List.of(new PipelineStep(endpointPath, parameters)),
                            OutputSpec.inline());
            PolicyExecutionResult result =
                    policyExecutor.execute(
                            definition, PolicyInputs.of(inputFiles), stepProgress(listener));
            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            response.getRationale(),
                            result.files(),
                            inputFileNames(filesById),
                            result.report()));
        } catch (InternalApiTimeoutException e) {
            log.error("Tool {} timed out: {}", endpointPath, e.getMessage());
            return new WorkflowState.Terminal(cannotContinue(toolTimeoutMessage(endpointPath, e)));
        } catch (Exception e) {
            AiWorkflowResponse limit = paygLimitResponseOrNull(e);
            if (limit != null) {
                log.info(
                        "AI workflow tool {} blocked by downstream entitlement gate ({})",
                        endpointPath,
                        limit.getErrorCode());
                return new WorkflowState.Terminal(limit);
            }
            log.error("Failed to execute tool {}: {}", endpointPath, e.getMessage(), e);
            return new WorkflowState.Terminal(cannotContinue(toolFailureMessage(endpointPath, e)));
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

    private WorkflowState onGenerateFile(AiWorkflowResponse response, ProgressListener listener)
            throws IOException {
        String content = response.getGeneratedContent();
        String filename = response.getGeneratedFilename();
        if (content == null || filename == null || filename.isBlank()) {
            return new WorkflowState.Terminal(
                    cannotContinue(
                            "AI engine returned generate_file without content or filename."));
        }
        listener.onProgress(AiWorkflowProgressEvent.of(AiWorkflowPhase.PROCESSING));
        String safeFilename = Filenames.toSimpleFileName(filename);
        byte[] bytes = content.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        org.springframework.core.io.Resource resource =
                new org.springframework.core.io.ByteArrayResource(bytes) {
                    @Override
                    public String getFilename() {
                        return safeFilename;
                    }
                };
        return new WorkflowState.Terminal(
                buildCompletedResponse(response.getSummary(), List.of(resource), List.of(), null));
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

        List<PipelineStep> pipelineSteps = new ArrayList<>();
        for (int i = 0; i < steps.size(); i++) {
            Map<String, Object> step = steps.get(i);
            String endpointPath = (String) step.get("tool");
            if (endpointPath == null || endpointPath.isBlank()) {
                return new WorkflowState.Terminal(
                        cannotContinue("Plan step " + (i + 1) + " has no tool endpoint."));
            }
            Map<String, Object> parameters =
                    step.containsKey("parameters")
                            ? (Map<String, Object>) step.get("parameters")
                            : Map.of();
            pipelineSteps.add(new PipelineStep(endpointPath, parameters));
        }

        try {
            List<Resource> inputFiles = toResources(filesById);
            PipelineDefinition definition =
                    new PipelineDefinition(summary, pipelineSteps, OutputSpec.inline());
            PolicyExecutionResult result =
                    policyExecutor.execute(
                            definition, PolicyInputs.of(inputFiles), stepProgress(listener));

            // Multi-turn: if the plan was emitted with resume_with set, the delegate wants
            // Java to re-invoke the orchestrator with any captured report as an artifact.
            if (resumeWith != null && !resumeWith.isBlank() && result.report() != null) {
                WorkflowTurnRequest resumeRequest = new WorkflowTurnRequest();
                resumeRequest.setUserMessage(previousRequest.getUserMessage());
                resumeRequest.setFiles(previousRequest.getFiles());
                resumeRequest.setConversationHistory(previousRequest.getConversationHistory());
                resumeRequest.setArtifacts(new ArrayList<>(previousRequest.getArtifacts()));
                resumeRequest
                        .getArtifacts()
                        .add(
                                new PdfContentExtractor.ToolReportArtifact(
                                        result.reportTool(), result.report()));
                resumeRequest.setResumeWith(resumeWith);
                return new WorkflowState.Pending(resumeRequest);
            }

            return new WorkflowState.Terminal(
                    buildCompletedResponse(
                            summary, result.files(), inputFileNames(filesById), result.report()));
        } catch (InternalApiTimeoutException e) {
            log.error("Plan step on tool {} timed out: {}", e.getEndpointPath(), e.getMessage());
            return new WorkflowState.Terminal(
                    cannotContinue(toolTimeoutMessage(e.getEndpointPath(), e)));
        } catch (HttpServerErrorException e) {
            String reason = extractDetailFromHttpError(e);
            log.error("Plan step failed (HTTP {}): {}", e.getStatusCode(), reason);
            return new WorkflowState.Terminal(cannotContinue(reason));
        } catch (Exception e) {
            AiWorkflowResponse limit = paygLimitResponseOrNull(e);
            if (limit != null) {
                log.info(
                        "AI workflow plan blocked by downstream entitlement gate ({})",
                        limit.getErrorCode());
                return new WorkflowState.Terminal(limit);
            }
            log.error("Failed to execute plan: {}", e.getMessage(), e);
            return new WorkflowState.Terminal(
                    cannotContinue("Plan execution failed: " + e.getMessage()));
        }
    }

    private static List<String> inputFileNames(Map<String, MultipartFile> filesById) {
        return filesById.values().stream().map(MultipartFile::getOriginalFilename).toList();
    }

    private static String toolTimeoutMessage(String endpointPath, InternalApiTimeoutException e) {
        return String.format(
                "The %s tool did not respond within %d seconds and was aborted. The underlying"
                        + " operation may be hung; try again, run on a smaller file, or use a"
                        + " different approach.",
                endpointPath, e.getReadTimeout().toSeconds());
    }

    private static String toolFailureMessage(String endpointPath, Throwable cause) {
        String reason =
                cause.getMessage() != null ? cause.getMessage() : cause.getClass().getSimpleName();
        return String.format("The %s tool failed: %s", endpointPath, reason);
    }

    /**
     * Extracts the {@code detail} field from an HTTP error response body if it is valid JSON,
     * otherwise falls back to the exception message. This lets controller-level error messages
     * (e.g. missing system dependency) surface cleanly in the chat response.
     */
    private String extractDetailFromHttpError(HttpServerErrorException e) {
        try {
            String body = e.getResponseBodyAsString();
            if (body != null && !body.isBlank()) {
                JsonNode node = objectMapper.readTree(body);
                JsonNode detail = node.get("detail");
                if (detail != null && detail.isTextual() && !detail.asText().isBlank()) {
                    return detail.asText();
                }
            }
        } catch (Exception ignored) {
            // fall through to generic message
        }
        return "The request could not be completed. Please try again or contact your system administrator.";
    }

    /**
     * Adapt the AI workflow's {@link ProgressListener} to the engine's {@link
     * PolicyProgressListener}: each step start maps to an {@code EXECUTING_TOOL} progress event
     * carrying the tool path and 1-based step position, preserving the event shape the frontend
     * already renders.
     */
    private static PolicyProgressListener stepProgress(ProgressListener listener) {
        return new PolicyProgressListener() {
            @Override
            public void onStepStart(int stepIndex, int stepCount, String operation) {
                listener.onProgress(
                        AiWorkflowProgressEvent.executingTool(operation, stepIndex, stepCount));
            }
        };
    }

    private List<Resource> toResources(Map<String, MultipartFile> filesById) throws IOException {
        List<Resource> resources = new ArrayList<>();
        for (MultipartFile file : filesById.values()) {
            resources.add(toResource(file));
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

    /**
     * If {@code e} is a downstream usage-limit block — a 401/402 from a tool call carrying the saas
     * EntitlementGuard's {@code error} sentinel — build a terminal response that carries the
     * structured code (+ {@code subscribed}) through to the client, so it can pop the matching
     * usage-limit modal instead of surfacing the raw "tool failed: 402…" text. Returns null for any
     * other failure, so the caller falls back to its normal tool-failure handling.
     *
     * <p>The agent's tool calls run server-side (loopback HTTP via {@link PolicyExecutor}), so this
     * 402 never reaches the frontend's API-client interceptor that pops the modal for direct calls
     * — same gap the policy auto-run path bridges in {@code PolicyEngine}.
     */
    private AiWorkflowResponse paygLimitResponseOrNull(Throwable e) {
        if (!(e instanceof RestClientResponseException rce)) {
            return null;
        }
        String code = DownstreamEntitlementError.extractCode(rce);
        if (code == null) {
            return null;
        }
        AiWorkflowResponse response = new AiWorkflowResponse();
        response.setOutcome(AiWorkflowOutcome.CANNOT_CONTINUE);
        response.setReason("You've reached your current usage limit.");
        response.setErrorCode(code);
        response.setErrorSubscribed(DownstreamEntitlementError.extractSubscribed(rce));
        return response;
    }

    /**
     * Drive the engine's streaming orchestrator endpoint. Progress events are forwarded to {@code
     * listener} as they arrive (each one keeps the SSE connection to the frontend alive too). The
     * final {@code result} event carries the full {@link AiWorkflowResponse}; an {@code error}
     * event surfaces engine-side failures.
     */
    private AiWorkflowResponse invokeOrchestrator(
            WorkflowTurnRequest request, ProgressListener listener) throws IOException {
        String requestBody = objectMapper.writeValueAsString(request);
        AiWorkflowResponse[] resultHolder = new AiWorkflowResponse[1];
        String[] errorHolder = new String[1];

        aiEngineClient.streamPost(
                "/api/v1/orchestrator",
                requestBody,
                currentUserId(),
                line -> handleStreamLine(line, listener, resultHolder, errorHolder));

        if (errorHolder[0] != null) {
            throw new IOException("AI engine returned error: " + errorHolder[0]);
        }
        if (resultHolder[0] == null) {
            throw new IOException("AI engine stream ended without a result");
        }
        return resultHolder[0];
    }

    private void handleStreamLine(
            String line,
            ProgressListener listener,
            AiWorkflowResponse[] resultHolder,
            String[] errorHolder) {
        try {
            JsonNode node = objectMapper.readTree(line);
            String event = node.path("event").asText();
            switch (event) {
                case "progress" -> {
                    AiEngineProgressDetail detail =
                            objectMapper.treeToValue(node, AiEngineProgressDetail.class);
                    listener.onProgress(AiWorkflowProgressEvent.engineProgress(detail));
                }
                case "result" -> {
                    JsonNode response = node.path("response");
                    resultHolder[0] = objectMapper.treeToValue(response, AiWorkflowResponse.class);
                }
                case "error" -> errorHolder[0] = node.path("message").asText("unknown error");
                case "heartbeat" -> listener.onHeartbeat();
                default -> log.warn("Ignoring unknown engine stream event: {}", event);
            }
        } catch (JacksonException e) {
            log.warn("Failed to parse engine stream line: {}", line, e);
        }
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
