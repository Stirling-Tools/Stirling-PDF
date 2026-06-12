package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.io.Resource;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.service.AiToolResponseHeaders;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs an ordered chain of tool steps, chaining each step's output files into the next step's
 * input.
 *
 * <p>This is the single execution loop for the proprietary surface (AI plans now;
 * manually-triggered runs and watched folders later). Each step is dispatched synchronously via
 * {@link InternalApiClient} loopback HTTP: the tool runs in its own handler and returns its file
 * inline. The caller decides how to run the executor itself (the AI turn loop calls it directly;
 * the engine runs it on a virtual thread for async runs). Files cross step boundaries as {@link
 * Resource} temp files; they are only persisted to durable storage at the run boundaries by the
 * caller.
 */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class PolicyExecutor {

    private static final String FILTER_OPERATION_PREFIX = "/api/v1/filter/filter-";

    private final InternalApiClient internalApiClient;
    private final ToolMetadataService toolMetadataService;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    /**
     * Internal value-class for tool responses. {@code files} holds any result files (typically one;
     * multiple for ZIP-response tools). {@code report} holds an optional structured metadata
     * payload the tool chose to surface alongside (or instead of) a file.
     */
    private record ToolResult(List<Resource> files, JsonNode report) {}

    /**
     * Execute every step in {@code definition} in order, feeding each step's output into the next.
     * Supporting files supplied in {@code inputs} are bound to steps' named file fields and never
     * enter the document stream.
     *
     * @param definition the pipeline to run (must have at least one step)
     * @param inputs the primary documents plus the named supporting-file store
     * @param listener receives per-step progress
     * @return the final output files plus the last structured report produced, if any
     * @throws InternalApiTimeoutException if a tool does not respond within its read timeout
     * @throws IOException if a tool returns a non-OK response, references a missing supporting
     *     file, or a file cannot be read
     */
    public PolicyExecutionResult execute(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener)
            throws IOException {
        List<PipelineStep> steps = definition.steps();
        if (steps.isEmpty()) {
            throw new IllegalArgumentException("Pipeline definition has no steps");
        }

        List<Resource> currentFiles = inputs.primary();
        Map<String, List<Resource>> supportingFiles = inputs.supportingFiles();
        // Propagate the *last* non-null report; the terminal step defines the output.
        JsonNode lastReport = null;
        String lastReportTool = null;

        for (int i = 0; i < steps.size(); i++) {
            PipelineStep step = steps.get(i);
            String operation = step.operation();
            if (operation == null || operation.isBlank()) {
                throw new IllegalArgumentException(
                        "Pipeline step " + (i + 1) + " has no operation");
            }
            listener.onStepStart(i + 1, steps.size(), operation);
            ToolResult stepResult = executeStep(step, currentFiles, supportingFiles);
            currentFiles = stepResult.files();
            if (stepResult.report() != null) {
                lastReport = stepResult.report();
                lastReportTool = operation;
            }
            listener.onStepComplete(i + 1, steps.size(), operation);
        }

        return new PolicyExecutionResult(currentFiles, lastReport, lastReportTool);
    }

    /**
     * Execute a single tool step. If the endpoint accepts multiple files, all files are sent in one
     * call. Otherwise, the endpoint is called once per file. ZIP responses are unpacked so each
     * inner file is treated as its own result (e.g. split outputs a ZIP of pages).
     *
     * <p>A structured {@code report} may be returned alongside (or instead of) files; see {@link
     * ToolResult}. For per-file dispatch (single-input endpoints called once per input), the first
     * non-null report wins.
     */
    private ToolResult executeStep(
            PipelineStep step,
            List<Resource> inputFiles,
            Map<String, List<Resource>> supportingFiles)
            throws IOException {
        requireAcceptedTypes(step.operation(), inputFiles);
        List<Resource> files = new ArrayList<>();
        JsonNode report = null;
        if (toolMetadataService.isMultiInput(step.operation())) {
            ToolResult r = callEndpoint(step, inputFiles, supportingFiles);
            files.addAll(r.files());
            report = r.report();
        } else {
            for (Resource file : inputFiles) {
                ToolResult r = callEndpoint(step, List.of(file), supportingFiles);
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
     *   <li>JSON body (Content-Type: application/json): the entire body is the report, no files are
     *       returned.
     *   <li>File body (PDF etc.): the file is returned; if an {@link
     *       AiToolResponseHeaders#TOOL_REPORT} header is present, its (minified JSON) value is
     *       parsed as the report.
     *   <li>ZIP responses declared by the tool metadata service are unpacked so callers always see
     *       a flat list of result files.
     * </ul>
     */
    private ToolResult callEndpoint(
            PipelineStep step, List<Resource> files, Map<String, List<Resource>> supportingFiles)
            throws IOException {
        String endpointPath = step.operation();
        Map<String, List<Object>> body = new LinkedHashMap<>();
        for (Resource file : files) {
            addToBody(body, "fileInput", file);
        }
        // Bind supporting files to their named tool fields (e.g. stampImage, overlayFiles). These
        // come from the run's named asset store, not the document stream.
        for (Map.Entry<String, String> binding : step.fileParameters().entrySet()) {
            String fieldName = binding.getKey();
            String assetKey = binding.getValue();
            List<Resource> assets = supportingFiles.get(assetKey);
            if (assets == null || assets.isEmpty()) {
                throw new IOException(
                        "Step "
                                + endpointPath
                                + " references supporting file '"
                                + assetKey
                                + "' for field '"
                                + fieldName
                                + "' but no such file was provided");
            }
            for (Resource asset : assets) {
                addToBody(body, fieldName, asset);
            }
        }
        for (Map.Entry<String, Object> entry : step.parameters().entrySet()) {
            if (entry.getValue() instanceof List<?> list) {
                if (containsStructuredElements(list)) {
                    // Endpoints binding lists of structured objects (e.g. /security/redact's
                    // redactions, /general/edit-text's edits) parse a single JSON string field via
                    // a property editor. Pre-serialize the whole list so binding succeeds.
                    addToBody(body, entry.getKey(), objectMapper.writeValueAsString(list));
                } else {
                    for (Object item : list) {
                        addToBody(body, entry.getKey(), item);
                    }
                }
            } else {
                addToBody(body, entry.getKey(), entry.getValue());
            }
        }
        // The migrated InternalApiClient takes a Map<String, List<Object>> (replacing Spring's
        // MultiValueMap) and returns a jakarta.ws.rs.core.Response.
        Response response = internalApiClient.post(endpointPath, body);
        if (response.getStatus() != Response.Status.OK.getStatusCode()
                || response.getEntity() == null) {
            throw new IOException(
                    "Tool returned HTTP " + response.getStatus() + " for " + endpointPath);
        }
        Resource resource = (Resource) response.getEntity();

        // Filter operations return an empty body to signal the file was filtered out: drop it
        // rather than forwarding a zero-byte document.
        if (isFilterOperation(endpointPath) && isEmpty(resource)) {
            return new ToolResult(List.of(), null);
        }

        MediaType contentType = response.getMediaType();

        // JSON-only response: the whole body is the structured report, no result file.
        if (contentType != null && MediaType.APPLICATION_JSON_TYPE.isCompatible(contentType)) {
            try (InputStream is = resource.getInputStream()) {
                JsonNode report = objectMapper.readTree(is);
                return new ToolResult(List.of(), report);
            }
        }

        JsonNode report = parseReportHeader(response, endpointPath);
        if (toolMetadataService.shouldUnpackZipResponse(endpointPath)) {
            return new ToolResult(ZipExtractionUtils.extractZip(resource, tempFileManager), report);
        }
        return new ToolResult(List.of(resource), report);
    }

    /**
     * Parse the optional {@link AiToolResponseHeaders#TOOL_REPORT} header into a {@link JsonNode},
     * or return null.
     */
    private JsonNode parseReportHeader(Response response, String endpointPath) {
        String raw = response.getHeaderString(AiToolResponseHeaders.TOOL_REPORT);
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

    /** Append a value to the multi-valued form body (replaces Spring's MultiValueMap#add). */
    private static void addToBody(Map<String, List<Object>> body, String name, Object value) {
        body.computeIfAbsent(name, k -> new ArrayList<>()).add(value);
    }

    private static boolean containsStructuredElements(List<?> list) {
        for (Object item : list) {
            if (item instanceof Map<?, ?> || item instanceof List<?>) {
                return true;
            }
        }
        return false;
    }

    /**
     * Fail the run if any document in the primary stream is not a file type the step accepts. An
     * endpoint that declares no specific input type accepts anything.
     */
    private void requireAcceptedTypes(String operation, List<Resource> files) throws IOException {
        List<String> accepted = toolMetadataService.getExtensionTypes(false, operation);
        if (accepted == null || accepted.isEmpty()) {
            return;
        }
        for (Resource file : files) {
            if (!matchesType(file, accepted)) {
                throw new IOException(
                        "Step "
                                + operation
                                + " accepts "
                                + accepted
                                + " but received '"
                                + file.getFilename()
                                + "'");
            }
        }
    }

    private static boolean matchesType(Resource file, List<String> acceptedExtensions) {
        String filename = file.getFilename();
        if (filename == null) {
            return false;
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return false;
        }
        return acceptedExtensions.contains(filename.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private static boolean isFilterOperation(String operation) {
        return operation.startsWith(FILTER_OPERATION_PREFIX);
    }

    private static boolean isEmpty(Resource resource) {
        try {
            return resource.contentLength() == 0;
        } catch (IOException e) {
            return false;
        }
    }
}
