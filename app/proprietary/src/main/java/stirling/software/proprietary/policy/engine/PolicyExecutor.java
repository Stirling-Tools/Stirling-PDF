package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
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
@Service
@RequiredArgsConstructor
public class PolicyExecutor {

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
     *
     * @param definition the pipeline to run (must have at least one step)
     * @param inputs the initial input files
     * @param listener receives per-step progress
     * @return the final output files plus the last structured report produced, if any
     * @throws InternalApiTimeoutException if a tool does not respond within its read timeout
     * @throws IOException if a tool returns a non-OK response or a file cannot be read
     */
    public PolicyExecutionResult execute(
            PipelineDefinition definition, List<Resource> inputs, PolicyProgressListener listener)
            throws IOException {
        List<PipelineStep> steps = definition.steps();
        if (steps.isEmpty()) {
            throw new IllegalArgumentException("Pipeline definition has no steps");
        }

        List<Resource> currentFiles = inputs;
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
            ToolResult stepResult = executeStep(operation, step.parameters(), currentFiles);
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
     *   <li>JSON body (Content-Type: application/json): the entire body is the report, no files
     *       are returned.
     *   <li>File body (PDF etc.): the file is returned; if an {@link
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
                if (containsStructuredElements(list)) {
                    // Endpoints binding lists of structured objects (e.g. /security/redact's
                    // redactions, /general/edit-text's edits) parse a single JSON string field via
                    // a property editor. Pre-serialize the whole list so binding succeeds.
                    body.add(entry.getKey(), objectMapper.writeValueAsString(list));
                } else {
                    for (Object item : list) {
                        body.add(entry.getKey(), item);
                    }
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

        // JSON-only response: the whole body is the structured report, no result file.
        if (contentType != null && MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
            try (InputStream is = resource.getInputStream()) {
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

    private static boolean containsStructuredElements(List<?> list) {
        for (Object item : list) {
            if (item instanceof Map<?, ?> || item instanceof List<?>) {
                return true;
            }
        }
        return false;
    }
}
