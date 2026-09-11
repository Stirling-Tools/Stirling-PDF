package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

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

import stirling.software.common.service.AutomationRunContext;
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
 * Runs an ordered chain of tool steps, feeding each step's output files into the next.
 *
 * <p>Steps dispatch synchronously via {@link InternalApiClient} loopback HTTP (each tool runs in
 * its own handler, returns its file inline). The caller controls threading. Files cross step
 * boundaries as {@link Resource} temp files and are only persisted at the run boundaries by the
 * caller.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyExecutor {

    private static final String FILTER_OPERATION_PREFIX = "/api/v1/filter/filter-";

    private final InternalApiClient internalApiClient;
    private final ToolMetadataService toolMetadataService;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    // files: result files (one, or many for ZIP-response tools). report: optional structured
    // payload the tool surfaced alongside or instead of a file.
    private record ToolResult(List<Resource> files, JsonNode report) {}

    // A merge can lose its single-source attribution while continuing an input's billing group.
    private record PipelineFile(Resource resource, Integer origin, Integer billingOrigin) {}

    private record StepOutput(List<PipelineFile> files, JsonNode report) {}

    /**
     * Run every step in order, feeding each step's output into the next. Supporting files in {@code
     * inputs} bind to named file fields and never enter the document stream.
     *
     * @throws InternalApiTimeoutException if a tool does not respond within its read timeout
     * @throws IOException on a non-OK tool response, a missing supporting file, or a read failure
     */
    public PolicyExecutionResult execute(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener)
            throws IOException {
        List<PipelineStep> steps = definition.steps();
        if (steps.isEmpty()) {
            throw new IllegalArgumentException("Pipeline definition has no steps");
        }

        List<PipelineFile> currentFiles = new ArrayList<>();
        Map<String, List<Resource>> supportingFiles = inputs.supportingFiles();
        for (int k = 0; k < inputs.primary().size(); k++) {
            currentFiles.add(new PipelineFile(inputs.primary().get(k), k, k));
        }
        // Last non-null report wins: the terminal step defines the output.
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
            StepOutput stepResult = executeStep(step, currentFiles, supportingFiles);
            currentFiles = stepResult.files();
            if (stepResult.report() != null) {
                lastReport = stepResult.report();
                lastReportTool = operation;
            }
            listener.onStepComplete(i + 1, steps.size(), operation);
        }

        return new PolicyExecutionResult(
                currentFiles.stream().map(PipelineFile::resource).toList(),
                currentFiles.stream().map(PipelineFile::origin).toList(),
                lastReport,
                lastReportTool);
    }

    /**
     * Multi-input endpoints get all files in one call; others are called once per file. ZIP
     * responses are unpacked so each inner file is its own result (e.g. split). For per-file
     * dispatch the first non-null report wins.
     */
    private StepOutput executeStep(
            PipelineStep step,
            List<PipelineFile> inputFiles,
            Map<String, List<Resource>> supportingFiles)
            throws IOException {
        List<Resource> resources = inputFiles.stream().map(PipelineFile::resource).toList();
        requireAcceptedTypes(step.operation(), resources);
        List<PipelineFile> files = new ArrayList<>();
        JsonNode report = null;
        if (toolMetadataService.isMultiInput(step.operation())) {
            Integer origin = sharedOrigin(inputFiles);
            // Synchronous, ordered dispatch makes the last surviving input's group the newest,
            // matching SaaS's choice when a merge joins several previously processed documents.
            Integer billingOrigin =
                    inputFiles.isEmpty() ? null : inputFiles.getLast().billingOrigin();
            ToolResult r;
            try (AutomationRunContext.Scope doc = documentScope(billingOrigin)) {
                r = callEndpoint(step, resources, supportingFiles);
            }
            for (Resource file : r.files()) {
                files.add(new PipelineFile(file, origin, billingOrigin));
            }
            report = r.report();
        } else if (inputFiles.isEmpty()) {
            ToolResult r = callEndpoint(step, List.of(), supportingFiles);
            for (Resource file : r.files()) {
                files.add(new PipelineFile(file, null, null));
            }
            report = r.report();
        } else {
            for (PipelineFile input : inputFiles) {
                ToolResult r;
                try (AutomationRunContext.Scope doc = documentScope(input.billingOrigin())) {
                    r = callEndpoint(step, List.of(input.resource()), supportingFiles);
                }
                for (Resource file : r.files()) {
                    files.add(new PipelineFile(file, input.origin(), input.billingOrigin()));
                }
                if (report == null) {
                    report = r.report();
                }
            }
        }
        return new StepOutput(files, report);
    }

    private static Integer sharedOrigin(List<PipelineFile> files) {
        if (files.isEmpty()) {
            return null;
        }
        Integer origin = files.getFirst().origin();
        return files.stream().allMatch(file -> Objects.equals(origin, file.origin()))
                ? origin
                : null;
    }

    private static AutomationRunContext.Scope documentScope(Integer billingOrigin) {
        String runId = AutomationRunContext.current();
        if (runId == null || billingOrigin == null) {
            return () -> {};
        }
        return AutomationRunContext.openDocument(runId + ":" + billingOrigin);
    }

    /**
     * Call an endpoint, returning result files and optional report. Response handling: JSON body is
     * the report with no file; a file body returns the file plus any {@link
     * AiToolResponseHeaders#TOOL_REPORT} header report; ZIP responses (per tool metadata) are
     * unpacked to a flat file list.
     */
    private ToolResult callEndpoint(
            PipelineStep step, List<Resource> files, Map<String, List<Resource>> supportingFiles)
            throws IOException {
        String endpointPath = step.operation();
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        for (Resource file : files) {
            body.add("fileInput", file);
        }
        // Bind supporting files to named tool fields (e.g. stampImage); from the asset store, not
        // the document stream.
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
                body.add(fieldName, asset);
            }
        }
        for (Map.Entry<String, Object> entry : step.parameters().entrySet()) {
            if (entry.getValue() instanceof List<?> list) {
                if (containsStructuredElements(list)) {
                    // These endpoints (e.g. /security/redact redactions, /general/edit-text edits)
                    // bind a list of structured objects from a single JSON string field via a
                    // property editor, so pre-serialize the whole list.
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

        // Filter ops return an empty body to mean "filtered out": drop it rather than forward a
        // zero-byte document.
        if (isFilterOperation(endpointPath) && isEmpty(resource)) {
            return new ToolResult(List.of(), null);
        }

        HttpHeaders headers = response.getHeaders();
        MediaType contentType = headers.getContentType();

        // JSON-only response: whole body is the report, no file.
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

    /** Parse the optional {@link AiToolResponseHeaders#TOOL_REPORT} header, or null. */
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

    /**
     * Fail if any primary-stream file is a type the step rejects. No declared type means anything.
     */
    private void requireAcceptedTypes(String operation, List<Resource> files) throws IOException {
        List<String> accepted = toolMetadataService.getExtensionTypes(false, operation);
        if (accepted == null || accepted.isEmpty()) {
            return;
        }
        for (Resource file : files) {
            if (!matchesType(file, accepted)) {
                // Reports the extension rather than the filename, since this message becomes the
                // run's error and is persisted on the failure record.
                throw new IOException(
                        "Step "
                                + operation
                                + " accepts "
                                + accepted
                                + " but received a '"
                                + extensionOf(file)
                                + "' file");
            }
        }
    }

    /** The file's extension, or {@code unknown} when it has no usable name. */
    private static String extensionOf(Resource file) {
        String filename = file.getFilename();
        if (filename == null) {
            return "unknown";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "unknown";
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
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
